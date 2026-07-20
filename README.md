# bonk

<p align="center">
  <img src="assets/banner.png" alt="bonk — terminal UI with gold accent, link drop, quality picker, and progress" width="100%">
</p>

**Bring authorized media into your edit without fighting the codec.**

**bonk** is a full-screen terminal tool for editors, creators, researchers, and archivists. Give it a media URL you are permitted to access and copy, choose a quality (or audio-only MP3), and get a local file prepared for smooth import into Adobe Premiere Pro—H.264/AAC in MP4 when conversion is needed.

Powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp), bonk works with YouTube, X/Twitter, Instagram, Threads, TikTok, Snapchat and many more sites. Playlist URLs can download every available clip or one selected entry. Site support is technical compatibility, not permission to download, and bonk is not affiliated with or endorsed by any supported platform.

```sh
npx bonk-cli
npx bonk-cli 'https://youtu.be/dQw4w9WgXcQ'
bonk --update   # refresh the bundled yt-dlp
```

## What bonk solves

Streaming platforms commonly deliver **VP9 or AV1** video that Premiere may reject even when the file has an `.mp4` extension.

bonk prefers native **H.264 + AAC** and only re-encodes when required (`veryfast` x264). That keeps compatible downloads fast while still producing dependable edit-ready output.

| What arrived | What you get | Cost |
|--------------|--------------|------|
| H.264 + AAC MP4 | keep / rename | basically free |
| H.264 + other audio | copy video, AAC audio | quick |
| VP9 / AV1 | H.264 re-encode | slower, only when needed |

## Quick start

**npm package name is `bonk-cli`** (plain `bonk` was already taken). The command is still `bonk`.

```sh
# one-shot
npx bonk-cli

# global
npm install -g bonk-cli
bonk
```

### Requirements

- Node.js 18 or newer
- `ffmpeg` on `PATH`, or the bundled `ffmpeg-static` fallback
- A Netscape-format `cookies.txt` when a site requires authenticated access

### cookies.txt

bonk always runs yt-dlp like this:

```sh
yt-dlp --cookies cookies.txt --js-runtimes node --remote-components ejs:github [URL]
```

Put the export at either:

- `./cookies.txt` (cwd — preferred)
- `~/.bonk/cookies.txt`

Browser extensions such as “Get cookies.txt LOCALLY” can create this file while you are signed in.

> [!CAUTION]
> A cookies export can contain active session credentials. Treat it like a password: never commit it, upload it, paste it into an issue, or share it with another person. Use only cookies from an account you own or are authorized to operate, revoke exposed sessions immediately, and follow the platform’s account and access rules. This repository ignores `cookies.txt`, but copies outside the repository are still your responsibility.

## Commands

```sh
bonk                              # interactive — drop a link
bonk <url>                        # jump straight into the flow
bonk <playlist-url>               # download all or pick one, then choose quality
bonk --theme dark|light|purple    # start on a palette
bonk -U / --update                # self-update ~/.bonk/bin/yt-dlp
bonk -h / -v                      # help / version
```

Inside the TUI:

| Input | Action |
|-------|--------|
| `↵` | bonk / confirm |
| `↑` `↓` | move in lists |
| `⇥` | pull a link from the clipboard (when offered) |
| `esc` | back / cancel |
| `^l` | choose and remember the download folder |
| `^t` | cycle theme |
| `^c` | quit |
| mouse | button, lists, footer, logo (home) |

Files land in **`~/Downloads`** by default. Press `^l` from an idle or selection screen to choose another folder; bonk creates it when needed and remembers it for future launches. The final path is printed when you leave the full-screen UI.

### Themes

| Mode | Vibe |
|------|------|
| `dark` (default) | near-black + gold |
| `light` | warm paper + amber |
| `purple` | deep violet + lilac |

### Updating yt-dlp

On first need, bonk can install a private binary under `~/.bonk/bin`. Keep it current with:

```sh
bonk --update
# same as: bonk -U   → runs yt-dlp -U on the bundled binary
```

## How it works

- **yt-dlp** — fixed base flags (cookies + node runtime + remote EJS)
- **ffmpeg** — merge + Premiere-safe pass (`ffmpeg-static` fallback)
- **Ink** — React for the terminal UI

## Develop

```sh
npm install
npm run build
npm run dev
node dist/cli.js <url>
npm test && npm run typecheck
```

## Fair use, copyright, and responsible use

> [!IMPORTANT]
> This section is a usage notice, not legal advice, a license to third-party content, or a promise that any particular download is lawful. No disclaimer can prevent a platform, rightsholder, regulator, or other person from making a claim. Copyright, contract, privacy, publicity, data-protection, computer-misuse, and anti-circumvention rules vary by country and by facts. If your use may be disputed, commercial, sensitive, or high-risk, obtain permission and advice from a qualified lawyer in your jurisdiction before downloading.

### Authorized uses only

bonk is a general-purpose, local media acquisition and format-preparation tool. It does not grant access to content, transfer copyright, determine ownership, provide a fair-use ruling, or give you permission that a creator, rightsholder, platform, or law has not given you. Use it only when at least one sound legal basis applies, such as:

