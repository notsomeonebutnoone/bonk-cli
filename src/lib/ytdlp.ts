import {spawn, type ChildProcess} from 'node:child_process'
import {createWriteStream, existsSync} from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import {formatBytes} from './format.js'

const BONK_DIR = path.join(os.homedir(), '.bonk', 'bin')
const RELEASE_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'

/**
 * Exclusive base for every yt-dlp invocation — exactly as specified:
 *   yt-dlp --cookies cookies.txt --js-runtimes node --remote-components ejs:github [URL]
 *
 * Only output/format/progress flags are appended after this base.
 */
export function resolveCookiesPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'cookies.txt'),
    path.join(os.homedir(), '.bonk', 'cookies.txt'),
    path.join(os.homedir(), 'cookies.txt'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return candidates[0]!
}

/** Always-on args. Never omit these. */
export function baseYtDlpArgs(cookiesPath = resolveCookiesPath()): string[] {
  return [
    '--cookies',
    cookiesPath,
    '--js-runtimes',
    'node',
    '--remote-components',
    'ejs:github',
  ]
}

export function assertCookiesPresent(cookiesPath = resolveCookiesPath()): void {
  if (!existsSync(cookiesPath)) {
    throw new Error(
      `cookies.txt not found. Place a Netscape cookies export at:\n  ${path.resolve(process.cwd(), 'cookies.txt')}\n  or ~/.bonk/cookies.txt`,
    )
  }
}

/**
 * Full re-encode only when the source is VP9/AV1 (Premiere rejects those).
 * `veryfast` keeps this close to download time; default ffmpeg preset is much slower.
 */
export const PREMIERE_REENCODE_ARGS = [
  '-c:v',
  'libx264',
  '-preset',
  'veryfast',
  '-profile:v',
  'high',
  '-level',
  '4.1',
  '-pix_fmt',
  'yuv420p',
  '-crf',
  '20',
  '-c:a',
  'aac',
  '-b:a',
  '192k',
  '-ar',
  '48000',
  '-ac',
  '2',
  '-movflags',
  '+faststart',
] as const

/** @deprecated use PREMIERE_REENCODE_ARGS — kept for tests/compat */
export const PREMIERE_FFMPEG_ARGS = PREMIERE_REENCODE_ARGS

function ytDlpAssetName(): string {
  if (process.platform === 'win32') return 'yt-dlp.exe'
  if (process.platform === 'darwin') return 'yt-dlp_macos'
  return process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux'
}

/** Absolute path of the yt-dlp binary bonk keeps under ~/.bonk/bin. */
export function bundledYtDlpPath(): string {
  return path.join(BONK_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
}

function commandWorks(cmd: string, args: string[]): Promise<boolean> {
  return new Promise(resolve => {
    let child
    try {
      child = spawn(cmd, args, {stdio: 'ignore', timeout: 10_000})
    } catch {
      resolve(false)
      return
    }
    child.on('error', () => resolve(false))
    child.on('close', code => resolve(code === 0))
  })
}

function runCommand(
  cmd: string,
  args: string[],
  signal?: AbortSignal,
): Promise<{code: number | null; stdout: string; stderr: string}> {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(cmd, args, {signal})
    } catch (error) {
      reject(error)
      return
    }
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', chunk => (stdout += chunk))
    child.stderr?.on('data', chunk => (stderr += chunk))
    child.on('error', reject)
    child.on('close', code => resolve({code, stdout, stderr}))
  })
}

async function ytDlpVersion(ytdlp: string): Promise<string> {
  const {code, stdout, stderr} = await runCommand(ytdlp, ['--version'])
  if (code !== 0) throw new Error(stderr.trim() || 'Could not read yt-dlp version.')
  return (stdout || stderr).trim().split('\n')[0]?.trim() || 'unknown'
}

