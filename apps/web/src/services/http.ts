/** Hint de credenciais do seed Nest (UI). Sem token fake. */
export const SEED_LOGIN_HINT = {
  email: 'teste@marthi.com.br',
  password: '123',
} as const;

/** @deprecated use SEED_LOGIN_HINT — mantido para imports antigos */
export const DEMO_LOGIN = SEED_LOGIN_HINT;

function invalidApiMessage(status: number, text: string) {
  // Edge Discloud / Cloudflare devolve HTML 404 "Service Unavailable" quando o Site
  // ou o Nest estão offline — o painel lia isso como "Resposta inválida da API (404)."
  if (/service unavailable|servi[cç]o indispon/i.test(text) || /<!doctype html/i.test(text)) {
    return status === 404 || status >= 500
      ? 'Serviço temporariamente indisponível. Atualize a página em instantes.'
      : `Serviço temporariamente indisponível (${status}).`;
  }
  return `Resposta inválida da API (${status}).`;
}

export async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(
      response.ok
        ? 'A API respondeu vazio. Confira se o Nest está em localhost:8080 ou VITE_API_URL.'
        : `API indisponível (${response.status}). Suba o Marthi-Backend.`,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(invalidApiMessage(response.status, text));
  }
}
