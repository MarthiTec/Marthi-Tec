# Distribuição interna — Marthi Lojista

Sem Play Store / App Store nesta fase. Canal: APK Android + iOS Ad Hoc/dev.

## Checklist pré-build

1. Conta Expo (eas.dev / expo.dev) do time Marthi.
2. `cd apps/mobile && npm install`
3. Definir `EXPO_PUBLIC_API_URL` de **produção HTTPS** no perfil EAS (não embutir secrets JWT/DB no app).
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

## Verificação de build config (local)

```bash
cd apps/mobile
node -e "const j=require('./eas.json'); if(j.build.preview.android.buildType!=='apk') process.exit(1); console.log('eas preview apk ok')"
npx tsc --noEmit
```
