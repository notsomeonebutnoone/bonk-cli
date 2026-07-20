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
  /** Gradient partner and secondary focus */
  accentSecondary: string
  /** Secondary labels and hints */
  muted: string
  /** Panel / input borders */
  border: string
  /** Elevated card/input surface */
  surface: string
  /** Keycaps, tracks, and quiet fills */
  surfaceAlt: string
  /** Five scanlines used by the pixel wordmark. */
  logoGradient: readonly [string, string, string, string, string]
  logoShadow: string
  /** Text on solid accent buttons */
  dark: string
  dimSecondary: boolean
  inverseButton: boolean
}

const themes: Record<ThemeMode, Theme> = {
  dark: {
    mode: 'dark',
    background: '#070A0F',
    primary: '#EAF7FF',
    accent: '#22D3EE',
    accentSecondary: '#8B5CF6',
    muted: '#8292A8',
    border: '#254253',
    surface: '#0D151F',
    surfaceAlt: '#172433',
    logoGradient: ['#22D3EE', '#1CC4EB', '#38BDF8', '#6366F1', '#8B5CF6'],
    logoShadow: '#34295B',
    dark: '#071018',
    dimSecondary: false,
    inverseButton: false,
  },
  light: {
    mode: 'light',
    background: '#FAFAF9',
    primary: '#18181B',
    accent: '#0891B2',
    accentSecondary: '#7C3AED',
    muted: '#64748B',
    border: '#A5C4CE',
    surface: '#F1F7F8',
    surfaceAlt: '#E2EEF2',
    logoGradient: ['#06B6D4', '#0891B2', '#0284C7', '#4F46E5', '#7C3AED'],
    logoShadow: '#C4B5FD',
    dark: '#FAFAF9',
    dimSecondary: false,
    inverseButton: false,
  },
  purple: {
    mode: 'purple',
    background: '#0C0A14',
    primary: '#F5F3FF',
    accent: '#A78BFA',
    accentSecondary: '#22D3EE',
    muted: '#A1A1AA',
    border: '#46356D',
    surface: '#151024',
    surfaceAlt: '#241A3C',
    logoGradient: ['#22D3EE', '#38BDF8', '#6366F1', '#8B5CF6', '#C084FC'],
    logoShadow: '#3B285D',
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
