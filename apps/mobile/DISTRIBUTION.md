# Distribuição interna — Marthi Lojista

Sem Play Store / App Store nesta fase. Canal preferido: APK Android (EAS `preview`) + iOS Ad Hoc/TestFlight.

**API de produção (build-time):** `EXPO_PUBLIC_API_URL=https://marthi-totem.discloud.dev`  
Já embutido nos perfis `eas.json` e default de `src/api/config.ts`. Local: copie `.env.example` → `.env`.

## Fallback honesto sem EAS (Expo Go)

Se `EXPO_TOKEN` / login Expo / certificados Apple não estiverem disponíveis:

1. Publique a página pública `https://marthi-totem.discloud.dev/app-lojista` (rota web) com CTA **Abrir no Expo Go**.
2. Suba o bundler com tunnel público: `cd apps/mobile && EXPO_PUBLIC_API_URL=https://marthi-totem.discloud.dev npx expo start --tunnel`.
3. No Site Discloud, PUT env com wrapper `{ "vars": { … } }` (merge completo) e reinicie:
   - `EXPO_DEV_CLIENT_URL` / `VITE_EXPO_DEV_CLIENT_URL` = `https://expo.dev/go?url=exp%3A%2F%2F…` (ou `exp://…`)
   - `MOBILE_ANDROID_APK_URL` / `MOBILE_IOS_INSTALL_URL` = mesma URL (ou `/app-lojista?platform=…` se o tunnel estiver fora do ar)
4. Em **Operações → Download do App** os botões aparecem como **Abrir no Expo Go** (não “Baixar APK”).
5. **Não** invente URLs de `.apk`. Tunnel morre quando a VM do agente dorme — próximo passo estável: **EAS Update** / `eas build --profile preview`.

Quando o APK EAS existir, substitua as variáveis pelos links reais — os rótulos voltam a “Baixar APK Android” / TestFlight automaticamente.

## Checklist pré-build

1. Conta Expo (eas.dev / expo.dev) do time Marthi + `EXPO_TOKEN` ou `eas login`.
2. `cd apps/mobile && npm install`
3. Confirmar `EXPO_PUBLIC_API_URL` nos perfis EAS (`eas.json` → já aponta para `marthi-totem.discloud.dev`).
4. Preencher `extra.eas.projectId` em `app.json` via `npx eas-cli init` (placeholder atual: `replace-with-eas-project-id`).
5. Conferir `eas.json` perfil `preview` → Android `buildType: apk`, `distribution: internal`.

## Android APK (testes internos)

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli whoami
npx eas-cli build -p android --profile preview
```

- Baixe o APK pelo link EAS.
- Instale em device de teste (fonte desconhecida / sideload permitido).
- Smoke: login MarthiDB → Início → Estoque → OS → Vendas → Menu → Atividades.

### Alternativa local (sem EAS cloud)

Requer Android SDK / JDK:

```bash
cd apps/mobile
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# APK em android/app/build/outputs/apk/release/
```

Neste VM Cloud Agent **não** há Android SDK completo — o caminho EAS é o oficial do time.

## iOS (Ad Hoc / development)

1. Apple Developer Team ativo.
2. Certificados + provisioning Ad Hoc (ou development) gerenciados pelo EAS Credentials.
3. Build:

```bash
cd apps/mobile
npx eas-cli build -p ios --profile preview
```

4. Instalar: link EAS, Apple Configurator, ou TestFlight **interno**.
5. Simulador local (macOS + Xcode): `npm run ios`.

**Bloqueios típicos neste ambiente:** sem conta Apple, sem certificados, sem macOS/Xcode — documentar e rodar EAS a partir de máquina do time.

## O que NÃO fazer

- Não publicar na Play Store / App Store nesta fase.
- Não colocar `DATABASE_URL`, `JWT_SECRET`, senhas SMTP ou tokens Evolution no binário / `app.json` commitado.
- Não usar mocks de loja/cliente no app; só MarthiDB via API.

## Download no painel (Operações)

No sistema web: **Operações → Download do App** (`/painel/operacoes?tab=app`).

Os botões leem URLs da API (`GET /api/v1/mobile/download`), alimentadas por variáveis de ambiente — sem APK fictício no código.

### Variáveis no Site Discloud (`marthi-totem`)

No dashboard Discloud → aplicação **Site** → **Variáveis** (não no Bot):

| Variável | Exemplo | Efeito |
|----------|---------|--------|
| `MOBILE_ANDROID_APK_URL` | `https://expo.dev/artifacts/eas/….apk` **ou** `/app-lojista?platform=android` | **Baixar APK Android** ou **Abrir no Expo Go (Android)** |
| `MOBILE_IOS_INSTALL_URL` | TestFlight / EAS **ou** `/app-lojista?platform=ios` | **Abrir TestFlight** / **Abrir no Expo Go (iPhone)** |

1. Gere o APK com EAS (`preview`) e copie o link HTTPS estável (ou hospede o arquivo num CDN próprio).
2. Cole em `MOBILE_ANDROID_APK_URL` (URL completa `https://…`).
3. **Reinicie** o Site na Discloud (não precisa rebuild do front).
4. Abra Operações → Download do App e confira o botão ativo.

Local: mesmas chaves no `.env` da raiz / `apps/api`. Deixe vazio até publicar — o painel mostra empty state honesto com link para este guia.

## Verificação de build config (local)

```bash
cd apps/mobile
node -e "const j=require('./eas.json'); if(j.build.preview.android.buildType!=='apk') process.exit(1); console.log('eas preview apk ok')"
npx tsc --noEmit
```
