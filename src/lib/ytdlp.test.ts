import assert from 'node:assert/strict'
import test from 'node:test'
import {baseYtDlpArgs, buildChoices, PREMIERE_FFMPEG_ARGS, sanitizeFilename, type VideoInfo} from './ytdlp.js'

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

test('video choices use clean standard ladder labels like yoinks', () => {
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
  // labels match yoinks style (not "mp4 h.264")
  assert.ok(!videoLabels.some(l => /h\.264/i.test(l)))

  const video = choices.find(c => c.kind === 'video')
  assert.ok(video)
  assert.equal(video!.premiereEncode, true)
  assert.ok(!video!.args.includes('--recode-video'))
  assert.ok(choices.some(c => c.kind === 'audio' && c.label.includes('mp3')))
})

test('sanitizeFilename strips apostrophes and illegal windows chars', () => {
  const name = sanitizeFilename("That's why your wife and kid are dead... - Patrick Jane Ed.")
  assert.ok(!name.includes("'"))
  assert.ok(!name.includes('"'))
  assert.ok(!name.includes(':'))
  assert.match(name, /Patrick Jane/i)
  assert.ok(name.length <= 80)
})
