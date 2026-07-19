import React from 'react'
import {Text} from 'ink'
import {useTheme} from '../theme.js'

/** Continuous modern bar — accent fill over muted track. */
export function ProgressBar({percent, width = 30}: {percent: number; width?: number}) {
  const theme = useTheme()
  const clamped = Math.max(0, Math.min(1, percent))
  const filled = Math.round(clamped * width)
  return (
    <Text>
      <Text color={theme.accent}>{'█'.repeat(filled)}</Text>
      <Text color={theme.muted}>{'░'.repeat(width - filled)}</Text>
      <Text color={theme.accent}>{` ${`${Math.round(clamped * 100)}%`.padStart(4)}`}</Text>
    </Text>
  )
}
