import React, {useCallback, useEffect, useRef, useState} from 'react'
import os from 'node:os'
import {Box, Text, useApp, useInput, useStdout} from 'ink'
import SelectInput, {type IndicatorProps, type ItemProps} from 'ink-select-input'
import Spinner from 'ink-spinner'
import {FramedInput} from './components/framed-input.js'
import {FullScreen} from './components/fullscreen.js'
import {Logo, LOGO_HEIGHT} from './components/logo.js'
import {Panel} from './components/panel.js'
import {ProgressBar} from './components/progress-bar.js'
import {Shortcuts} from './components/shortcuts.js'
import {TextInput} from './components/text-input.js'
import {clickTargetAt, findFrameRow, frameRowSpan, type ClickTarget} from './lib/click-map.js'
import {formatBytes, formatDuration, formatEta, formatSpeed, shortenPath, truncate, wrapText} from './lib/format.js'
import {addToHistory, loadHistory} from './lib/history.js'
import {detectPlatform, isProbablyUrl, type Platform} from './lib/platforms.js'
import {loadDownloadDirectory, saveDownloadDirectory} from './lib/settings.js'
import {useMouseClick} from './lib/use-mouse-click.js'
import {nextThemeMode, ThemeProvider, type ThemeMode, useTheme} from './theme.js'
import {
  buildChoices,
  buildPlaylistChoices,
  download,
  ensureYtDlp,
  findFfmpeg,
  probe,
  probeVideo,
  type DownloadChoice,
  type DownloadProgress,
  type PlaylistEntry,
  type PlaylistInfo,
  type VideoInfo,
} from './lib/ytdlp.js'

const BONK_BUTTON = 'BONK'
const DONE_LABEL = '↵ hit another'
const DOWNLOAD_ALL_LABEL = '▶ download all clips'
const TAGLINE = 'MEDIA IN. EDIT-READY OUT.'
const SUBLINE = 'youtube  /  x  /  instagram  /  threads  /  tiktok  /  snapchat'

const choiceLabel = (choice: DownloadChoice) => `${choice.kind === 'audio' ? '♪ ' : '▶ '}${choice.label}`

function entryLabel(entry: PlaylistEntry, index: number, width: number): string {
  const prefix = `${index + 1}. `
  const duration = entry.duration ? ` · ${formatDuration(entry.duration)}` : ''
  const budget = Math.max(12, width - prefix.length - duration.length)
  return `${prefix}${truncate(entry.title, budget)}${duration}`
}

function ChoiceIndicator({isSelected}: IndicatorProps) {
  const theme = useTheme()
  return (
    <Box marginRight={1}>
      <Text color={theme.accent}>{isSelected ? '◆' : '·'}</Text>
    </Box>
  )
}

function ChoiceItem({isSelected, label}: ItemProps) {
  const theme = useTheme()
  return (
    <Text
      color={isSelected ? theme.primary : theme.muted}
      backgroundColor={isSelected ? theme.surfaceAlt : undefined}
      bold={isSelected}
    >
      {label}
    </Text>
  )
}

// explicit blank lines — empty <Box height={1}/> spacers can collapse, and
// ink boxes default to flexShrink=1, so spacers are the first thing yoga
// crushes when content overflows the terminal
const Gap = ({lines = 1}: {lines?: number}) => (
  <Box flexDirection="column" flexShrink={0}>
    {Array.from({length: lines}, (_, i) => (
      <Text key={i}> </Text>
    ))}
  </Box>
)

// fixed-width slots — the centered line must not change width as values tick,
// otherwise the whole layout shifts on every progress update
function partLabel(progress: DownloadProgress): string {
  // explains the bar resetting between files (video, then audio)
  return progress.totalParts > 1 ? `part ${progress.part + 1}/${progress.totalParts}  ` : ''
}

function downloadMeta(progress: DownloadProgress): string {
  const speed = progress.speed ? formatSpeed(progress.speed) : ''
  const eta = progress.eta ? `${formatEta(progress.eta)} left` : ''
  return `${partLabel(progress)}${speed.padStart(10)}  ${eta.padEnd(12)}`
}

