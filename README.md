# bonk

bonk any video. paste. bonk. done.

Download videos from YouTube, X/Twitter, Instagram, Threads, TikTok and
1,800+ other sites — right from your terminal. Paste a url, pick a
resolution (or audio-only mp3), done. Files are prepared so they import
cleanly into **Adobe Premiere Pro** (H.264 + AAC in MP4 when needed).

## Inspired by

**bonk** is inspired by [**yoinks**](https://github.com/pablostanley/yoinks)
by [**Pablo Stanley**](https://github.com/pablostanley) — the full-screen
terminal flow of paste → pick a format → download, built with
[Ink](https://github.com/vadimdemedes/ink).

Huge credit to Pablo for the original idea, UX, and open-source work on
yoinks. bonk reuses that interaction model and builds its own theming,
download pipeline (fixed `yt-dlp` base flags, cookies, Premiere-safe
output), and branding on top.

- yoinks repo: https://github.com/pablostanley/yoinks  
- Author: [Pablo Stanley](https://github.com/pablostanley) ([@pablostanley](https://github.com/pablostanley))

## Install / run

No install required — from any directory:

```sh
npx bonk-cli
npx bonk-cli https://youtu.be/dQw4w9WgXcQ
npx bonk-cli --theme purple
```

Or install the CLI globally (command is `bonk`):

```sh
npm install -g bonk-cli
bonk
```

> The unscoped name `bonk` is already taken on npm (unrelated 2012 package),
> so this ships as **`bonk-cli`**. The binary is still named `bonk`.

Requires **Node 18+**, **yt-dlp** (auto-fetched on first run if missing),
**ffmpeg** (PATH or bundled `ffmpeg-static`), and a **cookies.txt** file
in the directory you run from (or `~/.bonk/cookies.txt`).

## cookies.txt

Bonk always downloads with:

```sh
yt-dlp --cookies cookies.txt --js-runtimes node --remote-components ejs:github [URL]
```

Place a Netscape-format cookies export at one of:

- `./cookies.txt` (current working directory — preferred)
- `~/.bonk/cookies.txt`

Export cookies with a browser extension (e.g. “Get cookies.txt LOCALLY”)
while logged into the sites you need.

## Usage

```sh
$ bonk https://youtu.be/dQw4w9WgXcQ    # straight to the format picker
$ bonk                                 # prompts for a url
$ bonk --theme light                   # light theme
$ bonk --theme purple                  # purple accent theme
```

bonk takes over the terminal (full-screen, centered — and restores your
scrollback on exit). Pick a format with ↑/↓ (or j/k, or number keys) and
hit enter. `esc` goes back, `^c` quits. Or just use the mouse — the bonk
button, the format list and the footer hints are all clickable, and
clicking the logo takes you back home. Files are saved to `~/Downloads`,
and the file path is printed to your terminal when you're done.

### Themes

| Theme | Look |
|-------|------|
| `dark` (default) | Near-black with gold accent |
| `light` | Warm off-white with amber accent |
| `purple` | Deep violet with purple accent |

Press `^t` or click the theme control in the footer to cycle
`dark` → `light` → `purple`. Use `--theme <mode>` to start on one of them.

## Premiere Pro output

YouTube’s high-quality streams are often **VP9 (`vp09`)** or **AV1** inside an
`.mp4`. Premiere reports that as **“unsupported compression type”**.

Bonk always downloads with the exclusive base command:

```sh
yt-dlp --cookies cookies.txt --js-runtimes node --remote-components ejs:github [URL]
```

Then it makes the file Premiere-safe **as fast as possible**:

| Source codecs | What bonk does | Speed |
|---------------|----------------|-------|
| H.264 + AAC MP4 (preferred) | rename / keep | same as plain yt-dlp |
| H.264 + other audio | stream-copy video, AAC audio only | fast |
| VP9 / AV1 | re-encode H.264 `-preset veryfast` | slower (only when needed) |

Format selection prefers **native H.264** so most downloads take the instant path
and never run a full re-encode.

## How it works

- **yt-dlp** with a fixed base command (cookies + node JS runtime + remote EJS components).
- **ffmpeg** for merge + Premiere-safe handling (`ffmpeg-static` fallback).
- **Ink** — React for the terminal (same stack family as yoinks).

## Development

```sh
npm install
npm run build        # bundle to dist/ with tsup
npm run dev          # rebuild on change
node dist/cli.js <url>
npm run typecheck
```

## A note on fair use

bonk is a personal-archiving / edit-prep tool. Downloading content may
violate a platform's terms of service — only download what you have the
right to keep, and be excellent to creators.

## Credits

- **Inspired by** [yoinks](https://github.com/pablostanley/yoinks) by
  [Pablo Stanley](https://github.com/pablostanley) — original terminal video
  downloader UX (paste, pick, download).
- **yt-dlp** — download engine for 1,800+ sites.
- **Ink** — React for CLIs.

## License

[MIT](LICENSE)
