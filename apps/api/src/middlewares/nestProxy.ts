import type { NextFunction, Request, Response } from 'express';

function nestOrigin() {
  return (process.env.NEST_API_URL || 'https://marthi-backend.discloud.app').replace(/\/$/, '');
}

/**
 * Encaminha /api que este processo Express não implementa para o Nest.
 * Perfil, catálogo do totem, estoque e PDV moram no Marthi-Backend.
 */
export async function proxyUnmatchedApi(req: Request, res: Response, next: NextFunction) {
  if (!req.originalUrl.startsWith('/api')) {
    next();
    return;
  }

  const target = `${nestOrigin()}${req.originalUrl}`;
  try {
    const headers = new Headers();
    const authorization = req.header('authorization');
    if (authorization) headers.set('authorization', authorization);
    const accept = req.header('accept');
    if (accept) headers.set('accept', accept);

    let body: string | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const contentType = req.header('content-type');
      if (contentType) headers.set('content-type', contentType);
      if (req.body !== undefined && contentType?.includes('application/json')) {
        body = JSON.stringify(req.body);
      }
    }

    const upstream = await fetch(target, { method: req.method, headers, body });
    const text = await upstream.text();
    const type = upstream.headers.get('content-type');
    if (type) res.setHeader('content-type', type);
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
