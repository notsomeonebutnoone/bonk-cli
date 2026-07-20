import assert from 'node:assert/strict'
import test from 'node:test'
import {parseArgs} from './args.js'
import {isThemeMode, nextThemeMode, themeFor} from '../theme.js'

test('parses a url and a spaced theme option without confusing the value for the url', () => {
  assert.deepEqual(parseArgs(['--theme', 'light', 'https://example.com/video']), {
    help: false,
    version: false,
    update: false,
    themeMode: 'light',
    initialUrl: 'https://example.com/video',
  })
})

test('parses an equals-style theme option after the url', () => {
  assert.deepEqual(parseArgs(['https://example.com/video', '--theme=purple']), {
    help: false,
    version: false,
    update: false,
    themeMode: 'purple',
    initialUrl: 'https://example.com/video',
  })
})

test('parses -U / --update for bundled yt-dlp self-update', () => {
  assert.deepEqual(parseArgs(['--update']), {
    help: false,
    version: false,
    update: true,
    initialUrl: undefined,
  })
  assert.deepEqual(parseArgs(['-U']), {
    help: false,
    version: false,
    update: true,
    initialUrl: undefined,
  })
  assert.match(parseArgs(['--update', 'https://example.com']).error ?? '', /does not take a url/)
})

test('rejects missing, invalid, and unknown options', () => {
  assert.match(parseArgs(['--theme']).error ?? '', /needs a value/)
  assert.match(parseArgs(['--theme', 'sepia']).error ?? '', /unknown theme/)
  assert.match(parseArgs(['--wat']).error ?? '', /unknown option/)
  assert.match(parseArgs(['one', 'two']).error ?? '', /single url/)
})

test('recognizes only supported modes and cycles through all of them', () => {
  assert.equal(isThemeMode('dark'), true)
  assert.equal(isThemeMode('light'), true)
  assert.equal(isThemeMode('purple'), true)
  assert.equal(isThemeMode('auto'), false)
  assert.equal(isThemeMode('sepia'), false)
  assert.equal(nextThemeMode('dark'), 'light')
  assert.equal(nextThemeMode('light'), 'purple')
  assert.equal(nextThemeMode('purple'), 'dark')
})

test('each theme owns a full modern palette with accent', () => {
  assert.equal(themeFor('dark').background, '#070A0F')
  assert.equal(themeFor('dark').accent, '#22D3EE')
  assert.equal(themeFor('light').background, '#FAFAF9')
  assert.equal(themeFor('light').accent, '#0891B2')
  assert.equal(themeFor('purple').background, '#0C0A14')
  assert.equal(themeFor('purple').accent, '#A78BFA')
  for (const mode of ['dark', 'light', 'purple'] as const) {
    const t = themeFor(mode)
    assert.ok(t.primary)
    assert.ok(t.accent)
    assert.ok(t.accentSecondary)
    assert.ok(t.muted)
    assert.ok(t.border)
    assert.ok(t.surface)
    assert.equal(t.logoGradient.length, 5)
  }
})
