import React, {type ReactNode} from 'react'
import {Box, Text} from 'ink'
import {useTheme} from '../theme.js'

/**
 * Modern titled card: accent title on the top edge, accent border.
 */
export function Panel({title, width, children}: {title: string; width: number; children: ReactNode}) {
  const theme = useTheme()
  const inner = width - 2
  const tail = Math.max(0, inner - title.length - 3)
  return (
    <Box flexDirection="column" width={width}>
      <Text>
        <Text color={theme.border}>{'╭─ '}</Text>
        <Text color={theme.accent} bold>
          {title}
        </Text>
        <Text color={theme.border}>{` ${'─'.repeat(tail)}╮`}</Text>
      </Text>
      <Box
        width={width}
        borderStyle="round"
        borderColor={theme.border}
        borderBackgroundColor={theme.background}
        borderTop={false}
        flexDirection="column"
        paddingX={2}
      >
        {children}
      </Box>
    </Box>
  )
}
