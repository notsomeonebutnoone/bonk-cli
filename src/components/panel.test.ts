import assert from 'node:assert/strict'
import test from 'node:test'

test('themes paint native border cells with the theme background', async () => {
  const previousForceColor = process.env.FORCE_COLOR
  const previousNoColor = process.env.NO_COLOR
  process.env.FORCE_COLOR = '3'
  delete process.env.NO_COLOR

  try {
    const [{default: React}, {renderToString, Text}, {Panel}, {ThemeProvider}] = await Promise.all([
      import('react'),
      import('ink'),
      import('./panel.js'),
      import('../theme.js'),
    ])

    const renderPanel = (mode: 'dark' | 'light' | 'purple') =>
      renderToString(
        React.createElement(
          ThemeProvider,
          {
            mode,
            children: React.createElement(Panel, {
              title: 'Download',
              width: 20,
              children: React.createElement(Text, null, 'item'),
            }),
          },
        ),
      )

    // light: #FAFAF9 = 250,250,249
    assert.match(renderPanel('light'), /\x1b\[48;2;250;250;249m/)
    // dark: #09090b = 9,9,11
    assert.match(renderPanel('dark'), /\x1b\[48;2;9;9;11m/)
    // purple: #0C0A14 = 12,10,20
    assert.match(renderPanel('purple'), /\x1b\[48;2;12;10;20m/)
  } finally {
    if (previousForceColor === undefined) delete process.env.FORCE_COLOR
    else process.env.FORCE_COLOR = previousForceColor
    if (previousNoColor === undefined) delete process.env.NO_COLOR
    else process.env.NO_COLOR = previousNoColor
  }
})
