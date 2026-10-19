# Marthi Lojista (mobile)

App **Expo + React Native + TypeScript** para o lojista. Consome as mesmas APIs de `apps/api` (sem backend paralelo). Foco: lojas de celular (venda + OS).

Distribuição desta fase: **testes internos** (APK Android; iOS Ad Hoc / development). Sem publicação em lojas.

## Pré-requisitos

- Node 20+ (repo usa 22)
- Conta Marthi válida no MarthiDB (mesmo login do web)
- API acessível por HTTPS (produção) ou HTTP na rede local (dev)

Este pacote **não** faz parte do npm workspace do Site Discloud (`apps/api` + `apps/web` apenas). Instale dependências **dentro** de `apps/mobile`.

## Configurar API

```bash
# Produção (padrão se omitir)
# https://marthi-totem.discloud.app

# Dev: API local (use o IP da máquina se for device físico)
export EXPO_PUBLIC_API_URL=http://192.168.0.10:8080
```

Ou crie `apps/mobile/.env`:

```env
EXPO_PUBLIC_API_URL=https://marthi-totem.discloud.app
```

## Rodar

```bash
cd apps/mobile
npm install
npm start
```

- `a` — Android emulator / device  
- `i` — iOS simulator (macOS)  
- `w` — Expo web (útil para smoke visual)  
- QR code — Expo Go no celular  

Com a API local:

```bash
# terminal 1 (raiz do monorepo)
npm run dev:api

# terminal 2
cd apps/mobile && EXPO_PUBLIC_API_URL=http://127.0.0.1:8080 npm start
```

## Sessão e segurança

- Token JWT em **SecureStore** (iOS Keychain / Android Keystore); no Expo web usa `sessionStorage`.
- Cliente envia `Authorization: Bearer` e `x-store-id`.
- UI esconde abas por área (`/api/v1/auth/access`); a API continua enforce em cada rota.

## Build Android APK (testes internos)

1. Conta Expo / EAS: [expo.dev](https://expo.dev)
2. Em `apps/mobile/app.json`, preencha `extra.eas.projectId` (ou rode `npx eas-cli init`)
3. Build preview (APK):

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli build -p android --profile preview
```

O perfil `preview` em `eas.json` gera **APK** (`distribution: internal`) para instalação direta.

Alternativa local (mais pesada): `npx expo prebuild` + Android Studio / Gradle `assembleRelease` — prefira EAS para o time.

## iOS (Ad Hoc / development — sem App Store)

- Precisa de **Apple Developer** + certificados/provisioning Ad Hoc ou development.
- Com EAS:

```bash
npx eas-cli build -p ios --profile preview
```

- Instalar via link EAS, Apple Configurator ou TestFlight **interno** (ainda não é App Store public).
- Simulador: `npm run ios` em macOS com Xcode.

## Fases

| Fase | Status neste branch |
|------|---------------------|
| 1 Fundação (auth, tema, client, nav, permissões) | Feito |
| 2 Dashboard (indicadores reais + período + multi-loja) | Feito |
| 3 Estoque (busca, detalhe, ajuste, preço, entrada, barcode) | Feito |
| 4+ OS, venda, atividades | Placeholders / próximas |

### Testar estoque (Phase 3)

1. Conta com área de produtos/estoque no MarthiDB.
2. Aba **Estoque** → busca, filtro baixo, ler código.
3. Detalhe → ajuste com motivo, alteração de preço (auditoria), entrada simplificada, histórico.

## Testes

```bash
cd apps/mobile
npm test
```

Testes de API (`/auth/access`, dashboard) ficam em `scripts/` na raiz do monorepo após `npm run build:api`.