/** Download the platform binary into ~/.bonk/bin (used on first run and by --update). */
async function fetchBundledYtDlp(onStatus: (message: string) => void, signal?: AbortSignal): Promise<string> {
  const local = bundledYtDlpPath()
  onStatus('snagging yt-dlp…')
  await fs.mkdir(BONK_DIR, {recursive: true})

  const url = `${RELEASE_BASE}/${ytDlpAssetName()}`
  const response = await fetch(url, {signal})
  if (!response.ok || !response.body) {
    throw new Error(`Could not download yt-dlp (${response.status}). Check your connection and try again.`)
  }

  const tmp = `${local}.download`
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(tmp), {signal})
  await fs.chmod(tmp, 0o755)
  await fs.rename(tmp, local)
  return local
}

export async function ensureYtDlp(onStatus: (message: string) => void, signal?: AbortSignal): Promise<string> {
  if (await commandWorks('yt-dlp', ['--version'])) return 'yt-dlp'

  const local = bundledYtDlpPath()
  if (await commandWorks(local, ['--version'])) return local

  onStatus('first run — snagging yt-dlp…')
  return fetchBundledYtDlp(onStatus, signal)
}

export type YtDlpUpdateResult = {
  /** Path to the binary that was updated (or freshly installed). */
  path: string
  /** Version string after the update. */
  version: string
  /** Whether a brand-new binary was downloaded instead of `yt-dlp -U`. */
  installed: boolean
}

/**
 * Self-update the bundled yt-dlp under ~/.bonk/bin via `yt-dlp -U`.
 * Installs it first if missing, then runs the in-place updater.
 */
export async function updateYtDlp(
  onStatus: (message: string) => void = () => {},
  signal?: AbortSignal,
): Promise<YtDlpUpdateResult> {
  const local = bundledYtDlpPath()
  let installed = false

  if (!(await commandWorks(local, ['--version']))) {
    await fetchBundledYtDlp(onStatus, signal)
    installed = true
  } else {
    onStatus('buffing yt-dlp…')
    // yt-dlp's own self-updater replaces the binary in place
    const {code, stdout, stderr} = await runCommand(local, ['-U'], signal)
    if (signal?.aborted) throw new Error('Update cancelled.')
    if (code !== 0) {
      const detail = (stderr || stdout).trim()
      throw new Error(detail || `yt-dlp -U failed (exit ${code}).`)
    }
  }

  const version = await ytDlpVersion(local)
  return {path: local, version, installed}
}

/**
 * Resolve ffmpeg binary path for merging + Premiere re-encode.
 * Always returns an absolute path when possible so we can spawn it directly.
 */
export async function findFfmpeg(): Promise<string | undefined> {
  if (await commandWorks('ffmpeg', ['-version'])) return 'ffmpeg'
  try {
    const mod = await import('ffmpeg-static')
    const ffmpegPath = (mod.default ?? mod) as unknown as string | null
    if (ffmpegPath && (await commandWorks(ffmpegPath, ['-version']))) return ffmpegPath
  } catch {
    // ffmpeg-static not installed or unsupported platform
  }
  return undefined
}

export type VideoInfo = {
  title: string
  uploader?: string
  duration?: number
  webpage_url?: string
  extractor_key?: string
  formats?: RawFormat[]
}

/** One video listed inside a playlist (from a flat yt-dlp listing). */
export type PlaylistEntry = {
  id: string
  title: string
  url: string
  duration?: number
  uploader?: string
}

export type PlaylistInfo = {
  title: string
  uploader?: string
  entries: PlaylistEntry[]
}

type RawFormat = {
  format_id: string
  ext?: string
  vcodec?: string
  acodec?: string
  height?: number
  width?: number
  abr?: number
  tbr?: number
  filesize?: number
  filesize_approx?: number
}

/** Raw entry shape from yt-dlp -J --flat-playlist (fields vary by extractor). */
type RawPlaylistEntry = {
  id?: string
  title?: string
  url?: string
  webpage_url?: string
  duration?: number
  uploader?: string
  channel?: string
  ie_key?: string
  _type?: string
} | null

type RawProbeJson = VideoInfo & {
  _type?: string
  entries?: RawPlaylistEntry[]
  uploader?: string
  channel?: string
}

export type ProbeResult = {
  info: VideoInfo
  infoJsonPath: string
}

export type ProbeOutcome =
  | {kind: 'video'; info: VideoInfo; infoJsonPath: string}
  | {kind: 'playlist'; playlist: PlaylistInfo}

