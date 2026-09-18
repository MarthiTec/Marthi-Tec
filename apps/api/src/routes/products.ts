import { Router } from 'express';

/**
 * Placeholder para o Thiago elaborar.
 * Endpoints legados a migrar:
 * - GET  /produtos
 * - GET  /produtos/itens/:id
 * - GET  /produtos/imagens/:id
 * - POST /produtos/atualizapreco
 *
 * Preferir versão versionada: /api/v1/products
 */
export const productsRouter = Router();

productsRouter.get('/api/v1/products', (_req, res) => {
  res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'Módulo de produtos em elaboração. Ver docs/team-split.md',
      details: {
        owner: 'Thiago Barcelos',
        legacyEndpoints: [
          'GET /produtos',
          'GET /produtos/itens/:id',
          'GET /produtos/imagens/:id',
          'POST /produtos/atualizapreco',
        ],
      },
    },
  });
});
