export const DEMO_LOGIN = {
  email: 'teste@marthi.com.br',
  password: '123',
  token: 'marthi-demo-token',
  user: {
    id: 'password:teste@marthi.com.br',
    email: 'teste@marthi.com.br',
    name: 'Marthi Teste',
    picture: null as string | null,
    provider: 'password' as const,
  },
};

export function isDemoCredentials(email: string, password: string) {
  return email.trim().toLowerCase() === DEMO_LOGIN.email && password === DEMO_LOGIN.password;
}

export function isDemoToken(token: string) {
  return token === DEMO_LOGIN.token;
}

export async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(
      response.ok
        ? 'A API respondeu vazio. Confira se `npm run dev:api` está rodando na porta 8080.'
        : `API indisponível (${response.status}). Suba a API ou use o login de teste.`,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Resposta inválida da API (${response.status}).`);
  }
}
