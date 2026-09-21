/** Hint de credenciais do seed Nest (UI). Sem token fake. */
export const SEED_LOGIN_HINT = {
  email: 'teste@marthi.com.br',
  password: '123',
} as const;

/** @deprecated use SEED_LOGIN_HINT — mantido para imports antigos */
export const DEMO_LOGIN = SEED_LOGIN_HINT;

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
    throw new Error(`Resposta inválida da API (${response.status}).`);
  }
}
