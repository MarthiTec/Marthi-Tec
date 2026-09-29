import { cleanDocument, formatCnpj, isValidCnpj } from '../utils/documentUtils';

export type CnpjStateRegistration = {
  number: string;
  state: string;
  active: boolean;
};

export type CnpjCompanyData = {
  cnpj: string;
  legalName: string;
  tradeName: string;
  stateRegistration: string;
  stateRegistrations: CnpjStateRegistration[];
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  cnae?: string;
  status?: string;
  source: 'cnpj.ws' | 'minhareceita' | 'brasilapi';
};

const cnpjCache = new Map<string, CnpjCompanyData>();

function formatZip(cep: string | undefined | null): string {
  const digits = (cep || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length === 8) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return digits;
}

function formatPhone(phone: string | undefined | null): string {
  const digits = (phone || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

/**
 * Consulta dados completos da empresa por CNPJ:
 * - Valida dígitos verificadores (módulo 11 tradicional e alfanumérico)
 * - Busca Razão Social, Nome Fantasia, Inscrição Estadual (IE) e Endereço
 * - Tiers de resiliência: CNPJ.ws (com IE da SEFAZ) -> MinhaReceita.org -> BrasilAPI
 */
export async function lookupCnpjData(rawCnpj: string): Promise<CnpjCompanyData> {
  const clean = cleanDocument(rawCnpj);

  if (!clean || clean.length !== 14) {
    throw new Error('Informe os 14 dígitos do CNPJ para consulta.');
  }

  if (!isValidCnpj(clean)) {
    throw new Error('CNPJ inválido (dígitos verificadores incorretos).');
  }

  // Verifica cache em memória
  const cached = cnpjCache.get(clean);
  if (cached) {
    return cached;
  }

  // 1º Tier: publica.cnpj.ws (retorna IE da SEFAZ + dados cadastrais completos)
  try {
    const res = await fetch(`https://publica.cnpj.ws/cnpj/${clean}`);
    if (res.ok) {
      const data = await res.json();
      const est = data.estabelecimento || {};
      const uf = (est.estado?.sigla || '').toUpperCase();
      const rawIes = (est.inscricoes_estaduais || []) as Array<{
        inscricao_estadual?: string;
        ativo?: boolean;
        estado?: { sigla?: string };
      }>;

      const ies: CnpjStateRegistration[] = rawIes.map((item) => ({
        number: item.inscricao_estadual || '',
        state: (item.estado?.sigla || '').toUpperCase(),
        active: Boolean(item.ativo),
      }));

      // Seleciona a IE ativa correspondente à UF da empresa, ou a primeira ativa
      const bestIe =
        ies.find((i) => i.active && i.state === uf)?.number ||
        ies.find((i) => i.active)?.number ||
        ies[0]?.number ||
        '';

      const street = [est.tipo_logradouro, est.logradouro].filter(Boolean).join(' ').trim();
      const rawPhone = [est.ddd1, est.telefone1].filter(Boolean).join('');

      const result: CnpjCompanyData = {
        cnpj: formatCnpj(clean),
        legalName: data.razao_social || '',
        tradeName: est.nome_fantasia || data.razao_social || '',
        stateRegistration: bestIe,
        stateRegistrations: ies,
        zipCode: formatZip(est.cep),
        street: street,
        number: est.numero || '',
        complement: est.complemento || '',
        district: est.bairro || '',
        city: est.cidade?.nome || '',
        state: uf,
        phone: formatPhone(rawPhone),
        email: (est.email || '').toLowerCase().trim(),
        cnae: est.atividade_principal?.descricao || '',
        status: est.situacao_cadastral || '',
        source: 'cnpj.ws',
      };

      cnpjCache.set(clean, result);
      return result;
    } else if (res.status === 404) {
      throw new Error('CNPJ não encontrado na base da Receita Federal.');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('não encontrado')) {
      throw err;
    }
    // Erros de rate limit (429) ou rede caem para o próximo tier
  }

  // 2º Tier: minhareceita.org (alta disponibilidade e sem restrição rígida de CORS)
  try {
    const res = await fetch(`https://minhareceita.org/${clean}`);
    if (res.ok) {
      const data = await res.json();
      const street = [data.descricao_tipo_de_logradouro, data.logradouro]
        .filter(Boolean)
        .join(' ')
        .trim();

      const result: CnpjCompanyData = {
        cnpj: formatCnpj(clean),
        legalName: data.razao_social || '',
        tradeName: data.nome_fantasia || data.razao_social || '',
        stateRegistration: '',
        stateRegistrations: [],
        zipCode: formatZip(data.cep),
        street: street || data.logradouro || '',
        number: data.numero || '',
        complement: data.complemento || '',
        district: data.bairro || '',
        city: data.municipio || '',
        state: (data.uf || '').toUpperCase(),
        phone: formatPhone(data.ddd_telefone_1),
        email: (data.email || '').toLowerCase().trim(),
        cnae: data.cnae_fiscal_descricao || '',
        status: data.descricao_situacao_cadastral || '',
        source: 'minhareceita',
      };

      cnpjCache.set(clean, result);
      return result;
    } else if (res.status === 404) {
      throw new Error('CNPJ não encontrado na base da Receita Federal.');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('não encontrado')) {
      throw err;
    }
  }

  // 3º Tier: BrasilAPI
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
    if (res.ok) {
      const data = await res.json();
      const street = [data.descricao_tipo_de_logradouro, data.logradouro]
        .filter(Boolean)
        .join(' ')
        .trim();

      const result: CnpjCompanyData = {
        cnpj: formatCnpj(clean),
        legalName: data.razao_social || '',
        tradeName: data.nome_fantasia || data.razao_social || '',
        stateRegistration: '',
        stateRegistrations: [],
        zipCode: formatZip(data.cep),
        street: street || data.logradouro || '',
        number: data.numero || '',
        complement: data.complemento || '',
        district: data.bairro || '',
        city: data.municipio || '',
        state: (data.uf || '').toUpperCase(),
        phone: formatPhone(data.ddd_telefone_1),
        email: (data.email || '').toLowerCase().trim(),
        cnae: data.cnae_fiscal_descricao || '',
        status: data.descricao_situacao_cadastral || '',
        source: 'brasilapi',
      };

      cnpjCache.set(clean, result);
      return result;
    }
  } catch {
    // Todos os tiers falharam
  }

  throw new Error(
    'Não foi possível consultar os dados deste CNPJ automaticamente no momento. Preencha os campos manualmente.',
  );
}