- you created and own the content;
- the relevant rightsholder gave you permission;
- the content is in the public domain;
- a license—such as an applicable Creative Commons license—allows your exact use and you follow all attribution, share-alike, noncommercial, and no-derivatives conditions;
- the platform provides an authorized download mechanism and your use stays within its rules; or
- a limitation or exception under the law that applies to you, such as fair use or fair dealing, genuinely covers the specific use.

Public availability is not the same as public-domain status. Being able to view, stream, or technically retrieve a file does not by itself confer a right to copy, retain, edit, publish, sell, license, train on, perform, or redistribute it. Purchasing access, holding a subscription, crediting the creator, using only part of a work, or using a work for a nonprofit purpose also does not automatically make copying lawful.

### Fair use is a case-by-case defense

In the United States, [17 U.S.C. § 107](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title17-section107) identifies examples such as criticism, comment, news reporting, teaching, scholarship, and research, but no category is automatically protected. Courts weigh at least four factors together:

1. **Purpose and character:** whether the use is commercial or nonprofit and whether it adds a genuinely new purpose or character instead of substituting for the original.
2. **Nature of the work:** factual and published material may receive different treatment from highly creative or unpublished material.
3. **Amount and substantiality:** both how much was taken and whether the portion includes the “heart” of the work. Copying an entire video or playlist can weigh against fair use, although no fixed percentage decides every case.
4. **Market effect:** whether the use replaces authorized access, licensing, sales, subscriptions, or other actual or reasonably expected markets, including the harm that widespread similar use could cause.

The factors can point in different directions, and only a court can conclusively decide a disputed fair-use claim. “Personal use,” “educational use,” “no copyright intended,” attribution, or the absence of profit is not a complete legal test. Outside the United States, fair dealing and other exceptions may be narrower, purpose-specific, or subject to additional requirements. See the [U.S. Copyright Office Fair Use Index](https://copyright.gov/fair-use/) for official background and case summaries.

### Platform rules and access controls still matter

Each site has its own terms, licenses, technical restrictions, and approved interfaces. Those rules can change and may restrict downloads, automated access, scraping, account-cookie use, reproduction, or redistribution even where content is publicly viewable. You are responsible for reviewing the current terms for every source and for resolving any conflict between platform terms and your intended use.

Do not use bonk to bypass paywalls, subscriptions you have not purchased, digital rights management, encryption, passwords, authentication, geographic controls, rate limits, robots restrictions, or other access or copy controls. Do not use credentials belonging to another person, access private or non-public media without authorization, or defeat a technological measure. In the United States, [17 U.S.C. § 1201](https://uscode.house.gov/view.xhtml?req=%28title%3A17+section%3A1201+edition%3Aprelim%29) can prohibit circumvention separately from copyright infringement, subject to limited statutory and temporary exemptions. A potentially noninfringing end use does not automatically authorize circumvention.

### No unlawful distribution or harmful use

You are solely responsible for the URLs you submit, the credentials you provide, the files you create, and every later use or distribution of those files. In particular, do not use bonk to:

- pirate, mirror, re-upload, sell, sublicense, publicly perform, or distribute content without authorization;
- remove or falsify attribution, watermarks, copyright notices, license terms, or rights-management information;
- infringe copyright, trademark, privacy, publicity, contractual, database, moral, or other rights;
- obtain or spread private, leaked, intimate, exploitative, harassing, defamatory, deceptive, or otherwise unlawful material;
- collect personal data unlawfully, stalk people, facilitate abuse, or expose minors or vulnerable people to harm;
- impersonate a creator or imply sponsorship, affiliation, ownership, or endorsement that does not exist; or
- help another person do anything prohibited above.

If you share a lawful excerpt or derivative work, use no more source material than your purpose reasonably requires, add meaningful original context where relevant, preserve required notices, provide proper attribution, link to the authorized source when appropriate, and avoid replacing demand for the original. Delete files when permission expires, a governing license requires deletion, or continued possession becomes unlawful.

### Project role and third-party misuse

bonk runs on the user’s device. The project and its maintainers do not host, select, supply, index, verify, monitor, or distribute the media that users choose to access, and they cannot control copies after users create them. References to platforms describe interoperability only; all platform names and trademarks belong to their respective owners.

The availability of source code or a technical capability is not encouragement, authorization, or assistance to infringe rights. Users must make their own lawful-use determination before each operation and assume responsibility for their conduct. To the maximum extent permitted by applicable law, the software is provided under the warranty and liability terms in the [MIT License](LICENSE). Those terms do not override rights or obligations that cannot legally be waived, and this notice does not guarantee that a maintainer will avoid complaints, demands, takedowns, investigations, or litigation.

## Credits

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — the download engine
- [Ink](https://github.com/vadimdemedes/ink) — terminal React
- Nods to [yoinks](https://github.com/pablostanley/yoinks) by [Pablo Stanley](https://github.com/pablostanley) for popularizing a full-screen paste → pick → download flow in the terminal

## License

[MIT](LICENSE)
