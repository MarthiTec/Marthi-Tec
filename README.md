# Marthi Tec

API e plataforma moderna do Marthi (React + PHP + PostgreSQL + React Native).

## Status

Bootstrap inicial para deploy no Discloud.

- `GET /health` — status do serviço e conexão com PostgreSQL

## Discloud

1. Configure as variáveis de ambiente no painel (não versione `.env`).
2. Use como base o arquivo `.env.example`.
3. Ajuste o `ID` em `discloud.config` para o subdomínio registrado no Discloud.

## Desenvolvimento local

```bash
php -S 0.0.0.0:8080 -t public
```
