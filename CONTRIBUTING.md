# Contributing to Imagine

Thanks for contributing. Keep changes focused and easy to review.

## Prerequisites

- Node.js 20+
- FFmpeg on `PATH` (export / timeline)
- Accounts as needed: [Clerk](https://clerk.com), [OpenRouter](https://openrouter.ai)

## Local setup

```bash
cp .env.example .env.local
# Fill at least: Clerk keys + OPENROUTER_API_KEY
npm install
npm run db:migrate
npm run dev
```

App: [http://localhost:3000](http://localhost:3000)

**Do not commit** `.env.local`, `docker/.env.portainer`, API keys, or media under `public/generated/` / `data/`.

## Optional integrations

| Feature | Env |
|---------|-----|
| ElevenLabs TTS | `ELEVENLABS_API_KEY` |
| Pexels stock | `PEXELS_API_KEY` |
| Serper / Tavily search | `SERPER_API_KEY` / `TAVILY_API_KEY` |
| Google image search | `GOOGLE_CUSTOM_SEARCH_API_KEY` + `GOOGLE_CSE_ID` |
| S3 storage | `S3_*` (see `.env.example`) |

AI usage is billed to **your** OpenRouter (and other) accounts.

## Pull requests

1. Branch from `main`
2. Prefer small, focused PRs
3. Describe what changed and how you tested it
4. Do not include secrets, credentials, or large generated media

## Security

See [SECURITY.md](SECURITY.md). Never open an issue that pastes live API keys.
