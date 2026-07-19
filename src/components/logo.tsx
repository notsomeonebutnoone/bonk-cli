import React, {useEffect, useMemo, useState} from 'react'
import {Box, Text} from 'ink'
import {type Theme, useTheme} from '../theme.js'

// BONK block wordmark — colored with theme accent
const ART = [
  '█▀▄ █▀█ █▄ █ █▄▀',
  '█▀▄ █ █ █ ▀█ █▀▄',
  '▀▀  ▀▀▀ ▀  ▀ ▀ ▀',
]
const GRID = ART.map(line => [...line])
const ROWS = GRID.length

// Light modern intro — short fade-in, no heavy CRT noise
const INTRO_MS = 600
const INTRO_SPREAD_MS = 350
const SWEEP_MS = 800
const SWEEP_EVERY_MS = 9_000
const TILT = 2
const HALF = 2.2
const LIGHTER: Record<string, string> = {'█': '▓', '▓': '░'}
const HALF_BLOCKS = new Set(['▀', '▄'])

const ease = (t: number) => 1 - Math.pow(1 - t, 3)

type Phase = 'intro' | 'idle' | 'sweep'

function cellAt(ch: string, row: number, col: number, phase: Phase, t: number, delay: number, theme: Theme) {
  if (ch === ' ' || phase === 'idle') return {ch, color: theme.accent, dim: false}
  if (phase === 'intro') {
    const dt = t - delay
    if (dt < 0) return {ch: ' ', color: theme.accent, dim: false}
    if (dt < 90) return {ch: HALF_BLOCKS.has(ch) ? ch : '░', color: theme.muted, dim: false}
    if (dt < 160) return {ch: HALF_BLOCKS.has(ch) ? ch : '▒', color: theme.accent, dim: false}
    return {ch, color: theme.accent, dim: false}
  }
  const cols = GRID[0].length
  const pMin = -TILT * ROWS - HALF
  const pMax = cols + HALF
  const p = pMin + ease(t / SWEEP_MS) * (pMax - pMin)
  const d = Math.abs(col - (ROWS - 1 - row) * TILT - p)
  if (d <= HALF && 1 - d / HALF > 0.35) {
    if (HALF_BLOCKS.has(ch)) return {ch, color: theme.muted, dim: false}
    return {ch: LIGHTER[ch] ?? ch, color: theme.accent, dim: false}
  }
  return {ch, color: theme.accent, dim: false}
}

function renderRow(row: number, phase: Phase, t: number, delays: number[], theme: Theme) {
  const segments: Array<{text: string; color?: string; dim: boolean}> = []
  GRID[row].forEach((ch, col) => {
    const cell = cellAt(ch, row, col, phase, t, delays[col], theme)
    const last = segments[segments.length - 1]
    if (last && ((last.color === cell.color && last.dim === cell.dim) || cell.ch === ' ')) last.text += cell.ch
    else segments.push({text: cell.ch, color: cell.color, dim: cell.dim})
  })
  return segments.map((seg, i) => (
    <Text key={i} color={seg.color} dimColor={seg.dim}>
      {seg.text}
    </Text>
  ))
}

export function Logo() {
  const theme = useTheme()
  const animated = Boolean(process.stdout.isTTY)
  const delays = useMemo(
    () => GRID.map(row => row.map(() => Math.random() * INTRO_SPREAD_MS)),
    [],
  )
  const [phase, setPhase] = useState<Phase>(animated ? 'intro' : 'idle')
  const [t, setT] = useState(0)

  useEffect(() => {
    if (!animated) return
    if (phase === 'idle') {
      const id = setTimeout(() => {
        setT(0)
        setPhase('sweep')
      }, SWEEP_EVERY_MS)
      return () => clearTimeout(id)
    }
    const duration = phase === 'intro' ? INTRO_MS : SWEEP_MS
    const start = Date.now()
    const id = setInterval(() => {
      const elapsed = Date.now() - start
      if (elapsed >= duration) {
        setT(0)
        setPhase('idle')
      } else {
        setT(elapsed)
      }
    }, 33)
    return () => clearInterval(id)
  }, [phase, animated])

  return (
    <Box flexDirection="column" flexShrink={0} alignItems="center">
      <Text color={theme.accent}>◆</Text>
      {GRID.map((_, row) => (
        <Text key={row}>{renderRow(row, phase, t, delays[row], theme)}</Text>
      ))}
    </Box>
  )
}
