import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CONFIG_DIR = path.join(os.homedir(), '.config', 'bonk')
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json')

export const DEFAULT_DOWNLOAD_DIR = path.join(os.homedir(), 'Downloads')

type Settings = {
  downloadDir?: string
}

/** Expand a leading ~ and make relative paths unambiguous. */
export function resolveDownloadDirectory(
  value: string,
  cwd = process.cwd(),
  home = os.homedir(),
): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('enter a folder path')
  if (trimmed.includes('\0')) throw new Error('folder path contains an invalid character')
  if (trimmed.startsWith('~') && trimmed !== '~' && !/^~[\\/]/.test(trimmed)) {
    throw new Error('use ~/folder rather than another user’s home shortcut')
  }

  const expanded = trimmed === '~'
    ? home
    : /^~[\\/]/.test(trimmed)
      ? path.join(home, trimmed.slice(2))
      : trimmed
  return path.resolve(cwd, expanded)
}

export function loadDownloadDirectory(): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) as Settings
    return parsed.downloadDir ? resolveDownloadDirectory(parsed.downloadDir) : DEFAULT_DOWNLOAD_DIR
  } catch {
    return DEFAULT_DOWNLOAD_DIR
  }
}

/** Validate, create, and remember the chosen download directory. */
export function saveDownloadDirectory(value: string): string {
  const downloadDir = resolveDownloadDirectory(value)
  fs.mkdirSync(downloadDir, {recursive: true})
  fs.accessSync(downloadDir, fs.constants.W_OK)
  fs.mkdirSync(CONFIG_DIR, {recursive: true})

  let current: Settings = {}
  try {
    current = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) as Settings
  } catch {
    // first run or a malformed old settings file — replace it
  }
  fs.writeFileSync(SETTINGS_FILE, `${JSON.stringify({...current, downloadDir}, null, 2)}\n`)
  return downloadDir
}