/**
 * Probe a URL. Playlists surface a video picker; single videos (or one-entry
 * playlists) go straight to the format picker with full metadata.
 */
export async function probe(ytdlp: string, url: string, signal?: AbortSignal): Promise<ProbeOutcome> {
  assertCookiesPresent()
  // Flat listing keeps multi-video playlists cheap; single videos still get full JSON.
  const args = [...baseYtDlpArgs(), '-J', '--flat-playlist', '--no-warnings', url]
  const stdout = await spawnYtDlpJson(ytdlp, args, signal)

  let raw: RawProbeJson
  try {
    raw = JSON.parse(stdout) as RawProbeJson
  } catch {
    throw new Error('Could not parse video info from yt-dlp.')
  }

  if (raw._type === 'playlist' || Array.isArray(raw.entries)) {
    const entries = (raw.entries ?? [])
      .map(normalizePlaylistEntry)
      .filter((entry): entry is PlaylistEntry => entry !== undefined)

    if (entries.length === 0) {
      throw new Error('That playlist has no downloadable videos.')
    }

    // One entry → treat as a single video (full format probe).
    if (entries.length === 1) {
      return probeVideo(ytdlp, entries[0]!.url, signal)
    }

    return {
      kind: 'playlist',
      playlist: {
        title: raw.title || 'Playlist',
        uploader: raw.uploader ?? raw.channel,
        entries,
      },
    }
  }

  const infoJsonPath = path.join(os.tmpdir(), `bonk-info-${process.pid}-${Date.now()}.json`)
  await fs.writeFile(infoJsonPath, stdout)
  return {kind: 'video', info: raw, infoJsonPath}
}

/** Full metadata for one video — never expands a surrounding playlist. */
export async function probeVideo(ytdlp: string, url: string, signal?: AbortSignal): Promise<ProbeResult & {kind: 'video'}> {
  assertCookiesPresent()
  const args = [...baseYtDlpArgs(), '-J', '--no-playlist', '--no-warnings', url]
  const stdout = await spawnYtDlpJson(ytdlp, args, signal)

  let info: VideoInfo
  try {
    info = JSON.parse(stdout) as VideoInfo
  } catch {
    throw new Error('Could not parse video info from yt-dlp.')
  }

  const infoJsonPath = path.join(os.tmpdir(), `bonk-info-${process.pid}-${Date.now()}.json`)
  await fs.writeFile(infoJsonPath, stdout)
  return {kind: 'video', info, infoJsonPath}
}

function spawnYtDlpJson(ytdlp: string, args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(ytdlp, args, {signal})
    let out = ''
    let stderr = ''
    child.stdout.on('data', chunk => (out += chunk))
    child.stderr.on('data', chunk => (stderr += chunk))
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(cleanYtDlpError(stderr) || `yt-dlp exited with code ${code}`))
      } else {
        resolve(out)
      }
    })
  })
}

/** Build a clickable/downloadable URL for a flat-playlist entry. */
export function normalizePlaylistEntry(entry: RawPlaylistEntry): PlaylistEntry | undefined {
  if (!entry || typeof entry !== 'object') return undefined
  // yt-dlp inserts null placeholders for unavailable / private items
  if (entry._type === 'playlist') return undefined

  const id = entry.id?.trim()
  const webpage = entry.webpage_url?.trim()
  const rawUrl = entry.url?.trim()
  let url = webpage || (rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : undefined)

  if (!url && id) {
    const ie = (entry.ie_key ?? '').toLowerCase()
    if (ie === 'youtube' || ie === 'youtubetab' || !ie) {
      // YouTube is the common playlist case; bare ids from other sites are skipped
      if (ie === 'youtube' || ie === 'youtubetab' || /^[\w-]{6,}$/.test(id)) {
        url = `https://www.youtube.com/watch?v=${id}`
      }
    }
  }

  if (!url) return undefined

  const title = (entry.title?.trim() || id || 'Untitled').replace(/\s+/g, ' ')
  return {
    id: id || url,
    title,
    url,
    duration: typeof entry.duration === 'number' ? entry.duration : undefined,
    uploader: entry.uploader ?? entry.channel,
  }
}

