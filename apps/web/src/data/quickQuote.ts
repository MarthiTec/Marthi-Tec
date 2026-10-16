import { MAX_CALCULATOR_INSTALLMENTS, roundUpCents, simulateInstallments, type InstallmentSimulation } from './installmentCalculator';

/**
 * Cotação rápida (PDV): preço do fornecedor de agora + margem da loja → preço à vista; menos o
 * aparelho do cliente na troca → quanto ele paga; no cartão, a taxa da maquininha vai para o cliente.
 */
export type MarginMode = 'percent' | 'money';

export type QuickQuoteInput = {
  /** Preço do fornecedor neste momento. */
  cost: number;
  marginMode: MarginMode;
  /** Percentual sobre o custo ou valor em reais, conforme marginMode. */
  margin: number;
  /** Valor avaliado do aparelho do cliente (0 = compra sem troca). */
  tradeIn: number;
};

export type QuickQuote = {
  cost: number;
  /** Quanto a loja ganha na venda (a taxa do cartão é paga pelo cliente). */
  profit: number;
  /** Lucro sobre o custo e sobre o preço de venda, em %. */
  markupPercent: number;
  marginOnPricePercent: number;
  cashPrice: number;
  tradeIn: number;
  /** O que o cliente paga depois de descontar a troca. */
  toPay: number;
  /** 1x a 18x sobre o valor a pagar, com a taxa da maquininha de cada quantidade. */
  installments: InstallmentSimulation[];
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const positive = (value: number) => Math.max(0, Number(value) || 0);

export function buildQuickQuote(input: QuickQuoteInput, cardRates: number[]): QuickQuote {
  const cost = positive(input.cost);
  const profit = input.marginMode === 'percent' ? round2((cost * positive(input.margin)) / 100) : round2(positive(input.margin));
  const cashPrice = roundUpCents(cost + profit);
  const tradeIn = Math.min(positive(input.tradeIn), cashPrice);
  const toPay = round2(cashPrice - tradeIn);
  return {
    cost,
    profit,
    markupPercent: cost > 0 ? round2((profit / cost) * 100) : 0,
    marginOnPricePercent: cashPrice > 0 ? round2((profit / cashPrice) * 100) : 0,
    cashPrice,
    tradeIn,
    toPay,
    installments: Array.from({ length: MAX_CALCULATOR_INSTALLMENTS }, (_, index) => simulateInstallments(toPay, index + 1, cardRates[index] ?? 0)),
  };
}

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Texto para o cliente (WhatsApp): sem custo nem margem da loja. */
export function quickQuoteMessage(input: { device: string; quote: QuickQuote; parcels: number; tradeInDevice?: string; validUntil: string }) {
  const { quote } = input;
  const card = quote.installments[Math.max(1, Math.min(MAX_CALCULATOR_INSTALLMENTS, input.parcels)) - 1];
  return [
    `Cotação: ${input.device.trim() || 'aparelho'}`,
    `À vista (Pix/dinheiro): ${money(quote.cashPrice)}`,
    ...(quote.tradeIn > 0
      ? [`Seu aparelho na troca${input.tradeInDevice?.trim() ? ` (${input.tradeInDevice.trim()})` : ''}: - ${money(quote.tradeIn)}`, `Você paga: ${money(quote.toPay)}`]
      : []),
    ...(quote.toPay > 0 ? [`No cartão: ${card.parcels}x de ${money(card.installment)} (total ${money(card.total)})`] : []),
    `Valores válidos para hoje, ${input.validUntil}.`,
  ].join('\n');
}
