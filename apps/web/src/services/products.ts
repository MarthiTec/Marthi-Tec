import { nestApiUrl } from './config';
import { readJson } from './http';

const API_URL = nestApiUrl();

export type CatalogProduct = {
  id: number | string;
  name: string;
  brandId: number | string | null;
  brandSlug?: string | null;
  brandName?: string | null;
  status: 'active' | 'inactive' | string;
  reference: string | null;
  cashPrice: number;
  createdAt: string;
  updatedAt: string | null;
  images?: string[];
  attrs?: Record<string, string[]>;
};

export type CatalogVariant = {
  id: number | string;
  productId: number | string;
  unitPrice: number;
  installmentPrice: number | null;
  attributes: Record<string, string | number>;
};

type ApiErrorBody = {
  success: false;
  error?: { message?: string };
};

async function parseData<T>(response: Response): Promise<T> {
  const json = await readJson<{ success: boolean; data?: T } | ApiErrorBody>(response);
  if (!response.ok || !json || (json as ApiErrorBody).success === false) {
    const message =
      (json as ApiErrorBody).error?.message ?? `Falha ao carregar produtos (${response.status})`;
    throw new Error(message);
  }
  return (json as { data: T }).data;
}

/** Catálogo público Nest (totem). Sem Bearer — rota @Public no backend. */
export async function fetchCatalogProducts(): Promise<CatalogProduct[]> {
  const response = await fetch(`${API_URL}/api/v1/products`);
  return parseData<CatalogProduct[]>(response);
}

export async function fetchProductImages(productId: string | number) {
  const response = await fetch(`${API_URL}/api/v1/products/${productId}/images`);
  return parseData<Array<{ id: string; url: string; sort: number }>>(response);
}

export async function fetchProductVariants(productId: string | number) {
  const response = await fetch(`${API_URL}/api/v1/products/${productId}/variants`);
  return parseData<CatalogVariant[]>(response);
}
