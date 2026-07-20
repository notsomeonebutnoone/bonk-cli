import React, {type ReactNode} from 'react'
import {Box, Text} from 'ink'
import {useTheme} from '../theme.js'

/** Surface card with a compact system-label heading. */
export function Panel({title, width, children}: {title: string; width: number; children: ReactNode}) {
  const theme = useTheme()
  return (
    <Box flexDirection="column" width={width}>
      <Text>
        <Text color={theme.accentSecondary}>◆</Text>
        <Text color={theme.muted} bold>{` ${title.toUpperCase()}`}</Text>
      </Text>
      <Box
        width={width}
        borderStyle="round"
        borderColor={theme.border}
        borderBackgroundColor={theme.background}
        backgroundColor={theme.surface}
        flexDirection="column"
        paddingX={2}
        paddingY={1}
      >
        {children}
      </Box>
    </Box>
  )
}
