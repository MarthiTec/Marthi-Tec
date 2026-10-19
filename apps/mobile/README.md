# Marthi Lojista (mobile)

App **Expo + React Native + TypeScript** para o lojista. Consome as mesmas APIs de `apps/api` (sem backend paralelo). Foco: lojas de celular (venda + OS).

Distribuição: **testes internos** (APK Android; iOS Ad Hoc / development). Sem lojas públicas. Detalhes: [`DISTRIBUTION.md`](./DISTRIBUTION.md).

## Pré-requisitos

- Node 20+ (repo usa 22)
- Conta Marthi válida no MarthiDB (mesmo login do web)
- API HTTPS (produção) ou HTTP na LAN (dev)

Pacote **fora** do workspace Discloud Site (`apps/api` + `apps/web`). Instale em `apps/mobile`.

## Configurar API

```bash
export EXPO_PUBLIC_API_URL=https://marthi-totem.discloud.app
# ou LAN: http://192.168.x.x:8080
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
