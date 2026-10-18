/**
 * Cor da bolinha a partir do nome cadastrado (como a loja escreve: "Preto", "Laranja-cósmico", "Titânio
 * natural", "Midnight"…). A ordem importa: nomes compostos antes das cores básicas.
 */
const COLOR_RULES: Array<[RegExp, string]> = [
  [/tit[aâ]nio\s*(natural|desert|deserto)|natural\s*titanium|desert/i, '#bfb3a3'],
  [/tit[aâ]nio\s*(preto|black)|black\s*titanium/i, '#3b3b3d'],
  [/tit[aâ]nio\s*(branco|white)|white\s*titanium/i, '#e6e4df'],
  [/tit[aâ]nio\s*azul|blue\s*titanium/i, '#3f4b5c'],
  [/tit[aâ]nio|titanium/i, '#b9b3aa'],
  [/meia[-\s]*noite|midnight|midd?night/i, '#232a35'],
  [/estelar|starlight/i, '#f2e9dc'],
  [/grafite|graphite/i, '#4a4b4f'],
  [/space\s*(black|gr[ae]y)|cinza[-\s]*espacial/i, '#3e3f43'],
  [/laranja[-\s]*c[oó]smico|cosmic\s*orange/i, '#d9672b'],
  [/bord[oô]|burgundy|vinho/i, '#6b1e2e'],
  [/roxo[-\s]*profundo|deep\s*purple/i, '#4b3a5a'],
  [/verde[-\s]*meia[-\s]*noite|midnight\s*green/i, '#3d4a43'],
  [/verde[-\s]*(alpino|alpine)|alpine\s*green/i, '#576856'],
  [/azul[-\s]*(sierra|sierra)|sierra\s*blue/i, '#9bb5ce'],
  [/azul[-\s]*(pac[ií]fico)|pacific\s*blue/i, '#2f4c5f'],
  [/azul[-\s]*(n[eé]voa|mist)|mist\s*blue/i, '#9fb3c8'],
  [/ultramarino|ultramarine/i, '#5965c9'],
  [/sage|s[aá]lvia/i, '#a8b4a0'],
  [/teal|verde[-\s]*azulado|turquesa/i, '#3d9c9c'],
  [/lavanda|lavender/i, '#c9b7e3'],
  [/dourado|gold|ouro/i, '#e6cfa3'],
  [/prata|prateado|silver/i, '#d9d9db'],
  [/rosa|pink/i, '#f2b8c6'],
  [/roxo|lil[aá]s|purple|violeta/i, '#8a6bb0'],
  [/vermelho|red|\(product\)/i, '#c8102e'],
  [/laranja|orange/i, '#f08a24'],
  [/amarelo|yellow/i, '#f5d547'],
  [/verde|green/i, '#4b8b5a'],
  [/azul|blue/i, '#3b6fd8'],
  [/marrom|brown|caf[eé]/i, '#7a5236'],
  [/cinza|gr[ae]y/i, '#9a9ca1'],
  [/branco|white|neve/i, '#f7f7f5'],
  [/preto|black|onix|[oô]nix/i, '#1b1b1d'],
];

/** Hex da cor (ou null quando o nome não diz a cor; a tela mostra o nome). */
export function colorHex(name: string): string | null {
  const text = name.normalize('NFC').trim();
  if (!text) return null;
  for (const [rule, hex] of COLOR_RULES) if (rule.test(text)) return hex;
  return null;
}

/** Cor clara precisa de borda para aparecer no fundo branco. */
export function isLightColor(hex: string) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 200;
}
