import type { NextFunction, Request, Response } from 'express';
import {requireAuth} from './authMiddleware.js';

function nestOrigin() {
  return (process.env.NEST_API_URL || '').replace(/\/$/, '');
}

function apiPathname(req: Request) {
  const raw = req.originalUrl || req.url || '';
  return raw.split('?')[0] || '';
}

function looksLikeJson(text: string, contentType: string | null) {
  if (contentType && /json/i.test(contentType)) return true;
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

/**
 * Encaminha /api que este processo Express não implementa para o Nest.
 * Perfil, catálogo do totem, estoque e PDV moram no Marthi-Backend.
 *
 * Rotas `/api/v1/public/*` são first-party (catálogo, pedidos, OS, solicitações):
 * se não casarem com um handler Express, respondemos 404 — nunca "Token ausente
 * ou inválido." do requireAuth (isso confundia link curto /c/{slug} e o painel).
 *
 * Respostas HTML do edge (Service Unavailable / 404 de proxy) nunca são
 * reencaminhadas: o painel espera JSON e mostrava "Resposta inválida da API (404)."
 */
export async function proxyUnmatchedApi(req: Request, res: Response, next: NextFunction) {
  if (!req.originalUrl.startsWith('/api')) {
    next();
    return;
  }

  const path = apiPathname(req);
  if (path.startsWith('/api/v1/public/') || path === '/api/v1/public') {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Rota pública não encontrada.', details: {} },
    });
    return;
  }

  if (!nestOrigin()) return next();
  if (!req.user) {
    return requireAuth(req,res, (error?:unknown) => { if(error) return next(error); void proxyUnmatchedApi(req,res,next); });
  }
  const target = `${nestOrigin()}${req.originalUrl}`;
  try {
    const headers = new Headers();
    const authorization = req.header('authorization');
    if (authorization) headers.set('authorization', authorization);
    if(req.storeId) headers.set('x-store-id',req.storeId);
    // Preferimos JSON: páginas HTML de indisponibilidade do edge quebravam o painel.
    headers.set('accept', 'application/json');

    let body: string | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const contentType = req.header('content-type');
      if (contentType) headers.set('content-type', contentType);
      if (req.body !== undefined && contentType?.includes('application/json')) {
        body = JSON.stringify(req.body);
      }
    }

    const upstream = await fetch(target, { method: req.method, headers, body, redirect: 'error', signal: AbortSignal.timeout(15000) });
    const text = await upstream.text();
    const type = upstream.headers.get('content-type');
    if (!looksLikeJson(text, type)) {
      const unavailable = upstream.status === 404 || upstream.status >= 500 || /service unavailable/i.test(text);
      res.status(unavailable ? 502 : upstream.status || 502).json({
        success: false,
        error: {
          code: unavailable ? 'BAD_GATEWAY' : 'UPSTREAM_INVALID',
          message: unavailable
            ? 'Backend Marthi temporariamente indisponível. Tente de novo em instantes.'
            : 'Resposta inválida do backend Marthi.',
          details: { status: upstream.status },
        },
      });
      return;
    }
    if (type) res.setHeader('content-type', type);
    else res.setHeader('content-type', 'application/json; charset=utf-8');
    res.status(upstream.status).send(text);
  } catch (error) {
    console.error('[marthi-api] falha ao encaminhar para o Nest:', error);
    res.status(502).json({
      success: false,
      error: {
        code: 'BAD_GATEWAY',
        message: 'Não foi possível falar com o backend Marthi.',
        details: {},
      },
    });
  }
}