export type DownloadChoice = {
  label: string
  kind: 'video' | 'audio'
  /** Approximate bytes represented by the label, when yt-dlp provides enough metadata. */
  estimatedBytes?: number
  /** Extra yt-dlp args after the exclusive base command. */
  args: string[]
  /** When true, re-encode the download to Premiere-safe H.264/AAC MP4 via ffmpeg. */
  premiereEncode: boolean
}

/**
 * Standard YouTube / streaming ladder only — no odd heights like 854p / 426p
 * that make the picker look broken.
 */
const STANDARD_HEIGHTS = [2160, 1440, 1080, 720, 480, 360, 240, 144] as const

/**
 * Build resolution choices for the quality panel.
 * Labels: `1080p · mp4 · ~12 MB` — clean, one row per standard rung.
 * Files still finish as Premiere-safe H.264 + AAC MP4 after download.
 */
export function buildChoices(info: VideoInfo): DownloadChoice[] {
  const formats = info.formats ?? []
  const choices: DownloadChoice[] = []

  const audioOnly = formats.filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
  const bestAudio = [...audioOnly].sort((a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))[0]
  const audioSize = bestAudio?.filesize ?? bestAudio?.filesize_approx

  const videos = formats.filter(
    f => f.vcodec && f.vcodec !== 'none' && typeof f.height === 'number' && f.height > 0,
  )

  // Map each format onto the nearest standard rung (within tolerance), then
  // keep only rungs that actually have source media.
  const byHeight = new Map<number, RawFormat[]>()
  for (const format of videos) {
    const snapped = snapToStandardHeight(format.height as number)
    if (snapped === undefined) continue
    const list = byHeight.get(snapped) ?? []
    list.push(format)
    byHeight.set(snapped, list)
  }

  const heights = STANDARD_HEIGHTS.filter(h => byHeight.has(h))

  for (const height of heights) {
    const candidates = byHeight.get(height) ?? []
    const best = [...candidates].sort((a, b) => scoreVideo(b) - scoreVideo(a))[0]
    if (!best) continue
    const muxed = best.acodec && best.acodec !== 'none'
    const size = (best.filesize ?? best.filesize_approx ?? 0) + (muxed ? 0 : audioSize ?? 0)
    const sizeLabel = size > 0 ? ` · ~${formatBytes(size)}` : ''
    choices.push({
      kind: 'video',
      label: `${height}p · mp4${sizeLabel}`,
      estimatedBytes: size > 0 ? size : undefined,
      premiereEncode: true,
      args: downloadFormatArgs(height),
    })
  }

  if (choices.length === 0 && videos.length > 0) {
    choices.push({
      kind: 'video',
      label: 'best available · mp4',
      premiereEncode: true,
      args: downloadFormatArgs(),
    })
  }

  const audioSizeLabel = audioSize ? ` · ~${formatBytes(audioSize)}` : ''
  choices.push({
    kind: 'audio',
    label: `audio only · mp3${audioSizeLabel}`,
    estimatedBytes: audioSize,
    premiereEncode: false,
    args: ['-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0'],
  })

  return choices
}

/**
 * Turn one video's format-size estimates into playlist totals using duration.
 * Flat playlist metadata gives us every clip's duration without the very slow
 * cost of fully probing every entry. If any duration is unavailable, omit the
 * size instead of misleadingly showing the first video's size as the total.
 */
export function buildPlaylistChoices(info: VideoInfo, entries: PlaylistEntry[]): DownloadChoice[] {
  const choices = buildChoices(info)
  const firstDuration = info.duration
  const hasEveryDuration = entries.length > 0 && entries.every(entry => entry.duration && entry.duration > 0)
  const totalDuration = hasEveryDuration
    ? entries.reduce((total, entry) => total + (entry.duration ?? 0), 0)
    : undefined

  return choices.map(choice => {
    const labelWithoutSize = choice.label.replace(/ · ~[\d.]+ [KMGT]?B$/, '')
    if (!firstDuration || !totalDuration || !choice.estimatedBytes) {
      return {...choice, label: labelWithoutSize, estimatedBytes: undefined}
    }
    const estimatedBytes = choice.estimatedBytes * (totalDuration / firstDuration)
    return {
      ...choice,
      label: `${labelWithoutSize} · ~${formatBytes(estimatedBytes)}`,
      estimatedBytes,
    }
  })
}

