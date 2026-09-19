---
name: discloud-marthi-deploy
description: >-
  Deploy and troubleshoot the Marthi platform Site on Discloud (TYPE=site,
  marthi-totem.discloud.app). Use when uploading ZIP, fixing package.json/MAIN,
  subdomain Livre vs Em uso, Bot vs Site confusion, or Discloud build/start errors.
---

# Discloud Marthi Deploy

## Goal

Public URL: `https://marthi-totem.discloud.app`  
Config: root `discloud.config` with `TYPE=site` and `ID=marthi-totem`.

## Hard rules

1. **Site ≠ Bot.** A Bot app (numeric ID like `1789690624065`) never activates `*.discloud.app`. Always create a **new** Site via **+ Upload**, do not rely on Commit into an existing Bot.
2. **MAIN must exist in the ZIP** before upload. Discloud validates `MAIN=dist/index.js` inside the archive. Run `npm run build` and keep `dist/` **out** of `.discloudignore`.
3. App must listen on `0.0.0.0:8080` (already default in API).
4. Subdomain must be registered under Domínios. Status **Livre** = not bound; **Em uso** = Site is routing.

## Deploy checklist

```text
- [ ] npm run build  → dist/index.js and apps/web/dist/index.html exist
- [ ] discloud.zip (or `discloud zip -o marthi-platform-site.zip`)
- [ ] Confirm zip contains dist/index.js and discloud.config
- [ ] Dashboard → Aplicações → + Upload → ZIP (new app)
- [ ] Domínios: marthi-totem → Em uso
- [ ] GET https://marthi-totem.discloud.app/health → 200
- [ ] GET https://marthi-totem.discloud.app/ → homepage
```

## package.json requirements (root)

Discloud expects a classic Node manifest:

- `"main": "dist/index.js"`
- `"scripts.start": "node dist/index.js"`
- `"scripts.build"` builds API + web
- ASCII-safe description (avoid fancy dashes if upload parsers choke)
- Prefer `npm --prefix apps/web run build` over fragile workspace-only paths in BUILD

## .discloudignore

Ignore: `node_modules/`, `.env*`, `packages/` (unused), `docs/`, zips.  
**Do not ignore** root `dist/` or `apps/web/dist/` for Site ZIP uploads.

## Common errors

| Error | Cause | Fix |
|-------|--------|-----|
| MAIN `dist/index.js` not in zip | `dist/` ignored or not built | Build, include `dist/`, re-zip |
| package.json error | Missing `main`, bad workspaces, odd encoding | Align root package.json; hoist web build deps |
| Domain Livre / DNS fail | App is Bot or wrong ID | New Upload as Site with `ID=marthi-totem` |
| Service up, no public URL | Commit on Bot only | Create Site app |

## After go-live

Set Site **Variáveis** (app `marthi-totem`, not the Bot):

- `GOOGLE_CLIENT_ID` — same OAuth Web client ID as local
- `JWT_SECRET` — required for sessions
- `AUTH_DEV_EMAIL` / `AUTH_DEV_PASSWORD` — optional password login
- DB_* / `EVOLUTION_*` as needed

Google Cloud Console → Credentials → OAuth client:

- Authorized JavaScript origins: `https://marthi-totem.discloud.app`
- (Keep `http://localhost:5173` for local)

The SPA reads `googleClientId` from `GET /api/v1/auth/providers` — no rebuild needed after setting `GOOGLE_CLIENT_ID` on the Site (restart app).

## Related docs

- `docs/specs/platform-public-site.md`
- `docs/adr/0002-discloud-site-public-platform.md`
- `docs/decisions.md`
