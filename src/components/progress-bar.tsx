import React from 'react'
import {Text} from 'ink'
import {useTheme} from '../theme.js'

/** Split-gradient meter — cyan into violet, with a low-contrast surface track. */
export function ProgressBar({percent, width = 30}: {percent: number; width?: number}) {
  const theme = useTheme()
  const clamped = Math.max(0, Math.min(1, percent))
  const filled = Math.round(clamped * width)
  const cyan = Math.min(filled, Math.ceil(width * 0.55))
  const violet = Math.max(0, filled - cyan)
  return (
    <Text>
      <Text color={theme.accent}>{'━'.repeat(cyan)}</Text>
      <Text color={theme.accentSecondary}>{'━'.repeat(violet)}</Text>
      <Text color={theme.surfaceAlt}>{'━'.repeat(width - filled)}</Text>
      <Text color={theme.primary} bold>{`  ${`${Math.round(clamped * 100)}%`.padStart(4)}`}</Text>
    </Text>
  )
}
