# Security

## Reporting a vulnerability

If you find a security issue (exposed keys, auth bypass, RCE, etc.), please
**do not** open a public GitHub issue.

Email the maintainer privately (GitHub profile / repo owner) with steps to
reproduce. We will rotate credentials and patch as needed.

## Secrets policy

- Never commit `.env.local`, `docker/.env.portainer`, or real API keys.
- Use [`.env.example`](.env.example) and [`docker/.env.portainer.example`](docker/.env.portainer.example) as templates only.
- Production secrets belong in Portainer / your host env — not in YAML committed to git.

## Before making this repository public

1. Rotate any keys that ever lived in an old commit or chat (OpenRouter, Clerk, Postgres, S3, etc.).
2. Confirm `git log -p` has no live `sk-or-v1-…` / `sk_test_…` / cloud passwords.
3. Keep production credentials only on the server / Portainer.

History was scrubbed of known leaked values; **rotation is still required** because
cached clones or mirrors may retain old objects for a while.
