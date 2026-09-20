export type CepAddress = {
  zipCode: string;
  street: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

export function maskCep(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export async function lookupCep(cep: string): Promise<CepAddress> {
  const digits = onlyDigits(cep);
  if (digits.length !== 8) {
    throw new Error('CEP deve ter 8 dígitos.');
  }

  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!response.ok) {
    throw new Error('Não foi possível consultar o CEP.');
  }

  const data = (await response.json()) as {
    erro?: boolean;
    cep?: string;
    logradouro?: string;
    complemento?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
  };

  if (data.erro) {
    throw new Error('CEP não encontrado.');
  }

  return {
    zipCode: maskCep(data.cep || digits),
    street: data.logradouro?.trim() || '',
    complement: data.complemento?.trim() || '',
    neighborhood: data.bairro?.trim() || '',
    city: data.localidade?.trim() || '',
    state: data.uf?.trim().toUpperCase() || '',
  };
}
