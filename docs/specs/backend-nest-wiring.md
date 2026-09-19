# Spec — Front ↔ Nest API (Marthi-Backend)

**Status:** Wiring in progress  
**Front Site:** https://marthi-totem.discloud.app  
**API Site (alvo):** https://marthi-api.discloud.app  
**API repo:** https://github.com/MarthiTec/Marthi-Backend

## Modelo

| Superfície | Origem |
|------------|--------|
| Auth, partners, products, `/health` | Nest (`VITE_API_URL`) |
| Totem leads, POS tickets | Express no Site `marthi-totem` (mesma origem) até migrar |

## Variáveis Discloud

### Site `marthi-api` (Nest — upload ZIP do Marthi-Backend)

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/MarthiDB?schema=public
JWT_SECRET=...
JWT_EXPIRES_IN=7d
AUTH_DEV_EMAIL=teste@marthi.com.br
AUTH_DEV_PASSWORD=123
GOOGLE_CLIENT_ID=...
CORS_ORIGINS=https://marthi-totem.discloud.app,http://localhost:5173
PORT=8080
API_PREFIX=api/v1
SWAGGER_ENABLED=true
NODE_ENV=production
```

Depois do upload: Domínios → `marthi-api` **Em uso**.  
Aceite: `GET https://marthi-api.discloud.app/health` → `database.connected: true`.

### Site `marthi-totem` (front)

No **build** do front:

```text
VITE_API_URL=https://marthi-api.discloud.app
VITE_GOOGLE_CLIENT_ID=...
```

Vars de runtime do Express legado (totem/WhatsApp) continuam no Site totem.

## Local

```powershell
# Terminal 1 — Postgres + Nest (repo Marthi-Backend)
cd "C:\Marthi GIT\Marthi-Backend"
npm run docker:up
cp .env.example .env   # se ainda não tiver
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev

# Terminal 2 — Front (repo Marthi-Tec)
cd "C:\Marthi GIT\MarthiProject\apps\web"
# .env raiz: VITE_API_URL=  (vazio → proxy Vite → localhost:8080)
npm run dev
```

## Aceite

- [ ] `https://marthi-api.discloud.app/health` com banco conectado
- [ ] Login do painel via Nest
- [ ] `GET /api/v1/products` autenticado retorna catálogo (não 501)
- [ ] Totem lead ainda funciona no domínio totem
