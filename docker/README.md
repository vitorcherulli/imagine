# Imagine — Portainer

## Stack to paste

Use:

`docker/docker-compose.portainer.stack.yml`

Portainer → Stacks → Add stack → Web editor. Set **environment variables** from
[`docker/.env.portainer.example`](.env.portainer.example) (never commit real keys).

## Server prerequisites

1. Docker network `traefik_public` (Traefik)
2. PostgreSQL reachable as `postgres:5432`, database `imagine`
3. DNS for your `APP_HOST` → server
4. Images available to Portainer, e.g. `your-registry/imagine-web:latest` and `imagine-web-builder:latest`

Default compose files reference `taticweb/imagine-web` / `taticweb/imagine-web-builder` — change the image names if you publish under another registry.

## AI models (defaults)

| Use | Model |
|-----|--------|
| Script / metadata | `anthropic/claude-opus-4.7` |
| Images / thumbnail | `bytedance-seed/seedream-4.5` |
| Video | `kwaivgi/kling-v3.0-pro` |
| Narration | `google/gemini-3.1-flash-tts-preview` |
| Music | `google/lyria-3-pro-preview` |

Override with `OPENROUTER_*_MODEL` env vars.

## Other files in `docker/`

Separate Postgres / MinIO stacks — skip them if you already have DB and S3.
