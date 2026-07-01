# Versão golden (melhor até agora)

Marcada em **2026-06-28** — referência estável para produção e rollback.

## Imagens Docker Hub (fixar por digest)

| Serviço | Imagem | Digest |
|---------|--------|--------|
| **web** | `taticweb/imagine-web` | `sha256:f1a8c3db4467db2abffab4da6b5cdd4739c4fbcb768ad4c3d237feb5151fabf9` |
| **migrator** | `taticweb/imagine-web-builder` | `sha256:b1c43762333eccfaaedb73905ce655d32e772b616ab941806b87b0cf6339b273` |

## Portainer — pinar esta versão (recomendado)

No stack, troque `:latest` por digest:

```yaml
migrator:
  image: taticweb/imagine-web-builder@sha256:b1c43762333eccfaaedb73905ce655d32e772b616ab941806b87b0cf6339b273

web:
  image: taticweb/imagine-web@sha256:f1a8c3db4467db2abffab4da6b5cdd4739c4fbcb768ad4c3d237feb5151fabf9
```

Assim o Portainer **não puxa** builds novas automaticamente — fica nesta versão até você mudar de propósito.

## Rollback rápido (servidor)

```bash
docker service update --image taticweb/imagine-web@sha256:f1a8c3db4467db2abffab4da6b5cdd4739c4fbcb768ad4c3d237feb5151fabf9 --force <stack>_web
docker service update --image taticweb/imagine-web-builder@sha256:b1c43762333eccfaaedb73905ce655d32e772b616ab941806b87b0cf6339b273 --force <stack>_migrator
```

## Notas

- Esta build inclui Script Studio, timeline livre, media library, ElevenLabs, MinIO-only, fix migrate-pg no web.
- Novos deploys com `:latest` podem superar esta versão — só atualize o golden quando houver consenso de que a nova build é melhor.
