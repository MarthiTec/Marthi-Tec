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
 * Verifica se é CNPJ válido em tamanho e formato (14 caracteres alfanuméricos).
 * Aceita tanto o modelo tradicional numérico quanto o novo CNPJ alfanumérico.
 */
export function isCnpj(cleanDoc: string): boolean {
  if (cleanDoc.length !== 14) return false;
  // Deve conter 12 caracteres alfanuméricos e 2 dígitos numéricos finais
  return /^[A-Z0-9]{12}\d{2}$/i.test(cleanDoc) || /^[A-Z0-9]{14}$/i.test(cleanDoc);
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
