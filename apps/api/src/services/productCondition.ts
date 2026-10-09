/**
 * Condição do aparelho como escolha da venda: quando a grade tem a mesma cor/capacidade em
 * condições diferentes (novo x usado), a condição entra junto com os atributos escolhidos, com o
 * id reservado abaixo, para preço, disponibilidade e baixa irem na variação certa.
 */
export const CONDITION_ATTR_ID = '__condition';
export const CONDITION_LABEL: Record<string, string> = { new: 'Novo', used: 'Usado', refurbished: 'Recondicionado' };

/** Aceita o código ou o nome em português ("Usado", "seminovo"…). */
export function conditionCode(value: unknown): 'new' | 'used' | 'refurbished' | '' {
  const key = String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  if (!key) return '';
  if (key === 'new' || key === 'novo') return 'new';
  if (key === 'used' || key === 'usado') return 'used';
  if (key === 'refurbished' || key === 'recondicionado' || key === 'seminovo') return 'refurbished';
  return '';
}

/** A variação atende a condição escolhida (sem condição escolhida, qualquer uma serve). */
export function conditionMatches(variation: { condition?: unknown }, picked: Record<string, unknown>) {
  const wanted = conditionCode(picked[CONDITION_ATTR_ID]);
  return !wanted || (conditionCode(variation.condition) || 'new') === wanted;
}
