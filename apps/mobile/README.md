# Marthi Lojista (mobile)

App **Expo + React Native + TypeScript** para o lojista. Consome as mesmas APIs Express de `apps/api` via HTTPS (sem backend paralelo e **sem** imports do `apps/web`). Foco: lojas de celular (venda + OS).

**Layout:** pacote separado dentro de `MarthiTec/Marthi-Tec` (`apps/mobile`) — fora do npm workspace do Site Discloud e fora do ZIP de deploy (`.discloudignore`). A conexão com o front/API é só HTTP (`EXPO_PUBLIC_API_URL` → `/api/v1`). Não use Nest `marthi-backend` como base URL do app (rotas lojista diferem).

Distribuição: **testes internos** (APK Android; iOS Ad Hoc / development). Sem lojas públicas. Detalhes: [`DISTRIBUTION.md`](./DISTRIBUTION.md).

## Pré-requisitos

- Node 20+ (repo usa 22)
- Conta Marthi válida no MarthiDB (mesmo login do web)
- API HTTPS (produção) ou HTTP na LAN (dev)

Instale dependências **neste diretório** (`cd apps/mobile && npm install`), não via workspaces da raiz.

## Configurar API

```bash
# veja também apps/mobile/.env.example
export EXPO_PUBLIC_API_URL=https://marthi-totem.discloud.dev
# ou LAN: http://192.168.x.x:8080
# Atenção: marthi-totem.discloud.app ainda não roteia (404) — use .discloud.dev
```

## Rodar

```bash
cd apps/mobile
npm install
npm start
```

## Módulos (Phases 1–6)

| Aba / tela | Função |
|---|---|
| Início | Dashboard (`/dashboard/summary`) + multi-loja |
| Estoque | Busca, baixo, barcode, ajuste, preço auditado, entrada |
| OS | Lista/filtros, detalhe, status com transição validada |
| Vendas | Lista externa + nova venda (cliente, carrinho, pagamento, `requestId`) |
| Menu → Atividades | `GET /audit-logs` (sem secrets) |

## Sessão e segurança

- SecureStore (nativo) / sessionStorage (web)
- Bearer + `x-store-id`
- UI gated por `/auth/access`; API enforce

## Build APK / iOS

Ver [`DISTRIBUTION.md`](./DISTRIBUTION.md). Resumo Android:

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli build -p android --profile preview
```

No painel lojista: **Operações → Download do App**. Configure `MOBILE_ANDROID_APK_URL` / `MOBILE_IOS_INSTALL_URL` no Site Discloud (detalhes em `DISTRIBUTION.md`).

## Testes

```bash
# na raiz do monorepo
npm run test:mobile-access
npm run test:mobile-stock
npm run test:mobile-os
npm run test:mobile-sales
npm run test:mobile-audit
npm run test:mobile-distribution

cd apps/mobile && npm test && npx tsc --noEmit
```