/** Snap 1078 / 1080 / 1090 → 1080p; reject weird outliers that match nothing. */
function snapToStandardHeight(height: number): number | undefined {
  let best: number | undefined
  let bestDist = Infinity
  for (const standard of STANDARD_HEIGHTS) {
    const dist = Math.abs(standard - height)
    // allow ~10% or 48px so 1040→1080, 700→720; keep 854 away from both 720 and 1080 unless close
    const tolerance = Math.max(48, Math.round(standard * 0.1))
    if (dist <= tolerance && dist < bestDist) {
      best = standard
      bestDist = dist
    }
  }
  return best
}

/**
 * yt-dlp format selection only — no re-encode in yt-dlp.
 * Strongly prefer native H.264 + m4a so we can stream-copy (near yt-dlp speed).
 * VP9/AV1 is a last resort and triggers a fast re-encode afterward.
 */
function downloadFormatArgs(height?: number): string[] {
  const format =
    height !== undefined
      ? [
          // native H.264 at exact height (fast path: copy)
          `bv*[vcodec^=avc1][height=${height}]+ba[acodec^=mp4a]`,
          `bv*[vcodec^=avc1][height=${height}]+ba`,
          `b[height=${height}][vcodec^=avc1]`,
          // H.264 at or below height
          `bv*[vcodec^=avc1][height<=${height}]+ba[acodec^=mp4a]`,
          `bv*[vcodec^=avc1][height<=${height}]+ba`,
          // last resort — any codec (slow path: re-encode)
          `bv*[height=${height}]+ba/b[height=${height}]/bv*[height<=${height}]+ba/b`,
        ].join('/')
      : [
          'bv*[vcodec^=avc1]+ba[acodec^=mp4a]',
          'bv*[vcodec^=avc1]+ba',
          'b[vcodec^=avc1]',
          'bv*+ba/b',
        ].join('/')

  return [
    '-f',
    format,
    '-S',
    'vcodec:h264,res,acodec:m4a',
    '--merge-output-format',
    'mp4',
  ]
}

function scoreVideo(f: RawFormat): number {
  let score = f.tbr ?? 0
  if (f.ext === 'mp4') score += 10_000
  if (f.vcodec?.startsWith('avc') || f.vcodec?.includes('h264')) score += 5_000
  // demote VP9 / AV1 (Premiere “unsupported compression type”)
  if (f.vcodec?.startsWith('vp9') || f.vcodec?.startsWith('vp09') || f.vcodec?.includes('av01')) score -= 5_000
  return score
}

export type DownloadProgress = {
  downloadedBytes: number
  totalBytes?: number
  speed?: number
  eta?: number
  part: number
  totalParts: number
}

export type DownloadHandlers = {
  onProgress: (progress: DownloadProgress) => void
  onProcessing: () => void
}

const PROGRESS_PREFIX = 'BONK|'
const PROGRESS_TEMPLATE = `${PROGRESS_PREFIX}%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s`

let activeChild: ChildProcess | undefined
process.on('exit', () => activeChild?.kill('SIGTERM'))

