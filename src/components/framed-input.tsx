import React, {type ReactNode} from 'react'
import {Box, Text} from 'ink'
import {useTheme} from '../theme.js'

/** A single modern source bar: protocol glyph, editable URL, and embedded CTA. */
export function FramedInput({
  title,
  width,
  button,
  buttonDim = false,
  children,
}: {
  title: string
  width: number
  button?: string
  buttonDim?: boolean
  children: ReactNode
}) {
  const theme = useTheme()
  const fillColor = buttonDim ? theme.surfaceAlt : theme.accent
  const buttonColor = buttonDim ? theme.muted : theme.dark

  return (
    <Box flexDirection="column" width={width}>
      <Text>
        <Text color={theme.accent}>●</Text>
        <Text color={theme.muted} bold>{` ${title.toUpperCase()}`}</Text>
      </Text>
      <Box
        width={width}
        height={3}
        borderStyle="round"
        borderColor={buttonDim ? theme.border : theme.accent}
        borderBackgroundColor={theme.background}
        backgroundColor={theme.surface}
        paddingX={1}
        alignItems="center"
      >
        <Text color={theme.accent}>⌁ </Text>
        <Box flexGrow={1} height={1} overflow="hidden">
          {children}
        </Box>
        {button ? (
          <Text backgroundColor={fillColor} color={buttonColor} bold>
            {` ${button.toUpperCase()} ↗ `}
          </Text>
        ) : null}
      </Box>
    </Box>
  )
}
