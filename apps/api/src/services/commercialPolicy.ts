import { z } from "zod";

const money = z.number().finite().min(0).max(999999999).multipleOf(0.01);
export const profileSchema = z
  .object({
    segmentId: z.enum([
      "assistencia_tecnica",
      "comercio_eletronicos",
      "vestuario_moda",
      "restaurante_gastronomia",
      "varejo_geral",
      "prestador_servicos",
      "personalizado",
    ]),
    enabled: z.boolean(),
    appleRules: z.boolean(),
    tradeIn: z.boolean(),
    supplierComparison: z.boolean(),
    catalog: z.boolean(),
    readyMarkup: z.number().finite().min(0).max(1000),
    orderMarkup: z.number().finite().min(0).max(1000),
    upgradeMarkup: z.number().finite().min(0).max(1000),
    usedWarrantyMonths: z.number().int().min(0).max(120),
    readyUsedWarrantyMonths: z.number().int().min(0).max(120),
    receiptDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    arrivalTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    cutoffTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    routes: z.array(z.string().trim().min(1).max(100)).max(30),
    categories: z
      .array(z.enum(["iphone", "watch", "ipad", "mac", "other"]))
      .min(1),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      p.appleRules &&
      ![
        "assistencia_tecnica",
        "comercio_eletronicos",
        "personalizado",
      ].includes(p.segmentId)
    )
      ctx.addIssue({
        code: "custom",
        message: "Regras Apple exigem ramo de eletrônicos ou personalizado.",
      });
  });