export async function download(
  opts: {
    ytdlp: string
    ffmpegLocation?: string
    url: string
    infoJsonPath?: string
    /** Pretty title for the final filename (special chars OK — we sanitize). */
    title?: string
    choice: DownloadChoice
    outDir: string
  },
  handlers: DownloadHandlers,
  signal?: AbortSignal,
): Promise<string> {
  assertCookiesPresent()
  await fs.mkdir(opts.outDir, {recursive: true})

  // ASCII-only temp name so ffmpeg never chokes on apostrophes / unicode in titles
  // (that was the "Error opening input file … That's why …" crash).
  const token = `bonk-${process.pid}-${Date.now()}`
  const rawPath = await downloadWithYtDlp({...opts, token}, handlers, signal)

  if (!opts.choice.premiereEncode) {
    return finalizeFilename(rawPath, opts.outDir, opts.title, path.extname(rawPath).slice(1) || 'mp3')
  }

  const ffmpeg = opts.ffmpegLocation ?? (await findFfmpeg())
  if (!ffmpeg) {
    throw new Error(
      'ffmpeg is required for Premiere-safe output. Install ffmpeg and ensure it is on your PATH.',
    )
  }

  handlers.onProcessing()
  // Work on the safe temp path, then rename to a human-readable title.
  const prepared = await makePremiereReady(ffmpeg, rawPath, signal)
  return finalizeFilename(prepared, opts.outDir, opts.title, 'mp4')
}

/**
 * Run exactly:
 *   yt-dlp --cookies … --js-runtimes node --remote-components ejs:github [URL|info] + format/output flags
 *
 * Output is always a safe tokenized filename under outDir (no title in the path).
 */
function downloadWithYtDlp(
  opts: {
    ytdlp: string
    ffmpegLocation?: string
    url: string
    infoJsonPath?: string
    choice: DownloadChoice
    outDir: string
    token: string
  },
  handlers: DownloadHandlers,
  signal?: AbortSignal,
): Promise<string> {
  // Safe path only — never put the video title in the filesystem path while ffmpeg runs.
  const outTemplate = path.join(opts.outDir, `${opts.token}.%(ext)s`)

  const args = [
    ...baseYtDlpArgs(),
    ...(opts.infoJsonPath ? ['--load-info-json', opts.infoJsonPath] : [opts.url]),
    ...opts.choice.args,
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--no-quiet',
    '--progress',
    '--progress-template',
    `download:${PROGRESS_TEMPLATE}`,
    '--print',
    'after_move:filepath',
    '--no-simulate',
    // restrict filenames so yt-dlp won't invent odd unicode variants of our token
    '--windows-filenames',
    '-o',
    outTemplate,
  ]
  if (opts.ffmpegLocation && opts.ffmpegLocation !== 'ffmpeg') {
    args.push('--ffmpeg-location', opts.ffmpegLocation)
  }

  return new Promise((resolve, reject) => {
    const child = spawn(opts.ytdlp, args, {signal})
    activeChild = child

    let stderr = ''
    let filepath = ''
    let part = 0
    let totalParts = 1
    let lastDownloaded = 0
    let buffer = ''
    const destinations: string[] = []

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue
        if (line.startsWith(PROGRESS_PREFIX)) {
          const [downloaded, total, totalEstimate, speed, eta] = line.slice(PROGRESS_PREFIX.length).split('|')
          const downloadedBytes = toNumber(downloaded) ?? 0
          if (downloadedBytes < lastDownloaded) part++
          lastDownloaded = downloadedBytes
          handlers.onProgress({
            downloadedBytes,
            totalBytes: toNumber(total) ?? toNumber(totalEstimate),
            speed: toNumber(speed),
            eta: toNumber(eta),
            part,
            totalParts,
          })
        } else if (line.includes('Downloading 1 format(s):')) {
          totalParts = (line.split('format(s):')[1] ?? '').trim().split('+').length
        } else if (
          line.includes('[Merger]') ||
          line.includes('[ExtractAudio]') ||
          line.includes('[FixupM3u8]')
        ) {
          const merging = /^\[Merger\] Merging formats into "(.+)"$/.exec(line)?.[1]
          const extracting = /^\[ExtractAudio\] Destination: (.+)$/.exec(line)?.[1]
          const target = merging ?? extracting
          if (target) destinations.push(target)
          handlers.onProcessing()
        } else if (line.startsWith('[download] Destination: ')) {
          destinations.push(line.slice('[download] Destination: '.length))
        } else if (path.isAbsolute(line) || /^[A-Za-z]:[\\/]/.test(line)) {
          filepath = line
        }
      }
    })
    child.stderr.on('data', chunk => (stderr += chunk))
    child.on('error', reject)
    child.on('close', code => {
      activeChild = undefined
      if (signal?.aborted) {
        void removePartials(destinations)
        reject(new Error('Download cancelled.'))
        return
      }
      if (code !== 0) {
        reject(new Error(cleanYtDlpError(stderr) || `Download failed (yt-dlp exit code ${code}).`))
        return
      }
      void resolveExistingFile(filepath, destinations, opts.outDir, opts.token)
        .then(resolve)
        .catch(reject)
    })
  })
}

