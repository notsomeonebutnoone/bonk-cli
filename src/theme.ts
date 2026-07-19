import React, {createContext, type ReactNode, useContext} from 'react'

export const THEME_MODES = ['dark', 'light', 'purple'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

export type Theme = {
  mode: ThemeMode
  background: string
  /** Main body text */
  primary: string
  /** Focus, frames, progress fill, selection, brand mark */
  accent: string
  /** Secondary labels and hints */
  muted: string
  /** Panel / input borders */
  border: string
  /** Text on solid accent buttons */
  dark: string
  dimSecondary: boolean
  inverseButton: boolean
}

const themes: Record<ThemeMode, Theme> = {
  dark: {
    mode: 'dark',
    background: '#09090b',
    primary: '#FAFAFA',
    accent: '#EAB308',
    muted: '#A1A1AA',
    border: '#EAB308',
    dark: '#09090b',
    dimSecondary: false,
    inverseButton: false,
  },
  light: {
    mode: 'light',
    background: '#FAFAF9',
    primary: '#18181B',
    accent: '#A16207',
    muted: '#71717A',
    border: '#A16207',
    dark: '#FAFAF9',
    dimSecondary: false,
    inverseButton: false,
  },
  purple: {
    mode: 'purple',
    background: '#0C0A14',
    primary: '#F5F3FF',
    accent: '#A78BFA',
    muted: '#A1A1AA',
    border: '#8B5CF6',
    dark: '#0C0A14',
    dimSecondary: false,
    inverseButton: false,
  },
}

const ThemeContext = createContext<Theme>(themes.dark)

export function themeFor(mode: ThemeMode): Theme {
  return themes[mode]
}

export function ThemeProvider({mode, children}: {mode: ThemeMode; children: ReactNode}) {
  return React.createElement(ThemeContext.Provider, {value: themeFor(mode)}, children)
}

export function useTheme(): Theme {
  return useContext(ThemeContext)
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value)
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length]!
}
