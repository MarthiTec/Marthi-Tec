# ADR 0002 — Plataforma pública como Discloud Site (`marthi-totem`)

- **Status:** Accepted  
- **Date:** 2026-09-18  
- **Deciders:** MarthiTec (Matheus)

## Context

A Marthi precisa de acesso externo para demos (home + totem Cell Ponto + login). O app `1789690624065` (Marthi Platform) rodava o código certo na porta 8080, mas estava tipado como **Bot** na Discloud. Bots não vinculam subdomínio `.discloud.app`. O subdomínio `marthi-totem` ficava **Livre** e o DNS não resolvia.

Além disso, o upload de Site exige:

1. `discloud.config` com `TYPE=site` e `ID=<subdomínio>`
2. `package.json` raiz com `main` / `start` clássicos
3. Arquivo `MAIN` (ex.: `dist/index.js`) **presente no ZIP** no momento do upload

`marthi-tec.discloud.app` já está **Em uso** pela Evolution API — não pode ser reutilizado para a plataforma.

## Decision

1. Publicar a plataforma como **Site Discloud separado** com `ID=marthi-totem` → `https://marthi-totem.discloud.app`.
2. Manter API Node + React no mesmo processo: build gera `dist/` (API) e `apps/web/dist` (SPA); a API serve o static.
3. Upload via **ZIP novo** (não Commit no Bot legado) quando for criar o Site.
4. Incluir `dist/` e `apps/web/dist` no artefato de upload; `BUILD` na Discloud continua podendo rebuildar.

## Alternatives considered

| Option | Why rejected / deferred |
|--------|-------------------------|
| Continuar só no Bot `1789690624065` | Sem URL pública |
| Reusar `marthi-tec.discloud.app` | Ocupado pela Evolution |
| Túnel (loca.lt etc.) | Instável para demo de cliente |
| Front e API em apps Discloud separados | Mais custo/ops no MVP |

## Consequences

**Positive**

- URL estável para comercial e demos
- Um único origin (cookies/API relativos mais simples)
- Bot legado pode permanecer para experimentos internos

**Negative / follow-ups**

- Dois apps Discloud para o mesmo repo (Bot + Site) até migrar 100%
- Variáveis de produção (DB, JWT, Evolution, Google) precisam ser copiadas para o **Site**
- Google OAuth: adicionar origin/redirect do domínio público

## References

- `discloud.config`
- `.cursor/skills/discloud-marthi-deploy/SKILL.md`
- `docs/specs/platform-public-site.md`
- Discloud docs: Websites e APIs, package.json, subdomain states
