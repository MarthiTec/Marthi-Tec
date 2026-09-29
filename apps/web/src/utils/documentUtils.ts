/**
 * Utilitários de validação e formatação de documentos (CPF e CNPJ).
 *
 * Suporte completo ao novo padrão de CNPJ ALFANUMÉRICO (IN RFB nº 2.229/2024 e NT Conjunta 01/2024):
 * - 14 caracteres (XX.XXX.XXX/XXXX-XX)
 * - Primeiros 8 caracteres (raiz): Alfanuméricos (0-9, A-Z)
 * - Próximos 4 caracteres (ordem): Alfanuméricos (0-9, A-Z)
 * - Últimos 2 caracteres (DV): Numéricos (0-9)
 * - Compatível tanto com CNPJs numéricos tradicionais quanto alfanuméricos.
 */

/** Remove pontuação (pontos, traços, barras, espaços), mantendo letras e dígitos em maiúsculo */
export function cleanDocument(value: string | undefined | null): string {
  if (!value) return '';
  return value.replace(/[\s.\-/]/g, '').trim().toUpperCase();
}

/** Verifica se é CPF válido em tamanho (11 dígitos numéricos) */
export function isCpf(cleanDoc: string): boolean {
  const digits = cleanDoc.replace(/\D/g, '');
  return digits.length === 11 && !/^(\d)\1{10}$/.test(digits);
}

/**
 * Validação matemática rigorosa de CPF pelo algoritmo de módulo 11 (dígitos verificadores).
 */
export function isValidCpf(value: string | undefined | null): boolean {
  if (!value) return false;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i], 10) * (10 - i);
  }
  let rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  if (rem !== parseInt(digits[9], 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i], 10) * (11 - i);
  }
  rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  return rem === parseInt(digits[10], 10);
}

/**
 * Verifica se é CNPJ válido em tamanho e formato (14 caracteres alfanuméricos).
 * Aceita tanto o modelo tradicional numérico quanto o novo CNPJ alfanumérico.
 */
export function isCnpj(cleanDoc: string): boolean {
  if (cleanDoc.length !== 14) return false;
  // Deve conter 12 caracteres alfanuméricos e 2 dígitos numéricos finais
  return /^[A-Z0-9]{12}\d{2}$/i.test(cleanDoc) || /^[A-Z0-9]{14}$/i.test(cleanDoc);
}

/**
 * Validação matemática rigorosa de CNPJ pelo algoritmo oficial de módulo 11.
 * Compatível tanto com CNPJs numéricos tradicionais quanto com alfanuméricos (IN RFB nº 2.229/2024).
 */
export function isValidCnpj(value: string | undefined | null): boolean {
  if (!value) return false;
  const clean = cleanDocument(value);
  if (clean.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(clean)) return false;

  const getCharValue = (ch: string) => ch.charCodeAt(0) - 48;

  // Primeiro dígito verificador
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum1 = 0;
  for (let i = 0; i < 12; i++) {
    sum1 += getCharValue(clean[i]) * weights1[i];
  }
  const rem1 = sum1 % 11;
  const dv1 = rem1 < 2 ? 0 : 11 - rem1;
  if (getCharValue(clean[12]) !== dv1) return false;

  // Segundo dígito verificador
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum2 = 0;
  for (let i = 0; i < 13; i++) {
    sum2 += getCharValue(clean[i]) * weights2[i];
  }
  const rem2 = sum2 % 11;
  const dv2 = rem2 < 2 ? 0 : 11 - rem2;
  return getCharValue(clean[13]) === dv2;
}

/** Formata string como CNPJ (XX.XXX.XXX/XXXX-XX), preservando letras do CNPJ alfanumérico */
export function formatCnpj(value: string | undefined | null): string {
  const clean = cleanDocument(value).slice(0, 14);
  if (!clean) return '';
  if (clean.length <= 2) return clean;
  if (clean.length <= 5) return `${clean.slice(0, 2)}.${clean.slice(2)}`;
  if (clean.length <= 8) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`;
  if (clean.length <= 12) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8)}`;
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
}

/** Formata string como CPF (000.000.000-00) */
export function formatCpf(value: string | undefined | null): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Formata dinamicamente um documento como CPF ou CNPJ baseado no comprimento.
 * Suporta CNPJ alfanumérico e CPF numérico.
 */
export function formatCpfCnpj(value: string | undefined | null): string {
  const clean = cleanDocument(value);
  if (!clean) return '';
  // Se contiver letras, é garantidamente CNPJ Alfanumérico
  if (/[A-Z]/i.test(clean)) {
    return formatCnpj(clean);
  }
  // Se for puramente numérico e tiver mais de 11 dígitos, é CNPJ
  if (clean.length > 11) {
    return formatCnpj(clean);
  }
  return formatCpf(clean);
}

/**
 * Valida se um documento é aceitável para emissão fiscal (CPF com 11 dígitos ou CNPJ com 14 caracteres).
 */
export function isValidFiscalDocument(value: string | undefined | null): boolean {
  const clean = cleanDocument(value);
  if (!clean) return false;
  return isCpf(clean) || isCnpj(clean);
}
