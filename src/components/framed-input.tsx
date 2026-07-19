import React, {type ReactNode} from 'react'
import {Box, Text} from 'ink'
import {useTheme} from '../theme.js'

/** Total columns the button occupies (label + 2 cells padding per side). */
const frameButtonWidth = (label: string) => label.length + 4

/**
 * Modern framed input: accent border, accent CTA.
 * Title sits on the top edge; optional button fuses to the right.
 */
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
  const inner = width - 2
  const tail = Math.max(0, inner - title.length - 3)
  const buttonW = button ? frameButtonWidth(button) : 0
  const fillColor = buttonDim ? theme.muted : theme.accent
  const frameColor = theme.border
  return (
    <Box width={width + buttonW}>
      <Box flexDirection="column" width={width}>
        <Text>
          <Text color={frameColor}>{'╭─ '}</Text>
          <Text color={theme.accent} bold>
            {title}
          </Text>
          <Text color={frameColor}>{` ${'─'.repeat(tail)}${button ? '─' : '╮'}`}</Text>
        </Text>
        <Box width={width} height={1} overflow="hidden">
          <Text color={frameColor}>│ </Text>
          <Text color={theme.accent}>❯ </Text>
          <Box flexGrow={1} height={1} overflow="hidden">
            {children}
          </Box>
          {button ? null : <Text color={frameColor}> │</Text>}
        </Box>
        <Text color={frameColor}>{`╰${'─'.repeat(inner)}${button ? '─' : '╯'}`}</Text>
      </Box>
      {button ? (
        <Box flexDirection="column" width={buttonW}>
          <Text bold color={fillColor}>
            {'▄'.repeat(buttonW)}
          </Text>
          <Text
            backgroundColor={theme.inverseButton ? undefined : fillColor}
            color={theme.inverseButton ? undefined : theme.dark}
            inverse={theme.inverseButton && !buttonDim}
            bold
          >{`  ${button}  `}</Text>
          <Text bold color={fillColor}>
            {'▀'.repeat(buttonW)}
          </Text>
        </Box>
      ) : null}
    </Box>
  )
}
