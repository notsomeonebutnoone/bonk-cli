import React, {type ReactNode} from 'react'
import {Text} from 'ink'
import {useTheme} from '../theme.js'

/** Keys in accent, labels muted, airy separators. */
export function Shortcuts({items, leading}: {items: Array<[key: string, label: string]>; leading?: ReactNode}) {
  const theme = useTheme()
  return (
    <Text>
      {leading ? (
        <>
          {leading}
          <Text color={theme.muted}>{'  ·  '}</Text>
        </>
      ) : null}
      {items.map(([key, label], index) => (
        <Text key={`${key}-${label}`}>
          {index > 0 ? <Text color={theme.muted}>{'  ·  '}</Text> : null}
          <Text color={theme.accent}>{key}</Text>
          <Text color={theme.muted}> {label}</Text>
        </Text>
      ))}
    </Text>
  )
}
