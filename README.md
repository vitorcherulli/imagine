# Imagine – Story Timeline App

A focused story-creation web app: describe a story idea, the AI generates narrative blocks, keyframe images, video clips and TTS narration, and you assemble it on a Premiere-Pro-style horizontal timeline. Then export the final video and YouTube metadata.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + Radix primitives
- Clerk (auth)
- Drizzle ORM + SQLite (`data/app.db`)
- OpenRouter for all AI calls
  - LLM: `anthropic/claude-opus-4.7` (story, suggestions, metadata)
  - Image: `bytedance-seed/seedream-4.5` (keyframes, thumbnail)
  - Video: `bytedance/seedance-2.0` (per-block video)
  - TTS: `hexgrad/kokoro-82m` (narration)
- `fluent-ffmpeg` for export (with ZIP fallback)

## Setup

```bash
npm install
npm run db:migrate
npm run dev
```

`.env.local` is already filled with the keys for development. App runs on `http://localhost:3000`.

## Docker / Portainer

Stacks de exemplo para Swarm + Traefik em [`docker/`](docker/README.md):

- `docker/docker-compose.portainer.minio.yml` — MinIO (servidor de arquivos S3)
- `docker/docker-compose.portainer.yml` — app (migrator + web)
- `docker/docker-compose.yml` — MinIO local para dev

**Storage:** o app ainda grava mídia em `public/generated/` (disco). As variáveis `S3_*` já estão nos stacks, mas a integração no código ainda precisa ser feita.

## Folder layout

```
imagine/
├── src/
│   ├── app/             # Next.js routes
│   ├── components/      # UI + Timeline
│   ├── lib/
│   │   ├── db/          # Drizzle schema + client
│   │   └── openrouter/  # OpenRouter API helpers
│   └── middleware.ts    # Clerk middleware
├── public/generated/    # Local media output
└── data/                # SQLite database
```

## Flow

1. New Project → describe the story, pick genre, style, tone, duration
2. Generate Story → LLM produces narrative blocks
3. Generate Keyframes → image per block
4. Generate Media → video + narration per block (parallel)
5. Preview on timeline (drag/reorder/scrub)
6. YouTube Metadata → thumbnail, title options, description, tags
7. Export → final.mp4 (or ZIP fallback)
