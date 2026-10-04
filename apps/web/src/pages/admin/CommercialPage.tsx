import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AdminPicker } from "../../components/AdminPicker";
import { CrudRowActions, confirmDelete } from "../../components/CrudKit";
import {
  getActiveStoreId,
  STORE_CONTEXT_CHANGED_EVENT,
} from "../../data/multiStoreStore";
import {
  STORE_SEGMENT_OPTIONS,
  getStoreCustomization,
  type StoreSegmentId,
} from "../../data/storeSegment";
import {
  commercialRequest,
  type CommercialProfile,
  type CommercialOffer,
  type CommercialState,
  type CommercialOrder,
  type CommercialOrderInput,
  type Assessment,
} from "../../services/commercialApi";
import "./commercial.css";

const money = (v: number | string) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const categories = [
  { value: "iphone", label: "iPhone" },
  { value: "watch", label: "Apple Watch" },
  { value: "ipad", label: "iPad" },
  { value: "mac", label: "Mac / MacBook / iMac" },
  { value: "other", label: "Outros produtos" },
];
const conditions = [
  { value: "sealed", label: "Lacrado" },
  { value: "new", label: "Novo" },
  { value: "used", label: "Seminovo" },
  { value: "cpo", label: "CPO" },
  { value: "refurbished", label: "Recondicionado" },
];
const providers = [
  { value: "unspecified", label: "Não informada" },
  { value: "apple", label: "Apple" },
  { value: "supplier", label: "Fornecedor" },
  { value: "store", label: "Loja" },
];
const statuses: Record<string, string> = {
  quoted: "Proposta",
  confirmed: "Confirmada / aguardando pagamento",
  purchased: "Comprada",
  in_transit: "Em trânsito",
  received: "Recebida",
  delivered: "Entregue",
  cancelled: "Cancelada",
};
const checklist: Record<string, string> = {
  screen: "Tela",
  housing: "Carcaça",
  cameras: "Câmeras",
  faceId: "Face ID",
  functioning: "Funcionamento geral",
  originalParts: "Originalidade das peças",
  repairs: "Reparos identificáveis",
  damage: "Avarias / marcas de uso",
};
const blankAssessment = (): Assessment => ({
  batteryHealth: null,
  screen: "unknown",
  housing: "unknown",
  cameras: "unknown",
  faceId: "unknown",
  functioning: "unknown",
  originalParts: "unknown",
  repairs: "unknown",
  damage: "unknown",
  notes: "",
  assessedAt: new Date().toISOString(),
});
const blankOffer = (): CommercialOffer => ({
  supplierId: "",
  category: "other",
  brand: "",
  model: "",
  capacity: "",
  color: "",
  configuration: "",
  condition: "new",
  cost: 0,
  warrantyMonths: 0,
  warrantyProvider: "unspecified",
  available: true,
  sourceAt: "",
  validUntil: "",
});
const blankOrder = (): CommercialOrderInput => ({
  requestId: crypto.randomUUID(),
  customerId: "",
  offerId: "",
  mode: "order",
  stockId: null,
  qty: 1,
  tradeIn: null,
  notes: "",
});
const defaultProfile = (segmentId: StoreSegmentId): CommercialProfile => ({
  segmentId,
  enabled: false,
  appleRules: false,
  tradeIn: false,
  supplierComparison: false,
  catalog: false,
  readyMarkup: 0,
  orderMarkup: 0,
  upgradeMarkup: 0,
  usedWarrantyMonths: 0,
  readyUsedWarrantyMonths: 0,
  receiptDays: [1, 2, 3, 4, 5],
  arrivalTime: "08:00",
  cutoffTime: "17:00",
  routes: [],
  categories: ["other"],
});
const localDate = (iso: string) =>
  iso
    ? new Date(Date.parse(iso) - new Date(iso).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
const isoDate = (local: string) => (local ? new Date(local).toISOString() : "");
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="commercial-field">
      {label}
      {children}
    </label>
  );
}
function checkRow(
  label: string,
  checked: boolean,
  onChange: (v: boolean) => void,
  disabled = false,
) {
  return (
    <label className="commercial-check">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function CommercialPage({
  settingsOnly = false,
}: {
  settingsOnly?: boolean;
}) {
  const [storeId, setStoreId] = useState(getActiveStoreId);
  const [state, setState] = useState<CommercialState | null>(null),
    [profile, setProfile] = useState<CommercialProfile | null>(null);
  const [tab, setTab] = useState("rules"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0),
    [offer, setOffer] = useState<CommercialOffer | null>(null),
    [offerReadOnly, setOfferReadOnly] = useState(false);
  const [order, setOrder] = useState<CommercialOrderInput | null>(null),
    [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommercialOrder | null>(null),
    [importText, setImportText] = useState(""),
    [preview, setPreview] = useState<CommercialOffer[]>([]);
  const [catalog, setCatalog] = useState<{
    text: string;
    warnings: string[];
    conflicts: number;
  } | null>(null);
  const [transition, setTransition] = useState({
    status: "",
    expectedAt: "",
    route: "",
    tracking: "",
    notes: "",
    deliveredImei: "",
    physicalReceiptConfirmed: false,
    sameConditionConfirmed: false,
    dataTransferConfirmed: false,
  });
  const [payment, setPayment] = useState({
    requestId: crypto.randomUUID(),
    amount: 0,
    accountId: "",
    method: "",
    kind: "payment",
  });
  const [search, setSearch] = useState("");
  useEffect(() => {
    const change = () => setStoreId(getActiveStoreId());
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, change);
    return () =>
      window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, change);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setState(null);
    setDetail(null);
    setOffer(null);
    setOrder(null);
    setCatalog(null);
    setPreview([]);
    setError("");
    void commercialRequest<CommercialState>(
      "/state",
      "GET",
      undefined,
      controller.signal,
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        setState(data);
        setProfile(
          data.profile ||
            defaultProfile(
              STORE_SEGMENT_OPTIONS.find((o) => o.value === data.segmentId)
                ?.value || getStoreCustomization().segmentId,
            ),
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [storeId, revision]);
  const act = async (work: () => Promise<void>, refresh = true) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const startingStore = getActiveStoreId();
    try {
      await work();
      if (startingStore !== getActiveStoreId()) return;
      if (refresh) setRevision((v) => v + 1);
      setNotice("Operação confirmada pelo banco.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const selectDetail = (item: CommercialOrder, initialStatus = "") =>
    void act(async () => {
      const data = await commercialRequest<CommercialOrder>(
        `/orders/${item.id}`,
      );
      setDetail(data);
      setPayment({
        requestId: crypto.randomUUID(),
        amount: Math.max(0, item.details.netTotal - Number(item.paid_amount)),
        accountId: "",
        method: "",
        kind: "payment",
      });
      setTransition({
        status: initialStatus,
        expectedAt: localDate(item.details.expectedAt || ""),
        route: item.details.route || "",
        tracking: item.details.tracking || "",
        notes: "",
        deliveredImei: "",
        physicalReceiptConfirmed: false,
        sameConditionConfirmed: false,
        dataTransferConfirmed: false,
      });
    }, false);
  const offerLabel = (o: CommercialOffer) =>
    [
      o.model,
      o.capacity,
      o.color,
      o.configuration,
      conditions.find((c) => c.value === o.condition)?.label,
      money(o.cost),
    ]
      .filter(Boolean)
      .join(" · ");
  const setOfferField = (key: keyof CommercialOffer, value: unknown) =>
    setOffer((current) => (current ? { ...current, [key]: value } : null));
  const offerPayload = (o: CommercialOffer) => {
    const { id, active, ...input } = o;
    return input;
  };
  if (!state || !profile)
    return (
      <div className="admin-page commercial-page">
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status">Consultando dados da loja…</p>
        )}
        <button
          className="btn btn--ghost"
          onClick={() => setRevision((v) => v + 1)}
        >
          Tentar novamente
        </button>
      </div>
    );
  const edit = state.canEdit && !busy;
  const profileField = (key: keyof CommercialProfile, value: unknown) =>
    setProfile({ ...profile, [key]: value });
  const orderOptions = state.offers.filter(
    (o) => o.active && o.available && Date.parse(o.validUntil) > Date.now(),
  );
  const nextStates = detail
    ? (
        {
          quoted: ["confirmed"],
          confirmed:
            detail.details.mode === "ready" ? ["delivered"] : ["purchased"],
          purchased: ["in_transit", "received"],
          in_transit: ["received"],
          received: ["delivered"],
          delivered: [],
        } as Record<string, string[]>
      )[detail.status] || []
    : [];
  return (
    <div className="admin-page commercial-page">
      <article className="admin-card">
        <h2>Comercial por ramo — {state.storeName}</h2>
        <p className="empty">
          Regras opcionais desta loja. Ofertas de fornecedor não são saldo
          físico. Encomendas só movimentam estoque no recebimento e na entrega.
        </p>
        {!settingsOnly ? (
          <div className="commercial-toolbar">
            {[
              ["rules", "Regras"],
              ["offers", "Fornecedores / ofertas"],
              ["orders", "Encomendas / upgrades"],
              ["agenda", "Recebimentos"],
              ["catalog", "Tabela WhatsApp"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`btn ${tab === value ? "btn--primary" : "btn--ghost"}`}
                onClick={() => {
                  setTab(value);
                  setDetail(null);
                }}
              >
                {label}
              </button>
            ))}
            <button
              className="btn btn--ghost"
              onClick={() => setRevision((v) => v + 1)}
            >
              Atualizar
            </button>
          </div>
        ) : (
          <Link to="/erp/comercial">Abrir ofertas e encomendas</Link>
        )}
      </article>
      {error ? (
        <p role="alert" className="commercial-error">
          {error}
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {tab === "rules" || settingsOnly ? (
        <form
          className="admin-card"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await commercialRequest("/profile", "PUT", {
                ...profile,
                routes: profile.routes.map((r) => r.trim()).filter(Boolean),
              });
            });
          }}
        >
          <h3>Regras comerciais da loja</h3>
          <p className="empty">
            Nenhuma política é ativada automaticamente. O modelo Cellponto
            apenas preenche este formulário para revisão e salvamento.
          </p>
          <fieldset
            disabled={!state.canConfigure || busy}
            className="commercial-form"
          >
            <AdminPicker
              label="Ramo vinculado"
              value={profile.segmentId}
              options={STORE_SEGMENT_OPTIONS}
              onChange={(v) => profileField("segmentId", v)}
            />
            {checkRow("Ativar operação de encomendas", profile.enabled, (v) =>
              profileField("enabled", v),
            )}
            {checkRow(
              "Aplicar regras Apple por categoria",
              profile.appleRules,
              (v) => profileField("appleRules", v),
            )}
            {checkRow(
              "Permitir upgrade / avaliação de usados",
              profile.tradeIn,
              (v) => profileField("tradeIn", v),
            )}
            {checkRow(
              "Exigir menor custo para novos encomendados",
              profile.supplierComparison,
              (v) => profileField("supplierComparison", v),
            )}
            {checkRow(
              "Gerar tabela comercial para WhatsApp",
              profile.catalog,
              (v) => profileField("catalog", v),
            )}
            {(
              [
                "readyMarkup",
                "orderMarkup",
                "upgradeMarkup",
                "usedWarrantyMonths",
                "readyUsedWarrantyMonths",
              ] as const
            ).map((k) => (
              <Field
                key={k}
                label={
                  {
                    readyMarkup: "Pronta entrega: acréscimo sobre custo (%)",
                    orderMarkup: "Encomenda: acréscimo sobre custo (%)",
                    upgradeMarkup: "Upgrade encomendado: acréscimo (%)",
                    usedWarrantyMonths:
                      "Garantia mínima do fornecedor para seminovo (meses)",
                    readyUsedWarrantyMonths:
                      "Garantia da loja para seminovo pronto (meses)",
                  }[k]
                }
              >
                <input
                  type="number"
                  min="0"
                  max={k.includes("Warranty") ? 120 : 1000}
                  step={k.includes("Warranty") ? 1 : 0.01}
                  value={profile[k]}
                  onChange={(e) => profileField(k, Number(e.target.value))}
                />
              </Field>
            ))}
            <Field label="Horário esperado de chegada">
              <input
                type="time"
                value={profile.arrivalTime}
                onChange={(e) => profileField("arrivalTime", e.target.value)}
                required
              />
            </Field>
            <Field label="Horário de corte de pedido">
              <input
                type="time"
                value={profile.cutoffTime}
                onChange={(e) => profileField("cutoffTime", e.target.value)}
                required
              />
            </Field>
            <Field label="Rotas / origens (uma por linha)">
              <textarea
                value={profile.routes.join("\n")}
                onChange={(e) =>
                  profileField("routes", e.target.value.split("\n"))
                }
              />
            </Field>
            <div>
              <strong>Dias de recebimento previstos</strong>
              {[
                "Domingo",
                "Segunda",
                "Terça",
                "Quarta",
                "Quinta",
                "Sexta",
                "Sábado",
              ].map((day, i) => (
                <span key={day}>
                  {checkRow(day, profile.receiptDays.includes(i), (v) =>
                    profileField(
                      "receiptDays",
                      v
                        ? [...profile.receiptDays, i]
                        : profile.receiptDays.filter((d) => d !== i),
                    ),
                  )}
                </span>
              ))}
            </div>
            <div>
              <strong>Categorias na tabela</strong>
              {categories.map((c) => (
                <span key={c.value}>
                  {checkRow(
                    c.label,
                    profile.categories.includes(c.value),
                    (v) =>
                      profileField(
                        "categories",
                        v
                          ? [...profile.categories, c.value]
                          : profile.categories.filter((k) => k !== c.value),
                      ),
                  )}
                </span>
              ))}
            </div>
            <div className="commercial-toolbar">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={
                  ![
                    "assistencia_tecnica",
                    "comercio_eletronicos",
                    "personalizado",
                  ].includes(profile.segmentId)
                }
                onClick={() =>
                  setProfile({
                    ...profile,
                    enabled: true,
                    appleRules: true,
                    tradeIn: true,
                    supplierComparison: true,
                    catalog: true,
                    readyMarkup: 10,
                    orderMarkup: 5,
                    upgradeMarkup: 0,
                    usedWarrantyMonths: 6,
                    receiptDays: [2, 3, 4, 5, 6],
                    categories: ["iphone", "watch", "ipad", "mac"],
                  })
                }
              >
                Preencher modelo Cellponto
              </button>
              <button className="btn btn--primary" type="submit">
                Salvar regras no banco
              </button>
            </div>
          </fieldset>
        </form>
      ) : null}
      {!settingsOnly && tab !== "rules" && !state.profile?.enabled ? (
        <article className="admin-card">
          <p>Ative e salve as regras desta loja antes de operar.</p>
        </article>
      ) : null}
      {!settingsOnly && state.profile?.enabled && tab === "offers" ? (
        <>
          <article className="admin-card">
            <h3>Ofertas e histórico dos fornecedores</h3>
            <p className="empty">
              Editar cria uma nova versão datada. Preços diferentes na mesma
              data geram divergência; não são escolhidos silenciosamente.
            </p>
            <div className="commercial-toolbar">
              <input
                aria-label="Buscar oferta"
                placeholder="Buscar modelo, capacidade ou cor"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                className="btn btn--primary"
                disabled={!edit}
                onClick={() => {
                  setOffer(blankOffer());
                  setOfferReadOnly(false);
                }}
              >
                Nova oferta
              </button>
            </div>
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Variante</th>
                    <th>Fornecedor</th>
                    <th>Custo / garantia</th>
                    <th>Atualização / validade</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {state.offers
                    .filter((o) =>
                      offerLabel(o)
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((o) => (
                      <tr key={o.id}>
                        <td>
                          {offerLabel(o)}
                          {!o.active
                            ? " · Retirada"
                            : !o.available
                              ? " · Indisponível"
                              : ""}
                        </td>
                        <td>
                          {state.suppliers.find((s) => s.id === o.supplierId)
                            ?.name || "Fornecedor inativo"}
                        </td>
                        <td>
                          {money(o.cost)} · {o.warrantyMonths} meses (
                          {
                            providers.find(
                              (p) => p.value === o.warrantyProvider,
                            )?.label
                          }
                          )
                        </td>
                        <td>
                          {new Date(o.sourceAt).toLocaleString("pt-BR")}
                          <br />
                          {new Date(o.validUntil).toLocaleString("pt-BR")}
                        </td>
                        <td>
                          <CrudRowActions
                            canEdit={edit}
                            canDelete={edit && o.active}
                            onView={() => {
                              setOffer(o);
                              setOfferReadOnly(true);
                            }}
                            onEdit={() => {
                              setOffer({ ...o, sourceAt: "" });
                              setOfferReadOnly(false);
                            }}
                            onDuplicate={() => {
                              setOffer({ ...o, id: undefined, sourceAt: "" });
                              setOfferReadOnly(false);
                            }}
                            onDelete={() => {
                              if (
                                confirmDelete(
                                  "esta oferta (histórico preservado)",
                                )
                              )
                                void act(async () => {
                                  await commercialRequest(
                                    `/offers/${o.id}`,
                                    "DELETE",
                                  );
                                });
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </article>
          {offer ? (
            <form
              className="admin-card"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  await commercialRequest("/offers", "POST", [
                    offerPayload(offer),
                  ]);
                  setOffer(null);
                });
              }}
            >
              <h3>
                {offerReadOnly
                  ? "Consultar oferta"
                  : "Registrar versão da oferta"}
              </h3>
              <fieldset
                disabled={offerReadOnly || !edit}
                className="commercial-form"
              >
                <AdminPicker
                  label="Fornecedor cadastrado"
                  value={offer.supplierId}
                  options={state.suppliers.map((s) => ({
                    value: s.id,
                    label: s.name,
                  }))}
                  onChange={(v) => setOfferField("supplierId", v)}
                />
                <AdminPicker
                  label="Categoria"
                  value={offer.category}
                  options={categories}
                  onChange={(v) => setOfferField("category", v)}
                />
                {(
                  [
                    "brand",
                    "model",
                    "capacity",
                    "color",
                    "configuration",
                  ] as const
                ).map((k) => (
                  <Field
                    key={k}
                    label={
                      {
                        brand: "Marca",
                        model: "Modelo exato",
                        capacity: "Capacidade",
                        color: "Cor",
                        configuration: "Configuração / versão / tamanho",
                      }[k]
                    }
                  >
                    <input
                      value={offer[k]}
                      required={k === "model" || k === "brand"}
                      onChange={(e) => setOfferField(k, e.target.value)}
                    />
                  </Field>
                ))}
                <AdminPicker
                  label="Condição"
                  value={offer.condition}
                  options={conditions}
                  onChange={(v) => setOfferField("condition", v)}
                />
                <Field label="Custo informado (R$)">
                  <input
                    type="number"
                    min="0.01"
                    max="999999999"
                    step="0.01"
                    required
                    value={offer.cost}
                    onChange={(e) =>
                      setOfferField("cost", Number(e.target.value))
                    }
                  />
                </Field>
                <AdminPicker
                  label="Responsável pela garantia"
                  value={offer.warrantyProvider}
                  options={providers}
                  onChange={(v) => setOfferField("warrantyProvider", v)}
                />
                <Field label="Garantia informada (meses)">
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={offer.warrantyMonths}
                    onChange={(e) =>
                      setOfferField("warrantyMonths", Number(e.target.value))
                    }
                  />
                </Field>
                <Field label="Data da atualização do fornecedor">
                  <input
                    type="datetime-local"
                    required
                    value={localDate(offer.sourceAt)}
                    onChange={(e) =>
                      setOfferField("sourceAt", isoDate(e.target.value))
                    }
                  />
                </Field>
                <Field label="Válida até">
                  <input
                    type="datetime-local"
                    required
                    value={localDate(offer.validUntil)}
                    onChange={(e) =>
                      setOfferField("validUntil", isoDate(e.target.value))
                    }
                  />
                </Field>
                {checkRow(
                  "Disponibilidade confirmada no fornecedor",
                  offer.available,
                  (v) => setOfferField("available", v),
                )}
                <button type="submit" className="btn btn--primary">
                  Salvar oferta
                </button>
              </fieldset>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setOffer(null)}
              >
                Fechar
              </button>
              {!offerReadOnly ? (
                <section>
                  <h4>Importar lista do fornecedor</h4>
                  <p className="empty">
                    Cole linhas separadas por tabulação ou | nesta ordem:
                    categoria, marca, modelo, capacidade, cor, configuração,
                    condição, custo, responsável pela garantia, meses. Use os
                    códigos exibidos nas opções (iphone/watch/ipad/mac/other;
                    sealed/new/used/cpo/refurbished;
                    apple/supplier/store/unspecified). A data, validade e
                    fornecedor do formulário serão usados após sua revisão.
                  </p>
                  <textarea
                    aria-label="Lista do fornecedor"
                    rows={5}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={!edit}
                    onClick={() => {
                      try {
                        const rows = importText
                          .trim()
                          .split("\n")
                          .filter(Boolean)
                          .map((line, index) => {
                            const cells = line
                              .split(/\t|\|/)
                              .map((v) => v.trim());
                            if (cells.length !== 10)
                              throw Error(
                                `Linha ${index + 1}: informe os dez campos, sem deduzir informações ausentes.`,
                              );
                            const [
                              category,
                              brand,
                              model,
                              capacity,
                              color,
                              configuration,
                              condition,
                              cost,
                              warrantyProvider,
                              warrantyMonths,
                            ] = cells;
                            return {
                              ...offerPayload(offer),
                              category,
                              brand,
                              model,
                              capacity,
                              color,
                              configuration,
                              condition,
                              cost: Number(cost.replace(",", ".")),
                              warrantyProvider,
                              warrantyMonths: Number(warrantyMonths),
                            };
                          });
                        setPreview(rows);
                        setError("");
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Conferir lista
                  </button>
                  {preview.length ? (
                    <>
                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Variante</th>
                              <th>Custo</th>
                              <th>Garantia</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.map((row, i) => (
                              <tr key={i}>
                                <td>{offerLabel(row)}</td>
                                <td>{money(row.cost)}</td>
                                <td>
                                  {row.warrantyMonths} meses ·{" "}
                                  {row.warrantyProvider}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={!edit}
                        onClick={() =>
                          void act(async () => {
                            await commercialRequest("/offers", "POST", preview);
                            setPreview([]);
                            setOffer(null);
                          })
                        }
                      >
                        Confirmar importação no banco
                      </button>
                    </>
                  ) : null}
                </section>
              ) : null}
            </form>
          ) : null}
        </>
      ) : null}
      {!settingsOnly && state.profile?.enabled && tab === "orders" ? (
        <>
          <article className="admin-card">
            <h3>Encomendas e upgrades</h3>
            <button
              className="btn btn--primary"
              disabled={!edit}
              onClick={() => {
                setOrder(blankOrder());
                setEditingOrder(null);
              }}
            >
              Nova proposta
            </button>
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Cliente / aparelho</th>
                    <th>Situação</th>
                    <th>Total / recebido</th>
                    <th>Previsão</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {state.orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        {
                          state.customers.find((c) => c.id === o.customer_id)
                            ?.name
                        }
                        <br />
                        {offerLabel(o.details.offer)}
                      </td>
                      <td>{statuses[o.status]}</td>
                      <td>
                        {money(o.details.netTotal)}
                        <br />
                        Recebido: {money(o.paid_amount)}
                      </td>
                      <td>
                        {o.details.expectedAt
                          ? new Date(o.details.expectedAt).toLocaleString(
                              "pt-BR",
                            )
                          : "A confirmar"}
                      </td>
                      <td>
                        <CrudRowActions
                          canEdit={edit && o.status === "quoted"}
                          canDelete={edit && o.status !== "cancelled"}
                          onView={() => selectDetail(o)}
                          onEdit={() => {
                            setOrder({
                              ...o.details,
                              customerId: o.customer_id,
                              offerId: o.details.offer.id!,
                              requestId: crypto.randomUUID(),
                              tradeIn: o.details.tradeIn
                                ? {
                                    referenceOfferId:
                                      o.details.tradeIn.referenceOfferId,
                                    deviceName: o.details.tradeIn.deviceName,
                                    imei: o.details.tradeIn.imei,
                                    offerValue: o.details.tradeIn.offerValue,
                                    assessment: o.details.tradeIn.assessment,
                                  }
                                : null,
                            });
                            setEditingOrder(o.id);
                          }}
                          onDuplicate={() => {
                            setOrder({
                              ...o.details,
                              customerId: o.customer_id,
                              offerId: o.details.offer.id!,
                              requestId: crypto.randomUUID(),
                              stockId:
                                o.details.mode === "ready"
                                  ? o.details.stockId
                                  : null,
                            });
                            setEditingOrder(null);
                          }}
                          onDelete={() => {
                            selectDetail(o, "cancelled");
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
          {order ? (
            <form
              className="admin-card"
              onSubmit={(e) => {
                e.preventDefault();
                const payload = {
                  requestId: order.requestId,
                  customerId: order.customerId,
                  offerId: order.offerId,
                  mode: order.mode,
                  stockId: order.mode === "ready" ? order.stockId : null,
                  qty: order.qty,
                  tradeIn: order.tradeIn
                    ? {
                        referenceOfferId: order.tradeIn.referenceOfferId,
                        deviceName: order.tradeIn.deviceName,
                        imei: order.tradeIn.imei,
                        offerValue: order.tradeIn.offerValue,
                        assessment: order.tradeIn.assessment,
                      }
                    : null,
                  notes: order.notes,
                };
                void act(async () => {
                  await commercialRequest(
                    editingOrder ? `/orders/${editingOrder}` : "/orders",
                    editingOrder ? "PUT" : "POST",
                    payload,
                  );
                  setOrder(null);
                });
              }}
            >
              <h3>{editingOrder ? "Editar proposta" : "Nova proposta"}</h3>
              <fieldset disabled={!edit} className="commercial-form">
                <AdminPicker
                  label="Cliente cadastrado"
                  value={order.customerId}
                  options={state.customers.map((c) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                  onChange={(v) => setOrder({ ...order, customerId: v })}
                />
                <AdminPicker
                  label="Aparelho desejado / oferta"
                  value={order.offerId}
                  options={orderOptions.map((o) => ({
                    value: o.id!,
                    label: offerLabel(o),
                  }))}
                  onChange={(v) => setOrder({ ...order, offerId: v })}
                />
                <AdminPicker
                  label="Modalidade"
                  value={order.mode}
                  options={[
                    { value: "order", label: "Sob encomenda" },
                    { value: "ready", label: "Pronta entrega (saldo físico)" },
                  ]}
                  onChange={(v) =>
                    setOrder({
                      ...order,
                      mode: v as "order" | "ready",
                      stockId: null,
                    })
                  }
                />
                {order.mode === "ready" ? (
                  <AdminPicker
                    label="Produto físico equivalente"
                    value={order.stockId || ""}
                    options={state.stock
                      .filter((s) => s.available_qty > 0)
                      .map((s) => ({
                        value: s.id,
                        label: `${s.name} ${s.capacity || ""} ${s.color || ""} · ${s.available_qty} disponíveis`,
                      }))}
                    onChange={(v) => setOrder({ ...order, stockId: v })}
                  />
                ) : null}
                <Field label="Quantidade">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={order.qty}
                    onChange={(e) =>
                      setOrder({ ...order, qty: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Observações da negociação">
                  <textarea
                    value={order.notes}
                    onChange={(e) =>
                      setOrder({ ...order, notes: e.target.value })
                    }
                  />
                </Field>
                {state.profile.tradeIn
                  ? checkRow(
                      "Cliente entregará um usado na conclusão",
                      !!order.tradeIn,
                      (v) =>
                        setOrder({
                          ...order,
                          tradeIn: v
                            ? {
                                referenceOfferId: "",
                                deviceName: "",
                                imei: "",
                                offerValue: 0,
                                assessment: blankAssessment(),
                              }
                            : null,
                        }),
                    )
                  : null}
                {order.tradeIn ? (
                  <TradeForm
                    trade={order.tradeIn}
                    offers={orderOptions.filter((o) => o.condition === "used")}
                    setTrade={(trade) => setOrder({ ...order, tradeIn: trade })}
                  />
                ) : null}
                <p className="empty">
                  O banco calcula os preços a partir da oferta e da política da
                  loja. Nenhum usado entra no estoque ao salvar ou pagar a
                  proposta.
                </p>
                <button className="btn btn--primary">Salvar proposta</button>
              </fieldset>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setOrder(null)}
              >
                Fechar
              </button>
            </form>
          ) : null}
          {detail ? (
            <article className="admin-card">
              <h3>
                {statuses[detail.status]} — {detail.details.offer.model}
              </h3>
              <p>
                Preço do aparelho: {money(detail.details.total)} · Oferta pelo
                usado: {money(detail.details.tradeIn?.offerValue || 0)} ·
                Diferença: {money(detail.details.netTotal)}
              </p>
              <p>{detail.details.warranty.text}</p>
              {detail.details.tradeIn ? (
                <p className="empty">
                  Referência e oferta são valores independentes. O cliente
                  permanece com o aparelho até a entrega; alterações exigem
                  reavaliação.
                </p>
              ) : null}
              <fieldset disabled={!edit} className="commercial-form">
                <AdminPicker
                  label="Próxima etapa"
                  value={transition.status}
                  options={[
                    ...nextStates,
                    ...(detail.status !== "cancelled" ? ["cancelled"] : []),
                  ].map((s) => ({ value: s, label: statuses[s] }))}
                  onChange={(v) => setTransition({ ...transition, status: v })}
                />
                <Field label="Previsão confirmada de chegada">
                  <input
                    type="datetime-local"
                    value={transition.expectedAt}
                    onChange={(e) =>
                      setTransition({
                        ...transition,
                        expectedAt: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Origem / rota">
                  <input
                    list="commercial-routes"
                    value={transition.route}
                    onChange={(e) =>
                      setTransition({ ...transition, route: e.target.value })
                    }
                  />
                  <datalist id="commercial-routes">
                    {profile.routes.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Rastreio / referência do transporte">
                  <input
                    value={transition.tracking}
                    onChange={(e) =>
                      setTransition({ ...transition, tracking: e.target.value })
                    }
                  />
                </Field>
                <Field label="IMEI do aparelho recebido / entregue">
                  <input
                    value={transition.deliveredImei}
                    onChange={(e) =>
                      setTransition({
                        ...transition,
                        deliveredImei: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Conferência / motivo de cancelamento">
                  <textarea
                    value={transition.notes}
                    onChange={(e) =>
                      setTransition({ ...transition, notes: e.target.value })
                    }
                  />
                </Field>
                {checkRow(
                  "Mercadoria recebida/devolvida e conferida fisicamente",
                  transition.physicalReceiptConfirmed,
                  (v) =>
                    setTransition({
                      ...transition,
                      physicalReceiptConfirmed: v,
                    }),
                )}
                {checkRow(
                  "Usado reavaliado e nas condições acordadas",
                  transition.sameConditionConfirmed,
                  (v) =>
                    setTransition({ ...transition, sameConditionConfirmed: v }),
                )}
                {checkRow(
                  "Transferência dos dados concluída ou dispensada pelo cliente",
                  transition.dataTransferConfirmed,
                  (v) =>
                    setTransition({ ...transition, dataTransferConfirmed: v }),
                )}
                <button
                  className="btn btn--primary"
                  disabled={!transition.status}
                  onClick={() => {
                    if (
                      transition.status === "cancelled" &&
                      !confirmDelete(
                        "a operação (devolução financeira é registrada separadamente)",
                      )
                    )
                      return;
                    void act(async () => {
                      await commercialRequest(
                        `/orders/${detail.id}/transition`,
                        "POST",
                        {
                          ...transition,
                          expectedAt: transition.expectedAt
                            ? isoDate(transition.expectedAt)
                            : null,
                        },
                      );
                    });
                  }}
                >
                  Confirmar etapa no banco
                </button>
              </fieldset>
              <h4>Pagamento antecipado / devolução</h4>
              <fieldset
                disabled={
                  !edit ||
                  detail.status === "quoted" ||
                  detail.status === "delivered"
                }
                className="commercial-form"
              >
                <AdminPicker
                  label="Conta financeira"
                  value={payment.accountId}
                  options={state.accounts.map((a) => ({
                    value: a.id,
                    label: a.name,
                  }))}
                  onChange={(v) => setPayment({ ...payment, accountId: v })}
                />
                <AdminPicker
                  label="Operação"
                  value={payment.kind}
                  options={[
                    { value: "payment", label: "Receber antecipação" },
                    { value: "refund", label: "Devolver ao cliente" },
                  ]}
                  onChange={(v) =>
                    setPayment({
                      ...payment,
                      kind: v,
                      requestId: crypto.randomUUID(),
                    })
                  }
                />
                <Field label="Valor">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={payment.amount}
                    onChange={(e) =>
                      setPayment({ ...payment, amount: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Forma / referência do pagamento">
                  <input
                    value={payment.method}
                    onChange={(e) =>
                      setPayment({ ...payment, method: e.target.value })
                    }
                  />
                </Field>
                <button
                  className="btn btn--primary"
                  onClick={() =>
                    void act(async () => {
                      await commercialRequest(
                        `/orders/${detail.id}/payments`,
                        "POST",
                        payment,
                      );
                      setPayment({
                        ...payment,
                        requestId: crypto.randomUUID(),
                      });
                    })
                  }
                >
                  Registrar movimento financeiro
                </button>
              </fieldset>
              {detail.details.tradeIn &&
              !["quoted", "delivered", "cancelled"].includes(detail.status) ? (
                <Reassessment
                  detail={detail}
                  offers={orderOptions.filter((o) => o.condition === "used")}
                  disabled={!edit}
                  submit={(trade) =>
                    void act(async () => {
                      await commercialRequest(
                        `/orders/${detail.id}/reassess`,
                        "POST",
                        trade,
                      );
                    })
                  }
                />
              ) : null}
              <h4>Histórico salvo</h4>
              {detail.events?.map((e) => (
                <p key={e.id}>
                  {new Date(e.created_at).toLocaleString("pt-BR")} —{" "}
                  {statuses[e.action] || e.action}
                </p>
              ))}
              {detail.payments?.map((p) => (
                <p key={p.id}>
                  {p.kind === "refund" ? "Devolução" : "Recebimento"}:{" "}
                  {money(p.amount)} — {p.method}
                </p>
              ))}
            </article>
          ) : null}
        </>
      ) : null}
      {!settingsOnly && state.profile?.enabled && tab === "agenda" ? (
        <article className="admin-card">
          <h3>Agenda de recebimentos e reposição</h3>
          <p>
            Dias planejados:{" "}
            {profile.receiptDays
              .map((d) => ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d])
              .join(", ")}{" "}
            · chegada {profile.arrivalTime} · corte {profile.cutoffTime}.
          </p>
          <p className="empty">
            A previsão é confirmada por remessa. Saldo em trânsito não fica
            disponível. Use estoque mínimo e o saldo físico para cobrir
            segunda-feira ou dias sem recebimento.
          </p>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Aparelho / cliente</th>
                  <th>Previsão</th>
                  <th>Origem / transporte</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {state.orders
                  .filter((o) =>
                    ["purchased", "in_transit", "received"].includes(o.status),
                  )
                  .sort((a, b) =>
                    (a.details.expectedAt || "").localeCompare(
                      b.details.expectedAt || "",
                    ),
                  )
                  .map((o) => (
                    <tr key={o.id}>
                      <td>
                        {o.details.offer.model} ·{" "}
                        {
                          state.customers.find((c) => c.id === o.customer_id)
                            ?.name
                        }
                      </td>
                      <td>
                        {o.details.expectedAt
                          ? new Date(o.details.expectedAt).toLocaleString(
                              "pt-BR",
                            )
                          : "A confirmar"}
                      </td>
                      <td>
                        {o.details.route}
                        <br />
                        {o.details.tracking || "Sem rastreio"}
                      </td>
                      <td>{statuses[o.status]}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Link to="/erp/balanco">Conferir estoque mínimo e disponível</Link>
        </article>
      ) : null}
      {!settingsOnly && state.profile?.enabled && tab === "catalog" ? (
        <article className="admin-card">
          <h3>Tabela comercial para WhatsApp</h3>
          <p className="empty">
            Gerada pelo banco com ofertas atuais e saldo físico disponível, sem
            fornecedor nem percentuais internos. Confira os alertas antes de
            copiar.
          </p>
          <button
            className="btn btn--primary"
            disabled={busy || !state.profile.catalog}
            onClick={() =>
              void act(async () => {
                setCatalog(await commercialRequest("/catalog"));
              }, false)
            }
          >
            Gerar tabela atual
          </button>
          {catalog ? (
            <>
              {catalog.warnings.map((w, i) => (
                <p className="commercial-error" key={i}>
                  {w}
                </p>
              ))}
              {catalog.conflicts ? (
                <p role="alert">
                  {catalog.conflicts} variante(s) com divergência foram
                  bloqueadas.
                </p>
              ) : null}
              <textarea
                aria-label="Tabela comercial para copiar"
                readOnly
                rows={20}
                value={catalog.text}
              />
              <button
                className="btn btn--ghost"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(catalog.text)
                    .then(() => setNotice("Tabela copiada."))
                    .catch(() =>
                      setError("Selecione o texto e copie manualmente."),
                    )
                }
              >
                Copiar tabela
              </button>
            </>
          ) : null}
        </article>
      ) : null}
    </div>
  );
}

function TradeForm({
  trade,
  offers,
  setTrade,
}: {
  trade: NonNullable<CommercialOrderInput["tradeIn"]>;
  offers: CommercialOffer[];
  setTrade: (t: NonNullable<CommercialOrderInput["tradeIn"]>) => void;
}) {
  return (
    <div className="commercial-trade">
      <h4>Avaliação individual do usado</h4>
      <div className="commercial-form">
        <AdminPicker
          label="Referência de mercado: variante equivalente"
          value={trade.referenceOfferId}
          options={offers.map((o) => ({
            value: o.id!,
            label: `${o.model} ${o.capacity} ${o.color} ${o.configuration} · ${money(o.cost)}`,
          }))}
          onChange={(v) =>
            setTrade({
              ...trade,
              referenceOfferId: v,
              deviceName:
                offers.find((o) => o.id === v)?.model || trade.deviceName,
            })
          }
        />
        <Field label="Modelo entregue">
          <input
            required
            value={trade.deviceName}
            onChange={(e) => setTrade({ ...trade, deviceName: e.target.value })}
          />
        </Field>
        <Field label="IMEI do usado">
          <input
            required
            value={trade.imei}
            onChange={(e) => setTrade({ ...trade, imei: e.target.value })}
          />
        </Field>
        <Field label="Oferta da loja pelo usado (R$)">
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            value={trade.offerValue}
            onChange={(e) =>
              setTrade({ ...trade, offerValue: Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Saúde da bateria (%) — deixe vazio se desconhecida">
          <input
            type="number"
            min="0"
            max="100"
            value={trade.assessment.batteryHealth ?? ""}
            onChange={(e) =>
              setTrade({
                ...trade,
                assessment: {
                  ...trade.assessment,
                  batteryHealth:
                    e.target.value === "" ? null : Number(e.target.value),
                },
              })
            }
          />
        </Field>
        {Object.entries(checklist).map(([k, label]) => (
          <AdminPicker
            key={k}
            label={label}
            value={String(trade.assessment[k as keyof Assessment])}
            options={[
              { value: "unknown", label: "Não avaliado / não aplicável" },
              { value: "ok", label: "Conferido / sem ressalva" },
              { value: "defect", label: "Com ressalva / defeito" },
            ]}
            onChange={(v) =>
              setTrade({
                ...trade,
                assessment: { ...trade.assessment, [k]: v },
              })
            }
          />
        ))}
        <Field label="Avarias, defeitos e possibilidade de revenda">
          <textarea
            value={trade.assessment.notes}
            onChange={(e) =>
              setTrade({
                ...trade,
                assessment: { ...trade.assessment, notes: e.target.value },
              })
            }
          />
        </Field>
        <Field label="Data da avaliação">
          <input
            type="datetime-local"
            required
            value={localDate(trade.assessment.assessedAt)}
            onChange={(e) =>
              setTrade({
                ...trade,
                assessment: {
                  ...trade.assessment,
                  assessedAt: isoDate(e.target.value),
                },
              })
            }
          />
        </Field>
        <p className="empty">
          Referência de mercado não é oferta. A oferta é manual e deve ser menor
          que a referência. Não atribua defeitos ou mau uso sem avaliação
          técnica.
        </p>
      </div>
    </div>
  );
}
function Reassessment({
  detail,
  offers,
  disabled,
  submit,
}: {
  detail: CommercialOrder;
  offers: CommercialOffer[];
  disabled: boolean;
  submit: (trade: NonNullable<CommercialOrderInput["tradeIn"]>) => void;
}) {
  const [trade, setTrade] = useState(() => detail.details.tradeIn!);
  useEffect(() => setTrade(detail.details.tradeIn!), [detail.id]);
  return (
    <fieldset disabled={disabled}>
      <TradeForm trade={trade} offers={offers} setTrade={setTrade} />
      <button
        className="btn btn--ghost"
        onClick={() =>
          submit({
            referenceOfferId: trade.referenceOfferId,
            deviceName: trade.deviceName,
            imei: trade.imei,
            offerValue: trade.offerValue,
            assessment: trade.assessment,
          })
        }
      >
        Salvar reavaliação e recalcular diferença
      </button>
    </fieldset>
  );
}
