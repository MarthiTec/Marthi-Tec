/**
 * Condição do aparelho (novo, usado, recondicionado) e bateria. Quando a grade tem a mesma
 * cor/capacidade em condições diferentes, a condição vira uma escolha da venda (totem, PDV e venda
 * externa), com o id reservado abaixo — o servidor usa o mesmo id para achar a variação certa.
 */
export type ProductConditionCode = 'new' | 'used' | 'refurbished';

export const CONDITION_ATTR_ID = '__condition';
export const CONDITION_LABEL: Record<ProductConditionCode, string> = { new: 'Novo', used: 'Usado', refurbished: 'Recondicionado' };

export function conditionCode(value: unknown): ProductConditionCode | '' {
  const key = String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  if (key === 'new' || key === 'novo') return 'new';
  if (key === 'used' || key === 'usado') return 'used';
  if (key === 'refurbished' || key === 'recondicionado' || key === 'seminovo') return 'refurbished';
  return '';
}

/** Condições diferentes que a grade do produto tem (só vira escolha quando há mais de uma). */
export function productConditionChoices(stock: { variations?: Array<{ condition?: string }> } | null | undefined): ProductConditionCode[] {
  const set = new Set<ProductConditionCode>();
  for (const variation of stock?.variations ?? []) set.add(conditionCode(variation.condition) || 'new');
  return set.size > 1 ? (['new', 'refurbished', 'used'] as ProductConditionCode[]).filter((code) => set.has(code)) : [];
}

/** Texto curto para a vitrine: "Usado · bateria 87%". Novo mostra só "Novo". */
export function conditionText(condition: unknown, batteryLevel?: number | null) {
  const code = conditionCode(condition) || 'new';
  if (code === 'new') return CONDITION_LABEL.new;
  return batteryLevel !== null && batteryLevel !== undefined ? `${CONDITION_LABEL[code]} · bateria ${batteryLevel}%` : CONDITION_LABEL[code];
}