function indeterminateMeta(progress: DownloadProgress): string {
  const bytes = formatBytes(progress.downloadedBytes)
  const speed = progress.speed ? formatSpeed(progress.speed) : ''
  return `${partLabel(progress)}${bytes.padStart(8)}  ${speed.padEnd(10)}`
}

export type Outcome = {filepath?: string}

type Phase =
  | {name: 'input'; warning?: string}
  | {name: 'probing'; status: string}
  | {name: 'picking-video'}
  | {name: 'picking'}
  | {name: 'location'; error?: string}
  | {
      name: 'downloading'
      choice: DownloadChoice
      progress?: DownloadProgress
      processing: boolean
      refreshing?: boolean
      batch?: {current: number; total: number; title: string}
    }
  | {name: 'done'; filepath: string; downloadedCount?: number}
  | {name: 'error'; message: string}

const HINTS: Record<Phase['name'], Array<[string, string]>> = {
  input: [
    ['↵', 'bonk'],
    ['^c', 'bail'],
  ],
  probing: [
    ['esc', 'abort'],
    ['^c', 'bail'],
  ],
  'picking-video': [
    ['↑↓', 'scroll'],
    ['↵', 'this one'],
    ['esc', 'back'],
    ['^c', 'bail'],
  ],
  picking: [
    ['↑↓', 'scroll'],
    ['↵', 'bonk'],
    ['esc', 'back'],
    ['^c', 'bail'],
  ],
  location: [
    ['↵', 'set folder'],
    ['esc', 'cancel'],
    ['^c', 'bail'],
  ],
  downloading: [
    ['esc', 'abort'],
    ['^c', 'bail'],
  ],
  done: [['^c', 'bail']],
  error: [
    ['↵', 'retry'],
    ['^c', 'bail'],
  ],
}

type AppProps = {
  initialUrl?: string
  clipboardUrl?: string
  initialThemeMode?: ThemeMode
  onOutcome: (outcome: Outcome) => void
}

export function App({initialThemeMode = 'dark', ...props}: AppProps) {
  const [themeMode, setThemeMode] = useState(initialThemeMode)
  const cycleTheme = useCallback(() => {
    setThemeMode(nextThemeMode)
  }, [])

  return (
    <ThemeProvider mode={themeMode}>
      <AppContent {...props} cycleTheme={cycleTheme} />
    </ThemeProvider>
  )
}

