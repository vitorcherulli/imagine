# Imagine — Portainer

## Arquivo para copiar e colar

**Use só este:**

`docker/docker-compose.portainer.stack.yml`

Cole inteiro no Portainer → Stacks → Add stack → Web editor.

## Pré-requisitos no servidor

1. Rede Docker `traefik_public` (Traefik)
2. PostgreSQL acessível como `postgres:5432`, database `imagine`
3. DNS `imagine.papo.global` → servidor
4. Registry no Portainer: `taticweb/imagine-web:latest` e `taticweb/imagine-web-builder:latest`

## Imagens (Docker Hub)

| Imagem | Tag |
|--------|-----|
| `taticweb/imagine-web` | `latest` |
| `taticweb/imagine-web-builder` | `latest` |

Sim — **`latest` = última versão publicada**. Para fixar versão, troque `:latest` por `:1.0.0` etc.

## Modelos de IA (produção)

| Uso | Modelo |
|-----|--------|
| Roteiro / metadados | `anthropic/claude-opus-4.7` |
| Imagens / thumbnail | `bytedance-seed/seedream-4.5` |
| Vídeo | `kwaivgi/kling-v3.0-pro` |
| Narração | `google/gemini-3.1-flash-tts-preview` |
| Música | `google/lyria-3-pro-preview` |

## Outros arquivos em `docker/`

Stacks separadas (postgres, minio) — **não use** se Postgres e S3 já existem no servidor.
