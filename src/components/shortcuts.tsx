import React, {type ReactNode} from 'react'
import {Text} from 'ink'
import {useTheme} from '../theme.js'

/** Compact keycaps with quiet labels. */
export function Shortcuts({items, leading}: {items: Array<[key: string, label: string]>; leading?: ReactNode}) {
  const theme = useTheme()
  return (
    <Text>
      {leading ? (
        <>
          {leading}
          <Text color={theme.border}>{'   │   '}</Text>
        </>
      ) : null}
      {items.map(([key, label], index) => (
        <Text key={`${key}-${label}`}>
          {index > 0 ? <Text color={theme.border}>{'   '}</Text> : null}
          <Text color={theme.accent} backgroundColor={theme.surfaceAlt} bold>{` ${key} `}</Text>
          <Text color={theme.muted}> {label}</Text>
        </Text>
      ))}
    </Text>
  )
}