/** Prefer the reported path; fall back to destinations / token match if print was wrong. */
async function resolveExistingFile(
  reported: string,
  destinations: string[],
  outDir: string,
  token: string,
): Promise<string> {
  const candidates = [
    reported,
    ...destinations,
    // common yt-dlp outputs for our template
    path.join(outDir, `${token}.mp4`),
    path.join(outDir, `${token}.webm`),
    path.join(outDir, `${token}.mkv`),
    path.join(outDir, `${token}.m4a`),
    path.join(outDir, `${token}.mp3`),
  ]
    .filter(Boolean)
    .map(p => path.resolve(p))

  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // try next
    }
  }

  // last resort: any file in outDir that starts with our token
  try {
    const files = await fs.readdir(outDir)
    const hit = files.find(f => f.startsWith(token))
    if (hit) return path.join(outDir, hit)
  } catch {
    // ignore
  }

  throw new Error(
    `Download finished but the file was not found${reported ? ` (expected near ${reported})` : ''}.`,
  )
}

/** Windows-safe final name from the video title. */
export function sanitizeFilename(name: string, max = 80): string {
  const cleaned = name
    .normalize('NFKD')
    // strip combining marks
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[''']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
  const sliced = cleaned.slice(0, max).replace(/[. ]+$/g, '')
  return sliced || 'video'
}

async function finalizeFilename(
  currentPath: string,
  outDir: string,
  title: string | undefined,
  ext: string,
): Promise<string> {
  const base = sanitizeFilename(title || path.parse(currentPath).name)
  const cleanExt = ext.replace(/^\./, '') || 'mp4'
  let target = path.join(outDir, `${base}.${cleanExt}`)
  if (path.resolve(currentPath) === path.resolve(target)) return currentPath

  let n = 1
  while (existsSync(target) && path.resolve(target) !== path.resolve(currentPath)) {
    target = path.join(outDir, `${base} (${n}).${cleanExt}`)
    n++
  }

  await fs.rm(target, {force: true}).catch(() => {})
  await fs.rename(currentPath, target)
  return target
}

type MediaProbe = {
  hasH264: boolean
  hasBadVideo: boolean
  hasAac: boolean
  hasAudio: boolean
  isMp4: boolean
}

function finalPremierePath(inputPath: string): string {
  const parsed = path.parse(inputPath)
  const stem = parsed.name.replace(/\.raw$/i, '')
  const outputPath = path.join(parsed.dir, `${stem}.mp4`)
  return path.resolve(outputPath) === path.resolve(inputPath)
    ? path.join(parsed.dir, `${stem}.premiere.mp4`)
    : outputPath
}

/**
 * Make a file Premiere-safe as fast as possible:
 * 1. Already H.264 + AAC in MP4 → rename (instant, same as plain yt-dlp)
 * 2. H.264 + non-AAC audio → stream-copy video, re-encode audio only (fast)
 * 3. VP9 / AV1 → re-encode with -preset veryfast (only slow path)
 */
export async function makePremiereReady(
  ffmpeg: string,
  inputPath: string,
  signal?: AbortSignal,
): Promise<string> {
  // Normalize + prove the file exists before handing it to ffmpeg
  const resolvedInput = path.resolve(inputPath)
  try {
    await fs.access(resolvedInput)
  } catch {
    throw new Error(`Downloaded file missing before encode: ${resolvedInput}`)
  }

  const finalOutput = finalPremierePath(resolvedInput)
  const probe = await probeMedia(ffmpeg, resolvedInput)

  // Instant path — native H.264 that Premiere accepts
  if (probe.hasH264 && !probe.hasBadVideo && (probe.hasAac || !probe.hasAudio)) {
    if (path.resolve(resolvedInput) === path.resolve(finalOutput)) {
      return resolvedInput
    }
    // Already .mp4: rename only. No ffmpeg re-encode.
    if (probe.isMp4 || resolvedInput.toLowerCase().endsWith('.mp4')) {
      await fs.rm(finalOutput, {force: true}).catch(() => {})
      await fs.rename(resolvedInput, finalOutput)
      return finalOutput
    }
    // Container isn't mp4 — remux with stream copy (seconds, not minutes)
    await runFfmpeg(
      ffmpeg,
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        resolvedInput,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        finalOutput,
      ],
      signal,
    )
    await fs.rm(resolvedInput, {force: true}).catch(() => {})
    return finalOutput
  }

  // Video is fine H.264, audio needs AAC for a clean MP4
  if (probe.hasH264 && !probe.hasBadVideo && probe.hasAudio && !probe.hasAac) {
    await runFfmpeg(
      ffmpeg,
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        resolvedInput,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
        finalOutput,
      ],
      signal,
    )
    await fs.rm(resolvedInput, {force: true}).catch(() => {})
    return finalOutput
  }

  // Slow path only: VP9/AV1 → H.264 with a fast preset
  await runFfmpeg(
    ffmpeg,
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      resolvedInput,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      ...PREMIERE_REENCODE_ARGS,
      finalOutput,
    ],
    signal,
  )
  await fs.rm(resolvedInput, {force: true}).catch(() => {})

  const ok = await verifyPremiereCodecs(ffmpeg, finalOutput)
  if (!ok) {
    throw new Error(
      'Output is not H.264/AAC. Premiere would reject it — check that ffmpeg has libx264.',
    )
  }
  return finalOutput
}

/** @deprecated use makePremiereReady */
export function encodeForPremiere(ffmpeg: string, inputPath: string, signal?: AbortSignal): Promise<string> {
  return makePremiereReady(ffmpeg, inputPath, signal)
}

function runFfmpeg(ffmpeg: string, args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, {signal})
    activeChild = child
    let stderr = ''
    child.stderr.on('data', chunk => (stderr += chunk))
    child.on('error', reject)
    child.on('close', code => {
      activeChild = undefined
      if (signal?.aborted) {
        reject(new Error('Download cancelled.'))
        return
      }
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ffmpeg failed (exit ${code}).`))
        return
      }
      resolve()
    })
  })
}

export async function probeMedia(ffmpeg: string, filepath: string): Promise<MediaProbe> {
  const info = await new Promise<string>(resolve => {
    const child = spawn(ffmpeg, ['-hide_banner', '-i', filepath], {stdio: ['ignore', 'ignore', 'pipe']})
    let stderr = ''
    child.stderr.on('data', chunk => (stderr += chunk))
    child.on('close', () => resolve(stderr))
    child.on('error', () => resolve(''))
  })
  return {
    hasH264: /Video:\s*(h264|avc1|avc)/i.test(info),
    hasBadVideo: /Video:\s*(vp9|vp09|av1|av01|vp8)/i.test(info),
    hasAac: /Audio:\s*(aac|mp4a)/i.test(info),
    hasAudio: /Audio:\s*/i.test(info),
    isMp4: /\.mp4$/i.test(filepath) || /Input #\d+,\s*mov,mp4/i.test(info),
  }
}

/** ffprobe-style check via ffmpeg -i (works without ffprobe binary). */
export async function verifyPremiereCodecs(ffmpeg: string, filepath: string): Promise<boolean> {
  const probe = await probeMedia(ffmpeg, filepath)
  return probe.hasH264 && !probe.hasBadVideo && (probe.hasAac || !probe.hasAudio)
}

function removePartials(destinations: string[]): Promise<unknown> {
  return Promise.allSettled(
    destinations
      .flatMap(dest => [dest, `${dest}.part`, `${dest}.ytdl`])
      .map(file => fs.rm(file, {force: true})),
  )
}

function toNumber(value: string | undefined): number | undefined {
  if (!value || value === 'NA' || value === 'None') return undefined
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : undefined
}

function cleanYtDlpError(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('ERROR:'))
  const last = lines.at(-1)
  return last ? last.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, '') : ''
}