export type CommercialProfile = z.infer<typeof profileSchema>;
export const offerSchema = z
  .object({
    supplierId: z.string().min(1),
    category: z.enum(["iphone", "watch", "ipad", "mac", "other"]),
    brand: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(200),
    capacity: z.string().trim().max(100),
    color: z.string().trim().max(100),
    configuration: z.string().trim().max(500),
    condition: z.enum(["sealed", "new", "used", "cpo", "refurbished"]),
    cost: money.refine((v) => v > 0),
    warrantyMonths: z.number().int().min(0).max(120),
    warrantyProvider: z.enum(["apple", "supplier", "store", "unspecified"]),
    available: z.boolean(),
    sourceAt: z.string().datetime({ offset: true }),
    validUntil: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine(
    (v) => Date.parse(v.validUntil) > Date.parse(v.sourceAt),
    "Validade deve ser posterior à atualização.",
  );
export type Offer = z.infer<typeof offerSchema> & {
  id: string;
  active: boolean;
};
export function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
export const cents = (value: number) => Math.round(value * 100);
export const amount = (value: number) => cents(value) / 100;
const clean = (v: string) =>
  v.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
export function variantKey(
  o: Pick<
    Offer,
    | "brand"
    | "category"
    | "model"
    | "capacity"
    | "color"
    | "configuration"
    | "condition"
  >,
) {
  return JSON.stringify(
    [
      o.brand,
      o.category,
      o.model,
      o.capacity,
      o.color,
      o.configuration,
      o.condition,
    ].map(clean),
  );
}
export function allowedOffer(o: Offer, p: CommercialProfile) {
  if (!p.categories.includes(o.category)) return false;
  if (!p.appleRules) return true;
  return (
    clean(o.brand) === "apple" &&
    !["other"].includes(o.category) &&
    (o.category === "iphone"
      ? ["sealed", "new", "used"].includes(o.condition)
      : ["sealed", "new"].includes(o.condition))
  );
}
/** Resolve versions BEFORE filtering availability, so a withdrawn/expired offer never resurrects an old price. */
export function currentOffers(offers: Offer[], now = Date.now()) {
  const groups = new Map<string, Offer[]>();
  for (const o of offers) {
    const key = JSON.stringify([o.supplierId, variantKey(o)]);
    const rows = groups.get(key) ?? [];
    rows.push(o);
    groups.set(key, rows);
  }
  const valid: Offer[] = [],
    conflicts: string[] = [];
  for (const rows of groups.values()) {
    const latest = Math.max(...rows.map((o) => Date.parse(o.sourceAt)));
    const candidates = rows.filter((o) => Date.parse(o.sourceAt) === latest);
    const signatures = new Set(
      candidates.map((o) =>
        JSON.stringify([
          o.cost,
          o.available,
          o.active,
          o.warrantyMonths,
          o.warrantyProvider,
          o.validUntil,
        ]),
      ),
    );
    if (signatures.size > 1) {
      conflicts.push(variantKey(rows[0]));
      continue;
    }
    const o = candidates[0];
    if (
      o.active &&
      o.available &&
      Date.parse(o.validUntil) > now &&
      latest <= now
    )
      valid.push(o);
  }
  return { valid, conflicts };
}
export function selectOffer(
  offers: Offer[],
  variant: string,
  p: CommercialProfile,
  purpose: "purchase" | "reference",
  chosenId?: string,
) {
  const { valid, conflicts } = currentOffers(offers);
  if (conflicts.includes(variant))
    fail(
      "Há ofertas divergentes sem precedência comprovada para esta variante.",
      409,
    );
  let candidates = valid.filter(
    (o) => variantKey(o) === variant && allowedOffer(o, p),
  );
  if (
    purpose === "purchase" &&
    candidates[0]?.condition === "used" &&
    p.appleRules
  )
    candidates = candidates.filter(
      (o) =>
        o.warrantyProvider === "supplier" &&
        o.warrantyMonths >= p.usedWarrantyMonths,
    );
  if (!candidates.length)
    fail(
      "Nenhuma oferta atual válida com as condições e garantia exigidas.",
      409,
    );
  candidates.sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
  const selected = chosenId
    ? candidates.find((o) => o.id === chosenId)
    : candidates[0];
  if (!selected)
    fail(
      "Fornecedor escolhido não atende à variante, validade ou garantia.",
      409,
    );
  if (
    purpose === "purchase" &&
    p.supplierComparison &&
    selected.condition !== "used" &&
    selected.cost > candidates[0].cost
  )
    fail("Selecione o menor custo atual desta variante.", 409);
  return selected;
}
export function priceFor(
  cost: number,
  p: CommercialProfile,
  mode: "ready" | "order",
  upgrade: boolean,
) {
  return amount(
    cost *
      (1 +
        (mode === "ready"
          ? p.readyMarkup
          : upgrade
            ? p.upgradeMarkup
            : p.orderMarkup) /
          100),
  );
}
export function warrantyFor(
  o: Offer,
  p: CommercialProfile,
  mode: "ready" | "order",
) {
  if (p.appleRules && ["sealed", "new"].includes(o.condition)) {
    if (o.warrantyProvider !== "apple")
      fail(
        "Confirme a garantia Apple desta oferta antes de anunciar ou vender.",
        409,
      );
    return {
      provider: "apple",
      months: o.warrantyMonths,
      text: "Garantia diretamente com a Apple, conforme condições do produto.",
    };
  }
  if (p.appleRules && o.condition === "used")
    return mode === "ready"
      ? {
          provider: "store",
          months: p.readyUsedWarrantyMonths,
          text: "Garantia da loja, conforme condições aplicáveis e análise técnica.",
        }
      : {
          provider: "supplier",
          months: o.warrantyMonths,
          text: `${o.warrantyMonths} meses de garantia do fornecedor, com intermediação da loja na compra e no atendimento.`,
        };
  return {
    provider: o.warrantyProvider,
    months: o.warrantyMonths,
    text: `Garantia informada: ${o.warrantyMonths} meses; responsável: ${o.warrantyProvider}.`,
  };
}
export function stockMatches(o: Offer, stock: Record<string, any>) {
  const condition =
    o.condition === "used"
      ? "used"
      : o.condition === "refurbished"
        ? "refurbished"
        : "new";
  return (
    clean(stock.name) === clean(o.model) &&
    clean(stock.brand) === clean(o.brand) &&
    clean(stock.capacity || "") === clean(o.capacity) &&
    clean(stock.color || "") === clean(o.color) &&
    clean(stock.attrs?.configuration || stock.attrs?.configuracao || "") ===
      clean(o.configuration) &&
    stock.condition === condition &&
    (o.condition !== "sealed" || stock.attrs?.sealed === true) &&
    (o.condition !== "cpo" || stock.attrs?.commercialCondition === "cpo")
  );
}
export function catalogText(
  name: string,
  offers: Offer[],
  stocks: Record<string, any>[],
  p: CommercialProfile,
) {
  const { valid, conflicts } = currentOffers(offers);
  const rows = new Map<string, Offer>();
  valid
    .filter((o) => allowedOffer(o, p))
    .forEach((o) => rows.set(variantKey(o), o));
  const money = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const title = (o: Offer) =>
    [o.model, o.capacity, o.color, o.configuration].filter(Boolean).join(" · ");
  const sections: string[] = [`📱 ${name}`];
  const upgrade: string[] = [];
  const phoneNew: string[] = [];
  const phoneUsed: string[] = [];
  const other: Record<string, string[]> = {
    watch: [],
    ipad: [],
    mac: [],
    other: [],
  };
  const warnings: string[] = [];
  if (p.tradeIn)
    sections.push(
      "🔄 UPGRADE\n\n🔄 UPGRADE SOB ENCOMENDA\nO preço do aparelho desejado e a referência do usado são tratados separadamente. A oferta pelo usado depende de avaliação; referência de mercado não é a oferta.\nO cliente continua com seu celular até a entrega. Na chegada, conferimos as condições, transferimos os dados e concluímos a troca. Danos ou alterações exigem nova avaliação.\n\n🚀 UPGRADE IMEDIATO\nUtiliza o preço de pronta entrega, descontando a oferta acordada pelo usado.",
    );
  for (const [key, example] of [...rows].sort((a, b) =>
    title(a[1]).localeCompare(title(b[1])),
  )) {
    if (conflicts.includes(key)) {
      warnings.push(`${title(example)}: divergência de preço ou garantia.`);
      continue;
    }
    const label = title(example),
      lines = [label];
    let purchased: Offer | null = null;
    try {
      purchased = selectOffer(offers, key, p, "purchase");
      warrantyFor(purchased, p, "order");
    } catch (error) {
      purchased = null;
      warnings.push(`${label}: ${(error as Error).message}`);
    }
    if (example.category === "iphone" && p.tradeIn) {
      const reference = selectOffer(offers, key, p, "reference");
      if (purchased)
        upgrade.push(
          `${example.condition === "used" ? "♻️" : "🔒"} ${label}\nAparelho desejado: ${money(priceFor(purchased.cost, p, "order", true))}${example.condition === "used" ? `\nReferência de mercado de equivalente: ${money(reference.cost)}; oferta pelo usado depende de avaliação.` : ""}`,
        );
      else if (example.condition === "used")
        upgrade.push(
          `♻️ ${label}\nReferência de mercado de equivalente: ${money(reference.cost)}; oferta pelo usado depende de avaliação. Compra sob encomenda pendente de garantia confirmada.`,
        );
    }
    if (!p.appleRules || example.category === "iphone")
      for (const stock of stocks.filter(
        (s) => stockMatches(example, s) && Number(s.available_qty ?? s.qty) > 0,
      )) {
        if (!(Number(stock.cost) > 0)) continue;
        try {
          const rw = warrantyFor(example, p, "ready");
          lines.push(
            `🚀 Pronta entrega — ${money(priceFor(Number(stock.cost), p, "ready", false))} | ${rw.text}`,
          );
        } catch (error) {
          warnings.push(`${label}: ${(error as Error).message}`);
        }
        break;
      }
    if (purchased) {
      const w = warrantyFor(purchased, p, "order");
      lines.push(
        `📦 Sob encomenda — ${money(priceFor(purchased.cost, p, "order", false))}\n${w.text}\nPagamento antecipado. Prazo e disponibilidade confirmados no pedido.`,
      );
    }
    if (lines.length === 1) continue;
    if (example.category === "iphone")
      (example.condition === "used" ? phoneUsed : phoneNew).push(
        lines.join("\n"),
      );
    else other[example.category].push(lines.join("\n"));
  }

  if (upgrade.length)
    sections.push(
      `💰 TABELA PARA UPGRADE\n${p.upgradeMarkup === 0 ? "PREÇOS DE CUSTO" : "PREÇOS PARA UPGRADE"}\n\n${upgrade.join("\n\n")}\n\nA oferta efetiva pelo usado será inferior à referência e dependerá da avaliação.`,
    );
  if (p.categories.includes("iphone"))
    sections.push(
      `🛍️ COMPRA DE IPHONES\n\n🔒 IPHONES NOVOS / LACRADOS\n${phoneNew.join("\n\n") || "Sem ofertas atuais confirmadas."}\n\n♻️ IPHONES SEMINOVOS\n${phoneUsed.join("\n\n") || "Sem ofertas atuais confirmadas."}`,
    );
  sections.push(
    `📦 OUTROS PRODUTOS${p.appleRules ? " APPLE | SOMENTE SOB ENCOMENDA" : ""}\n\n${
      Object.entries(other)
        .filter(([, v]) => v.length)
        .map(
          ([k, v]) =>
            `${({ watch: "⌚ Apple Watch", ipad: "📱 iPad", mac: "💻 Mac / MacBook / iMac", other: "Outros produtos" } as Record<string, string>)[k]}\n${v.join("\n\n")}`,
        )
        .join("\n\n") || "Sem ofertas atuais confirmadas."
    }`,
  );
  sections.push(
    "🛡️ GARANTIAS E CONDIÇÕES\nGarantia de seminovos sujeita à análise técnica. Mau uso, queda, impacto, líquidos, oxidação ou violação podem afetar a cobertura quando constatados; não há atribuição automática de responsabilidade.\n\n⚠️ INFORMAÇÕES IMPORTANTES\nPreços e disponibilidade são confirmados no pedido e podem mudar conforme atualização das ofertas. Eventuais divergências serão conferidas antes da compra. Documentação fiscal conforme a operação.",
  );
  return { text: sections.join("\n\n"), warnings, conflicts: conflicts.length };
}
