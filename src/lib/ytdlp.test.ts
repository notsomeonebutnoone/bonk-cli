import assert from 'node:assert/strict'
import test from 'node:test'
import {
  baseYtDlpArgs,
  buildChoices,
  buildPlaylistChoices,
  normalizePlaylistEntry,
  PREMIERE_FFMPEG_ARGS,
  sanitizeFilename,
  type VideoInfo,
} from './ytdlp.js'

test('base args are exactly cookies + node runtime + remote ejs components', () => {
  const args = baseYtDlpArgs('/tmp/cookies.txt')
  assert.deepEqual(args, [
    '--cookies',
    '/tmp/cookies.txt',
    '--js-runtimes',
    'node',
    '--remote-components',
    'ejs:github',
  ])
  // must come first in every invocation — no other flags mixed into the base
  assert.equal(args[0], '--cookies')
  assert.equal(args[2], '--js-runtimes')
  assert.equal(args[3], 'node')
  assert.equal(args[4], '--remote-components')
  assert.equal(args[5], 'ejs:github')
})

test('premiere re-encode args use fast preset H.264 + AAC (not vp9/av1)', () => {
  const joined = PREMIERE_FFMPEG_ARGS.join(' ')
  assert.match(joined, /libx264/)
  assert.match(joined, /veryfast/) // must not use slow default preset
  assert.match(joined, /profile:v high/)
  assert.match(joined, /yuv420p/)
  assert.match(joined, /aac/)
  assert.match(joined, /faststart/)
  assert.doesNotMatch(joined, /vp9|av1|libvpx|libaom/i)
})

test('video choices use clean standard ladder labels', () => {
  const info: VideoInfo = {
    title: 'test',
    formats: [
      {
        format_id: '1',
        ext: 'mp4',
        vcodec: 'avc1.640028',
        acodec: 'none',
        height: 1080,
        tbr: 5000,
        filesize: 10_000_000,
      },
      // near-miss height should snap to 720, not show as 718p
      {
        format_id: '718',
        ext: 'mp4',
        vcodec: 'avc1',
        acodec: 'none',
        height: 718,
        tbr: 2500,
        filesize: 5_000_000,
      },
      // odd progressive height should not appear as its own row
      {
        format_id: '854',
        ext: 'webm',
        vcodec: 'vp9',
        acodec: 'none',
        height: 854,
        tbr: 3000,
        filesize: 6_000_000,
      },
      {
        format_id: '2',
        ext: 'm4a',
        vcodec: 'none',
        acodec: 'mp4a.40.2',
        abr: 128,
        filesize: 1_000_000,
      },
    ],
  }

  const choices = buildChoices(info)
  const videoLabels = choices.filter(c => c.kind === 'video').map(c => c.label)

  assert.ok(videoLabels.some(l => l.startsWith('1080p · mp4')))
  assert.ok(videoLabels.some(l => l.startsWith('720p · mp4')))
  // no raw odd heights in the picker
  assert.ok(!videoLabels.some(l => l.includes('854p') || l.includes('718p')))
  // clean ladder labels (not codec jargon like "mp4 h.264")
  assert.ok(!videoLabels.some(l => /h\.264/i.test(l)))

  const video = choices.find(c => c.kind === 'video')
  assert.ok(video)
  assert.equal(video!.premiereEncode, true)
  assert.ok(!video!.args.includes('--recode-video'))
  assert.ok(choices.some(c => c.kind === 'audio' && c.label.includes('mp3')))
})

test('playlist choices scale sizes across all clips instead of showing the first clip size', () => {
  const info: VideoInfo = {
    title: 'first',
    duration: 100,
    formats: [
      {format_id: 'v', ext: 'mp4', vcodec: 'avc1', acodec: 'none', height: 1080, filesize: 10_000_000},
      {format_id: 'a', ext: 'm4a', vcodec: 'none', acodec: 'mp4a', filesize: 1_000_000},
    ],
  }
  const choices = buildPlaylistChoices(info, [
    {id: '1', title: 'one', url: 'https://example.com/1', duration: 100},
    {id: '2', title: 'two', url: 'https://example.com/2', duration: 200},
  ])

  const video = choices.find(choice => choice.kind === 'video')
  assert.equal(video?.estimatedBytes, 33_000_000)
  assert.match(video?.label ?? '', /~31 MB$/)
})

test('playlist choices hide sizes when a clip duration is unknown', () => {
  const choices = buildPlaylistChoices(
    {
      title: 'first',
      duration: 100,
      formats: [{format_id: 'v', ext: 'mp4', vcodec: 'avc1', acodec: 'none', height: 720, filesize: 5_000_000}],
    },
    [
      {id: '1', title: 'one', url: 'https://example.com/1', duration: 100},
      {id: '2', title: 'unknown', url: 'https://example.com/2'},
    ],
  )

  assert.ok(choices.every(choice => !choice.label.includes('~')))
})

test('sanitizeFilename strips apostrophes and illegal windows chars', () => {
  const name = sanitizeFilename("That's why your wife and kid are dead... - Patrick Jane Ed.")
  assert.ok(!name.includes("'"))
  assert.ok(!name.includes('"'))
  assert.ok(!name.includes(':'))
  assert.match(name, /Patrick Jane/i)
  assert.ok(name.length <= 80)
})

test('normalizePlaylistEntry builds a watch url from flat yt-dlp entries', () => {
  const fromWebpage = normalizePlaylistEntry({
    id: 'abc123XYZ',
    title: '  Hello World  ',
    webpage_url: 'https://www.youtube.com/watch?v=abc123XYZ',
    duration: 125,
    uploader: 'Channel',
  })
  assert.deepEqual(fromWebpage, {
    id: 'abc123XYZ',
    title: 'Hello World',
    url: 'https://www.youtube.com/watch?v=abc123XYZ',
    duration: 125,
    uploader: 'Channel',
  })

  const fromId = normalizePlaylistEntry({
    id: 'dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    ie_key: 'Youtube',
    duration: 213,
  })
  assert.equal(fromId?.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  assert.equal(fromId?.title, 'Never Gonna Give You Up')

  assert.equal(normalizePlaylistEntry(null), undefined)
  assert.equal(normalizePlaylistEntry({title: 'no id or url'}), undefined)
})