function AppContent({
  initialUrl,
  clipboardUrl,
  onOutcome,
  cycleTheme,
}: {
  initialUrl?: string
  clipboardUrl?: string
  onOutcome: (outcome: Outcome) => void
  cycleTheme: () => void
}) {
  const theme = useTheme()
  const {exit} = useApp()
  const {stdout} = useStdout()
  const [url, setUrl] = useState(initialUrl ?? '')
  const [urlInput, setUrlInput] = useState('')
  const [downloadDir, setDownloadDir] = useState(loadDownloadDirectory)
  const [locationInput, setLocationInput] = useState('')
  const [history, setHistory] = useState(loadHistory)
  const [platform, setPlatform] = useState<Platform>()
  const [info, setInfo] = useState<VideoInfo>()
  const [playlist, setPlaylist] = useState<PlaylistInfo>()
  const [downloadAll, setDownloadAll] = useState(false)
  const [choices, setChoices] = useState<DownloadChoice[]>([])
  const ytdlpRef = useRef('')
  const highlightRef = useRef(0) // choice under the cursor, for the ↵ hint click
  const entryHighlightRef = useRef(0)
  const playlistUrlRef = useRef<string | undefined>(undefined)
  const infoJsonRef = useRef<string | undefined>(undefined)
  const abortRef = useRef<AbortController | undefined>(undefined)
  const locationReturnRef = useRef<Phase>({name: 'input'})
  const [phase, setPhase] = useState<Phase>(initialUrl ? {name: 'probing', status: 'cracking knuckles…'} : {name: 'input'})

  const columns = stdout?.columns && stdout.columns > 0 ? stdout.columns : 80
  const rows = stdout?.rows && stdout.rows > 0 ? stdout.rows : 24
  const boxWidth = Math.max(16, Math.min(72, columns - 6))
  const contentWidth = Math.max(10, Math.min(columns - 4, 78))
  // leave room for the six-line wordmark, panel chrome, and footer keycaps
  const listLimit = Math.max(3, Math.min(8, rows - 20))
  const showSubline = rows >= 27
  const playlistDuration = playlist?.entries.every(entry => entry.duration && entry.duration > 0)
    ? playlist.entries.reduce((total, entry) => total + (entry.duration ?? 0), 0)
    : undefined

  const applyVideoProbe = useCallback((
    videoInfo: VideoInfo,
    infoJsonPath: string,
    videoUrl: string,
    all = false,
    playlistEntries: PlaylistEntry[] = [],
  ) => {
    infoJsonRef.current = infoJsonPath
    setUrl(videoUrl)
    setPlatform(detectPlatform(videoUrl))
    setInfo(videoInfo)
    setDownloadAll(all)
    setChoices(all ? buildPlaylistChoices(videoInfo, playlistEntries) : buildChoices(videoInfo))
    highlightRef.current = 0
    setPhase({name: 'picking'})
  }, [])

  const startProbe = useCallback(async (targetUrl: string) => {
    const controller = new AbortController()
    abortRef.current = controller
    setPlatform(detectPlatform(targetUrl))
    setPlaylist(undefined)
    setInfo(undefined)
    setChoices([])
    setPhase({name: 'probing', status: 'cracking knuckles…'})
    try {
      const ytdlp =
        ytdlpRef.current ||
        (await ensureYtDlp(status => setPhase({name: 'probing', status}), controller.signal))
      ytdlpRef.current = ytdlp
      if (controller.signal.aborted) return
      setPhase({name: 'probing', status: 'reading the room…'})
      const outcome = await probe(ytdlp, targetUrl, controller.signal)
      if (controller.signal.aborted) return
      if (outcome.kind === 'playlist') {
        setPlaylist(outcome.playlist)
        playlistUrlRef.current = targetUrl
        entryHighlightRef.current = -1
        setPhase({name: 'picking-video'})
        return
      }
      applyVideoProbe(outcome.info, outcome.infoJsonPath, targetUrl)
    } catch (error) {
      if (controller.signal.aborted) return
      setPhase({name: 'error', message: error instanceof Error ? error.message : String(error)})
    }
  }, [applyVideoProbe])

  useEffect(() => {
    if (initialUrl) void startProbe(initialUrl)
  }, [initialUrl, startProbe])

  const resetToInput = useCallback(() => {
    setUrl('')
    setUrlInput('')
    setPlatform(undefined)
    setInfo(undefined)
    setPlaylist(undefined)
    setDownloadAll(false)
    playlistUrlRef.current = undefined
    setChoices([])
    setPhase({name: 'input'})
  }, [])

  const cancelRun = useCallback(() => {
    const retryUrl = playlistUrlRef.current ?? url
    abortRef.current?.abort()
    resetToInput()
    setUrlInput(retryUrl) // keep the original playlist link around on a batch cancel
  }, [resetToInput, url])

  const backFromFormatPicker = useCallback(() => {
    if (playlist && playlist.entries.length > 1) {
      setInfo(undefined)
      setDownloadAll(false)
      setChoices([])
      infoJsonRef.current = undefined
      highlightRef.current = 0
      setPhase({name: 'picking-video'})
      return
    }
    resetToInput()
  }, [playlist, resetToInput])

  const openLocationPicker = useCallback(() => {
    if (phase.name === 'probing' || phase.name === 'downloading' || phase.name === 'location') return
    locationReturnRef.current = phase
    setLocationInput(downloadDir)
    setPhase({name: 'location'})
  }, [downloadDir, phase])

  const closeLocationPicker = useCallback(() => {
    setPhase(locationReturnRef.current)
  }, [])

  const handleLocationSubmit = (value: string) => {
    try {
      const resolved = saveDownloadDirectory(value)
      setDownloadDir(resolved)
      setPhase(locationReturnRef.current)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      setPhase({name: 'location', error: `couldn’t use that folder — ${detail}`})
    }
  }

  useInput(
    (input, key) => {
      if (key.ctrl && input === 't') {
        cycleTheme()
        return
      }
      if (key.ctrl && input === 'l') {
        openLocationPicker()
        return
      }
      if (key.escape && phase.name === 'location') {
        closeLocationPicker()
        return
      }
      if (key.escape && phase.name === 'picking') backFromFormatPicker()
      if (key.escape && (phase.name === 'picking-video' || phase.name === 'error' || phase.name === 'done')) {
        resetToInput()
      }
      if (key.escape && (phase.name === 'probing' || phase.name === 'downloading')) cancelRun()
      if (key.return && (phase.name === 'error' || phase.name === 'done')) resetToInput()
    },
    {isActive: Boolean(process.stdin.isTTY)},
  )

  const handleUrlSubmit = (value: string) => {
    const trimmed = value.trim()
    if (!isProbablyUrl(trimmed)) {
      setPhase({name: 'input', warning: 'not a url, pal — need the full https:// thing'})
      return
    }
    setUrl(trimmed)
    void startProbe(trimmed)
  }

  const clipboardOffered = Boolean(clipboardUrl) && urlInput === ''
  const clipboardAccepted = Boolean(clipboardUrl) && urlInput === clipboardUrl

  const handleEntryPick = (item: {value: number}) => {
    const all = item.value === -1
    const entry = all ? playlist?.entries[0] : playlist?.entries[item.value]
    if (!entry) return
    const controller = new AbortController()
    abortRef.current = controller
    setPhase({name: 'probing', status: all ? 'sizing up the whole playlist…' : 'locking onto that clip…'})
    void (async () => {
      try {
        const ytdlp = ytdlpRef.current
        const result = await probeVideo(ytdlp, entry.url, controller.signal)
        if (controller.signal.aborted) return
        applyVideoProbe(result.info, result.infoJsonPath, entry.url, all, playlist?.entries)
      } catch (error) {
        if (controller.signal.aborted) return
        setPhase({name: 'error', message: error instanceof Error ? error.message : String(error)})
      }
    })()
  }

  const handlePick = (item: {value: number}) => {
    const choice = choices[item.value]
    const controller = new AbortController()
    abortRef.current = controller
    setPhase({name: 'downloading', choice, processing: false})
    void (async () => {
      const handlers = {
        onProgress: (progress: DownloadProgress) =>
          setPhase(prev => (prev.name === 'downloading' ? {...prev, progress, processing: false} : prev)),
        onProcessing: () =>
          setPhase(prev => (prev.name === 'downloading' ? {...prev, processing: true} : prev)),
      }
      try {
        const ffmpegLocation = await findFfmpeg()
        const downloadOne = async (
          videoUrl: string,
          title: string | undefined,
          infoJsonPath?: string,
        ): Promise<string> => {
          const base = {
            ytdlp: ytdlpRef.current,
            ffmpegLocation,
            url: videoUrl,
            choice,
            outDir: downloadDir,
            title,
          }
          try {
            // reuse probe metadata when available — starts without re-extracting
            return await download({...base, infoJsonPath}, handlers, controller.signal)
          } catch (error) {
            if (controller.signal.aborted) throw error
            // cached media urls can expire — retry with a fresh extraction
            setPhase(prev =>
              prev.name === 'downloading' ? {...prev, progress: undefined, refreshing: true} : prev,
            )
            return download(base, handlers, controller.signal)
          }
        }

        if (downloadAll && playlist) {
          for (const [index, entry] of playlist.entries.entries()) {
            setPhase(prev =>
              prev.name === 'downloading'
                ? {
                    ...prev,
                    progress: undefined,
                    processing: false,
                    refreshing: false,
                    batch: {current: index + 1, total: playlist.entries.length, title: entry.title},
                  }
                : prev,
            )
            const result =
              index === 0 && info && infoJsonRef.current
                ? {info, infoJsonPath: infoJsonRef.current}
                : await probeVideo(ytdlpRef.current, entry.url, controller.signal)
            await downloadOne(entry.url, result.info.title || entry.title, result.infoJsonPath)
          }
          const playlistUrl = playlistUrlRef.current ?? url
          onOutcome({filepath: downloadDir})
          setHistory(addToHistory(playlistUrl))
          setPhase({name: 'done', filepath: downloadDir, downloadedCount: playlist.entries.length})
        } else {
          const filepath = await downloadOne(url, info?.title, infoJsonRef.current)
          onOutcome({filepath})
          setHistory(addToHistory(url))
          setPhase({name: 'done', filepath})
        }
      } catch (error) {
        if (controller.signal.aborted) return
        setPhase({name: 'error', message: error instanceof Error ? error.message : String(error)})
      }
    })()
  }

  let hints: Array<[string, string]> = [...HINTS[phase.name], ['^t', `skin:${theme.mode}`]]
  if (phase.name !== 'probing' && phase.name !== 'downloading' && phase.name !== 'location') {
    hints = [hints[0]!, ['^l', 'location'], ...hints.slice(1)]
  }
  if (phase.name === 'input' && history.length > 0) {
    hints = [hints[0]!, ['↑', 'recent'], ...hints.slice(1)]
  }

  // Anything a mouse user would expect to press is clickable. Targets are
  // found by their text in the rendered frame (see lib/click-map.ts), so
  // there is no layout math to keep in sync.
  const hintAction = (key: string): (() => void) | undefined => {
    if (key === '^c') return () => exit()
    if (key === '^t') return cycleTheme
    if (key === '^l') return openLocationPicker
    if (key === 'esc') {
      if (phase.name === 'probing' || phase.name === 'downloading') return cancelRun
      if (phase.name === 'location') return closeLocationPicker
      if (phase.name === 'picking') return backFromFormatPicker
      return resetToInput
    }
    if (key === '↵') {
      if (phase.name === 'input') return () => handleUrlSubmit(urlInput)
      if (phase.name === 'location') return () => handleLocationSubmit(locationInput)
      if (phase.name === 'picking-video') return () => handleEntryPick({value: entryHighlightRef.current})
      if (phase.name === 'picking') return () => handlePick({value: highlightRef.current})
      if (phase.name === 'error' || phase.name === 'done') return resetToInput
    }
    return undefined // ↑↓ / ↑ stay keyboard-only
  }
  const clickTargets: ClickTarget[] = []
  if (phase.name === 'input') {
    // the frame button rows above/below the label are part of the button
    clickTargets.push({match: ` ${BONK_BUTTON} ↗ `, padY: 1, action: () => handleUrlSubmit(urlInput)})
  }
  if (phase.name === 'location') {
    clickTargets.push({match: ' SET ↗ ', padY: 1, action: () => handleLocationSubmit(locationInput)})
  }
  if (phase.name === 'picking-video' && playlist) {
    const labelWidth = Math.max(20, Math.min(44, contentWidth - 34))
    clickTargets.push({match: DOWNLOAD_ALL_LABEL, action: () => handleEntryPick({value: -1})})
    for (const [index, entry] of playlist.entries.entries()) {
      clickTargets.push({
        match: entryLabel(entry, index, labelWidth),
        action: () => handleEntryPick({value: index}),
      })
    }
  }
  if (phase.name === 'picking') {
    for (const [index, choice] of choices.entries()) {
      clickTargets.push({match: choiceLabel(choice), action: () => handlePick({value: index})})
    }
  }
  if (phase.name === 'done') {
    clickTargets.push({match: DONE_LABEL, padX: 4, padY: 1, action: resetToInput})
  }
  for (const [key, label] of hints) {
    const action = hintAction(key)
    if (action) clickTargets.push({match: `${key}  ${label}`, action})
  }

  useMouseClick(
    (x, y) => {
      // the logo takes you home — it sits one gap above the tagline
      const taglineRow = findFrameRow(TAGLINE)
      if (
        taglineRow > LOGO_HEIGHT &&
        y - 1 >= taglineRow - LOGO_HEIGHT - 1 &&
        y - 1 <= taglineRow - 2
      ) {
        const span = frameRowSpan(y - 1)
        if (span && x >= span[0] - 1 && x <= span[1] + 1) {
          if (phase.name === 'probing' || phase.name === 'downloading') cancelRun()
          else if (phase.name !== 'input') resetToInput()
          return
        }
      }
      clickTargetAt(x, y, clickTargets)?.action()
    },
    Boolean(process.stdin.isTTY),
  )

  return (
    <FullScreen>
      <Logo compact={columns < 64} />
      <Gap />
      <Text color={theme.primary} bold>{TAGLINE}</Text>
      {showSubline ? <Text color={theme.muted}>{SUBLINE}</Text> : null}
      <Gap />

      {phase.name === 'input' && (
        <Box flexDirection="column" alignItems="center">
          <FramedInput title="Source URL" width={boxWidth} button={BONK_BUTTON}>
            <TextInput
              value={urlInput}
              onChange={setUrlInput}
              onSubmit={handleUrlSubmit}
              placeholder="Paste a video or playlist link…"
              width={Math.max(10, boxWidth - 17)}
              history={history}
              submitOnPaste={isProbablyUrl}
              onTab={() => {
                if (clipboardOffered) setUrlInput(clipboardUrl!)
              }}
            />
          </FramedInput>
          {phase.warning ? (
            <Text color={theme.muted}>✗ {phase.warning}</Text>
          ) : clipboardOffered ? (
            <Text color={theme.muted}>clipboard’s holding a link — ⇥ to snag it</Text>
          ) : clipboardAccepted ? (
            <Text color={theme.muted}>snagged from clipboard — ↵ to bonk</Text>
          ) : (
            <Text color={theme.muted}>
              saves to · {shortenPath(downloadDir, os.homedir(), 48)}
            </Text>
          )}
        </Box>
      )}

      {phase.name === 'probing' && (
        <Box flexDirection="column" alignItems="center">
          <FramedInput title={platform ? `${platform.label} source` : 'Source URL'} width={boxWidth} button={BONK_BUTTON} buttonDim>
            <Text color={theme.muted}>{url.length > boxWidth - 8 ? `${url.slice(0, boxWidth - 9)}…` : url}</Text>
          </FramedInput>
        </Box>
      )}

      {phase.name === 'location' && (
        <Box flexDirection="column" alignItems="center">
          <FramedInput title="Download folder" width={boxWidth} button="SET">
            <TextInput
              value={locationInput}
              onChange={setLocationInput}
              onSubmit={handleLocationSubmit}
              placeholder="~/Downloads"
              width={Math.max(10, boxWidth - 16)}
            />
          </FramedInput>
          {phase.error ? (
            <Text color={theme.accentSecondary}>✗ {phase.error}</Text>
          ) : (
            <Text color={theme.muted}>relative paths start from {truncate(process.cwd(), 42)}</Text>
          )}
        </Box>
      )}

      {phase.name === 'picking-video' && playlist && (
        <Box width={contentWidth}>
          <Box flexDirection="column" flexGrow={1} flexBasis={0} paddingTop={1} paddingRight={3}>
            {wrapText(playlist.title, Math.max(10, contentWidth - 41)).map((line, index) => (
              <Text key={index} bold color={theme.primary}>
                {line}
              </Text>
            ))}
            <Gap />
            <Text color={theme.muted}>
              ▸ playlist
              {platform ? ` · ${platform.label}` : ''}
              {` · ${playlist.entries.length} clips`}
              {playlist.uploader ? ` · ${playlist.uploader}` : ''}
            </Text>
            <Gap />
            <Text color={theme.muted}>one clip or the whole lineup?</Text>
          </Box>
          <Panel title="Lineup" width={Math.min(48, Math.max(34, contentWidth - 28))}>
            <SelectInput
              indicatorComponent={ChoiceIndicator}
              itemComponent={ChoiceItem}
              limit={listLimit}
              items={[
                {key: 'download-all', label: DOWNLOAD_ALL_LABEL, value: -1},
                ...playlist.entries.map((entry, index) => ({
                  key: entry.id || String(index),
                  label: entryLabel(entry, index, Math.min(42, contentWidth - 34)),
                  value: index,
                })),
              ]}
              onSelect={handleEntryPick}
              onHighlight={item => (entryHighlightRef.current = item.value)}
            />
          </Panel>
        </Box>
      )}

      {phase.name === 'picking' && platform && (
        <Box width={contentWidth}>
          <Box flexDirection="column" flexGrow={1} flexBasis={0} paddingTop={1} paddingRight={3}>
            {!downloadAll && wrapText(info?.title ?? '', Math.max(10, contentWidth - 41)).map((line, index) => (
              <Text key={index} bold color={theme.primary}>
                {line}
              </Text>
            ))}
            {downloadAll && playlist ? (
              <Text bold color={theme.primary}>All {playlist.entries.length} clips</Text>
            ) : null}
            <Gap />
            <Text color={theme.muted}>
              ▸ {downloadAll ? 'playlist' : platform.label}
              {downloadAll
                ? playlistDuration
                  ? ` · ${formatDuration(playlistDuration)}`
                  : ''
                : info?.duration
                  ? ` · ${formatDuration(info.duration)}`
                  : ''}
              {!downloadAll && info?.uploader ? ` · ${info.uploader}` : ''}
            </Text>
            {playlist && !downloadAll ? (
              <Text color={theme.muted}>out of · {truncate(playlist.title, 28)}</Text>
            ) : null}
          </Box>
          <Panel title="Quality" width={38}>
            <SelectInput
              indicatorComponent={ChoiceIndicator}
              itemComponent={ChoiceItem}
              limit={listLimit}
              items={choices.map((choice, index) => ({
                key: String(index),
                label: choiceLabel(choice),
                value: index,
              }))}
              onSelect={handlePick}
              onHighlight={item => (highlightRef.current = item.value)}
            />
          </Panel>
        </Box>
      )}

      {phase.name === 'downloading' && (
        <Box flexDirection="column" alignItems="center">
          <Text color={theme.muted}>
            {phase.batch
              ? `${phase.batch.current}/${phase.batch.total} · ${truncate(phase.batch.title, 36)} · `
              : info?.title
                ? `${truncate(info.title, 42)} · `
                : ''}
            {phase.choice.label}
          </Text>
          <Gap />
          {phase.processing ? (
            <>
              <ProgressBar percent={1} />
              <Gap />
              <Text>
                <Text color={theme.accent}>
                  <Spinner type="dots" />
                </Text>
                <Text color={theme.muted}> polishing for premiere…</Text>
              </Text>
            </>
          ) : phase.progress?.totalBytes ? (
            <>
              <ProgressBar percent={phase.progress.downloadedBytes / phase.progress.totalBytes} />
              <Gap />
              <Text color={theme.muted}>{downloadMeta(phase.progress)}</Text>
            </>
          ) : phase.progress ? (
            <>
              <Text>
                <Text color={theme.accent}>
                  <Spinner type="dots" />
                </Text>
                <Text color={theme.muted}> yeeting bits…</Text>
              </Text>
              <Gap />
              <Text color={theme.muted}>{indeterminateMeta(phase.progress)}</Text>
            </>
          ) : (
            <>
              <ProgressBar percent={0} />
              <Gap />
              <Text>
                <Text color={theme.accent}>
                  <Spinner type="dots" />
                </Text>
                <Text color={theme.muted}>
                  {phase.refreshing ? ' link went stale — fresh swing…' : ' winding up…'}
                </Text>
              </Text>
            </>
          )}
        </Box>
      )}

      {phase.name === 'done' && (
        <Box flexDirection="column" alignItems="center">
          <Text>
            <Text bold color={theme.accent}>
              ✓ {phase.downloadedCount ? `${phase.downloadedCount} clips bonked. ` : 'bonked. '}
            </Text>
            <Text color={theme.primary}>parked at:</Text>
          </Text>
          <Text color={theme.muted}>{shortenPath(phase.filepath, os.homedir(), 60)}</Text>
          <Gap />
          <Box
            borderStyle="round"
            borderColor={theme.border}
            borderBackgroundColor={theme.background}
            paddingX={3}
          >
            <Text bold color={theme.accent}>{DONE_LABEL}</Text>
          </Box>
        </Box>
      )}

      {phase.name === 'error' && (
        <Box flexDirection="column" alignItems="center" width={Math.max(10, Math.min(columns - 6, 72))}>
          <Text bold color={theme.accent}>✗ oof — {phase.message}</Text>
        </Box>
      )}

      {hints.length > 0 ? (
        <>
          <Gap lines={2} />
          <Shortcuts
            items={hints}
            leading={
              phase.name === 'probing' ? (
                <Text>
                  <Text color={theme.accent}>
                    <Spinner type="dots" />
                  </Text>
                  <Text color={theme.muted}> {phase.status}</Text>
                </Text>
              ) : undefined
            }
          />
        </>
      ) : null}
    </FullScreen>
  )
}
