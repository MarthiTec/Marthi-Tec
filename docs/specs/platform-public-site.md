# Spec — Plataforma pública Marthi + Totem Cell Ponto

**Status:** Implemented (MVP demo)  
**URL:** https://marthi-totem.discloud.app  
**Owner:** MarthiTec

## 1. Problem

Precisamos de uma URL pública estável para demonstrar a Marthi a qualquer cliente: home de produto, planos, e demo do totem de autoatendimento (tenant Cell Ponto), com login da loja e roadmap OS/ERP.

## 2. Goals

- Home interativa da plataforma Marthi (marca em destaque).
- Seções: Quem somos, Produtos, Planos (Start / Growth / Scale).
- Demo totem multi-segmento; tenant atual = **Cell Ponto** (loja de celular).
- Login da operação (`/login`) separado da experiência do totem (`/totem`).
- Deploy público Discloud Site em `marthi-totem.discloud.app`.
- API Nest (auth/produtos) em Site separado `marthi-backend.discloud.app` (repo Marthi-Backend); Express no totem ainda cobre totem/POS.

## 3. Non-goals (MVP)

- Multi-tenant real em banco (só demo Cell Ponto).
- ERP / ordem de serviço completos (apenas roadmap na home).
- Domínio customizado próprio (só `.discloud.app` por enquanto).

## 4. User journeys

### Visitante / comercial

1. Abre `https://marthi-totem.discloud.app/`
2. Vê Marthi, segmentos, planos, CTAs
3. Abre demo totem Cell Ponto ou login da loja

### Cliente na loja (totem)

1. `/totem` — catálogo touch + carrossel
2. Confirma interesse → lead WhatsApp (Evolution)

### Operador da loja

1. `/login` — sessão da loja
2. Painel interno (evolutivo)

## 5. Functional requirements

| ID | Requirement |
|----|-------------|
| FR1 | Home com nav: Quem somos, Produtos, Planos, Demo, Entrar |
| FR2 | Seletor de segmentos (Celulares default = Cell Ponto) |
| FR3 | Planos Start / Growth / Scale com detalhe interativo |
| FR4 | Totem com produtos e carrossel de imagens |
| FR5 | Lead totem via Evolution API |
| FR6 | `GET /health` público |
| FR7 | Static SPA + API na mesma origem em produção |

## 6. Technical constraints

- Discloud Site: `TYPE=site`, `ID=marthi-totem`, porta `8080`, host `0.0.0.0`
- ZIP de upload deve conter `dist/index.js` (MAIN)
- Não publicar como Bot se o objetivo é URL pública
- Secrets só em Variáveis Discloud / `.env` local

## 7. Acceptance

- [x] `https://marthi-totem.discloud.app/health` → 200
- [x] `https://marthi-totem.discloud.app/` → home Marthi
- [x] `/totem` e `/login` acessíveis na mesma origem
- [ ] Variáveis Evolution/JWT/DB/`GOOGLE_CLIENT_ID` no **Site** `marthi-totem` (não só no Bot)
- [ ] Google OAuth: origem `https://marthi-totem.discloud.app` no Cloud Console
- [ ] `GET /api/v1/auth/providers` no domínio público → `google: true`

## 8. Future

- OS + ERP online interligados ao totem
- Multi-tenant (vários segmentos / lojas)
- Domínio customizado Marthi
