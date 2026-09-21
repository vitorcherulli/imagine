# Imagine

An AI video studio: from idea to script, from timeline to export.

Describe a story and Imagine helps write the narration, find or generate images and clips, assemble them on a Premiere-style horizontal timeline, and export the finished video — plus YouTube metadata and a Premiere pack if you want them.

## Product screenshots

### Project library

Folders, covers, status, and shortcuts for **New video**, **New publication**, and dubbing. Recent work stays up front.

![Project library — cards, folders, and shortcuts for a new video](docs/screenshots/01-projetos.jpg)

### Script Studio

Script editor with speech emphasis, TTS, pronunciation, music pauses, and reference photos. When the text is ready, apply it to the timeline.

![Script Studio — script document with narration and emphasis tools](docs/screenshots/02-script-studio.jpg)

### Timeline

Tracks for video, keyframes, scene audio, narration, music, and text, with a vertical Reels / 9:16 preview on the right.

![Premiere-style timeline — visual blocks, narration, and 9:16 preview](docs/screenshots/03-timeline.jpg)

## What Imagine does

- **Story videos** — brief (genre, style, tone, duration, 9:16 / 16:9) with AI-assisted generation
- **Script Studio** — paragraph script, emphasis, pronunciation, music moments, reference photos and videos
- **Timeline** — drag, reorder, scrub; tracks for video, keyframes, scene audio, narration, and music
- **Media** — AI-generated keyframes and clips, or imported stock / search
- **TTS narration** — multiple voices and models; delivery and emphasis per beat
- **Project DNA, Avatars, and Scenarios** — reusable visual identity, characters, and locations
- **Dubbing** — transcribe, translate, and re-voice MP4/MP3
- **Publications** — carousels / slides for social
- **YouTube** — thumbnail, titles, description, and tags
- **Export** — final MP4 (FFmpeg) or ZIP if encoding fails; Premiere pack

## Typical flow

1. **New project** — idea, format, cast, and style
2. **Script** — write or generate in Script Studio
3. **Pronunciation and pauses** — lock speech and music breaths
4. **Media** — keyframes, stock, and/or generated video per block
5. **Narration** — TTS per paragraph
6. **Apply to timeline** — assemble, reorder, preview
7. **YouTube** — thumbnail and metadata
8. **Export** — MP4 or Premiere pack

## Stack

| Layer | Tech |
|--------|------|
| App | Next.js 14 (App Router) + TypeScript |
| UI | Tailwind CSS + Radix |
| Auth | Clerk |
| Data | Drizzle ORM — SQLite in dev, Postgres in production |
| AI | OpenRouter (LLM, image, video, TTS, music) |
| Extra TTS | ElevenLabs (optional) |
| Export | FFmpeg (`fluent-ffmpeg`), ZIP fallback |
| Storage | disk under `public/generated/` (S3 wired in the stacks, not fully in app code yet) |

Default models (overridable via env):

| Use | Model |
|-----|--------|
| Script / metadata | `anthropic/claude-opus-4.7` |
| Images / thumbnail | `bytedance-seed/seedream-4.5` |
| Video | `kwaivgi/kling-v3.0-pro` |
| Narration | `google/gemini-3.1-flash-tts-preview` |
| Music | `google/lyria-3-pro-preview` |

## Local setup

Requires Node 20+ and FFmpeg on PATH.

```bash
npm install
npm run db:migrate
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

Create a `.env.local` in the repo root with at least:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=./data/app.db

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

OPENROUTER_API_KEY=
```

Optional: `ELEVENLABS_API_KEY`, `PEXELS_API_KEY`, `SERPER_API_KEY`, `GOOGLE_CUSTOM_SEARCH_API_KEY` + `GOOGLE_CSE_ID` (image/video search and research).

## Docker / Portainer

Swarm + Traefik stacks live in [`docker/`](docker/README.md).

For production, use **`docker/docker-compose.portainer.stack.yml`**.

There are also MinIO and Postgres stacks if the server does not already have storage and a database.

**Storage:** the app still writes media to `public/generated/` (disk). `S3_*` variables are already in the stacks; the app integration is not finished yet.

## Layout

```
imagine/
├── src/
│   ├── app/             # Next.js routes (projects, script, gallery, DNA, dubs…)
│   ├── components/      # UI, Script Studio, Timeline
│   ├── lib/
│   │   ├── db/          # Drizzle (SQLite / Postgres)
│   │   └── openrouter/  # AI clients
│   └── middleware.ts    # Clerk
├── docs/screenshots/    # images for this README
├── docker/              # compose / Portainer
├── drizzle/             # migrations
├── editor-ia/           # separate experiment (Premiere + AI)
├── public/generated/    # local media (gitignored)
└── data/                # SQLite (gitignored)
```

`editor-ia/` is not part of the web app flow — see [`editor-ia/README.md`](editor-ia/README.md).
