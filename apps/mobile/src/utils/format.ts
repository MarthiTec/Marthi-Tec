export function formatBrl(value: number | null | undefined): string {
  const n = Number(value) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatPercent(value: number | null | undefined): string {
  const n = Number(value) || 0;
  return `${(n * 100).toFixed(1)}%`;
}

export function formatInt(value: number | null | undefined): string {
  return Math.round(Number(value) || 0).toLocaleString('pt-BR');
}
