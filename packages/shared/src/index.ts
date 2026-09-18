/**
 * Tipos compartilhados entre API, Web e (futuro) Mobile.
 * Evoluir junto com a modelagem PostgreSQL.
 */

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** Conceito genérico — substitui CAD_CELL no legado */
export type Product = {
  id: number;
  name: string;
  brandId: number | null;
  status: 'active' | 'inactive';
  reference: string | null;
  createdAt: string;
  updatedAt: string | null;
};

/** SKU / variante — substitui CELL_ITENS */
export type ProductVariant = {
  id: number;
  productId: number;
  unitPrice: number;
  installmentPrice: number | null;
  attributes: Record<string, string | number>;
};
