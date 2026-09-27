import { useEffect, useMemo, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import {
  confirmDelete,
  CrudListBar,
  CrudNameButton,
  CrudRowActions,
  crudFormTitle,
  matchesQuery,
  matchesStatus,
  type CrudStatusFilter,
} from '../../components/CrudKit';
import {
  HeadingCancelButton,
  HeadingEditButton,
  HeadingNewButton,
  HeadingSaveButton,
  PageHeadingActions,
} from '../../components/PageHeadingActions';
import { getAdminState } from '../../data/adminStore';
import { listSuppliers } from '../../data/erpRegistry';
import {
  listPromoCampaigns,
  PROMO_EVENT,
  PROMO_KIND_LABEL,
  removePromoCampaign,
  upsertPromoCampaign,
  type PromoCampaign,
  type PromoKind,
  type PromoTier,
} from '../../data/promoCampaignStore';
import './promoCampaigns.css';

const PROMO_KIND_SHORT_LABEL: Record<PromoKind, string> = {
  percent: '% Desconto',
  fixed: 'R$ OFF Fixo',
  promo_price: 'Preço Especial',
  tier: 'Faixas de Volume',
  buy_x_pay_y: 'Leve X Pague Y',
  gift: 'Brinde por Volume',
};

function formatDateBr(iso?: string) {
  if (!iso) return '';
  try {
    const [y, m, d] = iso.slice(0, 10).split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  } catch {
    return iso;
  }
}

type Mode = 'new' | 'edit' | 'view';

type FormState = {
  name: string;
  active: boolean;
  kind: PromoKind;
  discountPercent: number;
  discountAmount: number;
  promoPrice: number;
  tiersText: string;
  buyQty: number;
  payQty: number;
  giftStockId: string;
  giftMinQty: number;
  supplierId: string;
  category: string;
  brand: string;
  stockIds: string[];
  minQty: number;
  customerGroup: string;
  startDate: string;
  endDate: string;
  priority: number;
  accumulative: boolean;
  note: string;
};

function tiersToText(tiers: PromoTier[]) {
  return tiers.map((tier) => `${tier.qty}=${tier.totalPrice}`).join('\n');
}

function parseTiersText(raw: string): PromoTier[] {
  return raw
    .split(/\n|;|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = line.match(/^(\d+(?:[.,]\d+)?)\s*[=:]\s*(\d+(?:[.,]\d+)?)$/);
      if (!match) return [];
      return [
        {
          qty: Number(match[1].replace(',', '.')),
          totalPrice: Number(match[2].replace(',', '.')),
        },
      ];
    })
    .filter((tier) => tier.qty > 0);
}

function emptyForm(): FormState {
  return {
    name: '',
    active: true,
    kind: 'percent',
    discountPercent: 10,
    discountAmount: 5,
    promoPrice: 0,
    tiersText: '3=10\n6=18',
    buyQty: 3,
    payQty: 2,
    giftStockId: '',
    giftMinQty: 10,
    supplierId: '',
    category: '',
    brand: '',
    stockIds: [],
    minQty: 1,
    customerGroup: '',
    startDate: '',
    endDate: '',
    priority: 1,
    accumulative: false,
    note: '',
  };
}

export function PromoCampaignsPage() {
  const stock = useMemo(() => getAdminState().stock, []);
  const suppliers = useMemo(() => listSuppliers(), []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    stock.forEach((s) => {
      if (s.attrs?.categoria) set.add(s.attrs.categoria);
      if (s.kind) set.add(s.kind);
    });
    return Array.from(set).filter(Boolean).sort();
  }, [stock]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    stock.forEach((s) => {
      if (s.attrs?.marca) set.add(s.attrs.marca);
    });
    return Array.from(set).filter(Boolean).sort();
  }, [stock]);

  const [items, setItems] = useState(() => listPromoCampaigns());
  const [form, setForm] = useState<FormState>(emptyForm);
  const [mode, setMode] = useState<Mode>('new');
  const [formVisible, setFormVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CrudStatusFilter>('all');
  const [error, setError] = useState('');
  const [stockPick, setStockPick] = useState('');

  useEffect(() => {
    function refresh() {
      setItems(listPromoCampaigns());
    }
    window.addEventListener(PROMO_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(PROMO_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          matchesStatus(item.active, status) &&
          matchesQuery(
            `${item.name} ${item.note} ${PROMO_KIND_LABEL[item.kind] || ''} ${item.criteria?.category || ''} ${item.criteria?.brand || ''}`,
            query,
          ),
      ),
    [items, query, status],
  );

  const readOnly = mode === 'view';

  function resetForm() {
    setForm(emptyForm());
    setSelectedId(null);
    setMode('new');
    setStockPick('');
    setError('');
  }

  function closeForm() {
    resetForm();
    setFormVisible(false);
  }

  function startNew() {
    resetForm();
    setFormVisible(true);
  }

  function loadItem(item: PromoCampaign, nextMode: Mode) {
    setSelectedId(item.id);
    setMode(nextMode);
    setFormVisible(true);
    setForm({
      name: item.name,
      active: item.active,
      kind: item.kind,
      discountPercent: item.discountPercent || 10,
      discountAmount: item.discountAmount || 5,
      promoPrice: item.promoPrice || 0,
      tiersText: tiersToText(item.tiers) || '1=4\n3=10',
      buyQty: item.buyQty || 3,
      payQty: item.payQty || 2,
      giftStockId: item.giftStockId || '',
      giftMinQty: item.giftMinQty || 10,
      supplierId: item.criteria?.supplierId || '',
      category: item.criteria?.category || '',
      brand: item.criteria?.brand || '',
      stockIds: [...(item.criteria?.stockIds || item.stockIds || [])],
      minQty: item.criteria?.minQty || 1,
      customerGroup: item.criteria?.customerGroup || '',
      startDate: item.startDate ? item.startDate.slice(0, 10) : '',
      endDate: item.endDate ? item.endDate.slice(0, 10) : '',
      priority: typeof item.priority === 'number' ? item.priority : 1,
      accumulative: Boolean(item.accumulative),
      note: item.note || '',
    });
    setError('');
  }

  function duplicateItem(item: PromoCampaign) {
    loadItem(item, 'new');
    setSelectedId(null);
    setForm((prev) => ({
      ...prev,
      name: `${item.name} (Cópia)`,
    }));
  }

  function save() {
    setError('');
    if (!form.name.trim()) {
      setError('Informe o nome da campanha comercial.');
      return;
    }
    const tiers = form.kind === 'tier' ? parseTiersText(form.tiersText) : [];
    if (form.kind === 'tier' && tiers.length === 0) {
      setError('Informe ao menos uma faixa no formato quantidade=preço (ex: 3=10 para levar 3 por R$ 10,00).');
      return;
    }
    if (form.kind === 'gift' && !form.giftStockId) {
      setError('Selecione o produto brinde.');
      return;
    }
    if (form.kind === 'percent' && (!form.discountPercent || form.discountPercent <= 0)) {
      setError('Informe um percentual de desconto válido maior que zero.');
      return;
    }
    if (form.kind === 'fixed' && (!form.discountAmount || form.discountAmount <= 0)) {
      setError('Informe um valor de desconto fixo maior que zero.');
      return;
    }
    if (form.kind === 'promo_price' && (!form.promoPrice || form.promoPrice <= 0)) {
      setError('Informe um preço promocional válido maior que zero.');
      return;
    }
    if (form.kind === 'buy_x_pay_y' && (form.buyQty <= form.payQty || form.payQty <= 0)) {
      setError('No Leve X Pague Y, a quantidade de compra (X) deve ser maior que a paga (Y).');
      return;
    }
    const requiresTarget = ['tier', 'promo_price', 'buy_x_pay_y', 'gift'].includes(form.kind);
    const hasTarget = form.stockIds.length > 0 || Boolean(form.supplierId) || Boolean(form.category.trim()) || Boolean(form.brand.trim());
    if (requiresTarget && !hasTarget) {
      setError('Para promoções com Preço Fixo, Faixas de Volume, Leve X Pague Y ou Brinde, é obrigatório vincular ao menos um produto, fornecedor, categoria ou marca para proteger os preços da loja.');
      return;
    }

    if (form.kind === 'tier' && form.stockIds.length > 0) {
      const selectedProducts = stock.filter((s) => form.stockIds.includes(s.id));
      const problematicTiers = tiers.filter((t) =>
        selectedProducts.length > 0 && selectedProducts.every((p) => p.price > 0 && t.totalPrice >= Math.round(t.qty * p.price * 100) / 100),
      );
      if (problematicTiers.length > 0) {
        const example = problematicTiers[0];
        const prod = selectedProducts[0];
        const normalTotal = (example.qty * prod.price).toFixed(2);
        setError(
          `A faixa ${example.qty} un. por R$ ${example.totalPrice.toFixed(2)} encarece o produto ${prod.name} (preço normal R$ ${prod.price.toFixed(2)} x ${example.qty} = R$ ${normalTotal}). Ajuste o valor da faixa para conceder desconto real.`,
        );
        return;
      }
    }

    upsertPromoCampaign({
      id: mode === 'edit' && selectedId ? selectedId : undefined,
      name: form.name.trim(),
      active: form.active,
      kind: form.kind,
      criteria: {
        supplierId: form.supplierId || undefined,
        category: form.category.trim() || undefined,
        brand: form.brand.trim() || undefined,
        stockIds: form.stockIds,
        minQty: form.minQty > 1 ? form.minQty : undefined,
        customerGroup: form.customerGroup.trim() || undefined,
      },
      discountPercent: form.kind === 'percent' ? Number(form.discountPercent) : undefined,
      discountAmount: form.kind === 'fixed' ? Number(form.discountAmount) : undefined,
      promoPrice: form.kind === 'promo_price' ? Number(form.promoPrice) : undefined,
      tiers,
      buyQty: form.kind === 'buy_x_pay_y' ? Number(form.buyQty) : undefined,
      payQty: form.kind === 'buy_x_pay_y' ? Number(form.payQty) : undefined,
      giftStockId: form.kind === 'gift' ? form.giftStockId : '',
      giftMinQty: form.kind === 'gift' ? Number(form.giftMinQty) : 1,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      priority: Number(form.priority) || 1,
      accumulative: form.accumulative,
      stockIds: form.stockIds,
      note: form.note.trim(),
    });

    setItems(listPromoCampaigns());
    resetForm();
    setFormVisible(false);
  }

  function remove(item: PromoCampaign) {
    if (!confirmDelete(`a campanha comercial "${item.name}"`)) return;
    removePromoCampaign(item.id);
    setItems(listPromoCampaigns());
    if (selectedId === item.id) closeForm();
  }

  function addStock(id: string) {
    if (!id || form.stockIds.includes(id)) return;
    setForm({ ...form, stockIds: [...form.stockIds, id] });
    setStockPick('');
  }

  const stockLabel = (id: string) => stock.find((row) => row.id === id)?.name ?? id;

  function renderRuleSummary(item: PromoCampaign) {
    switch (item.kind) {
      case 'percent':
        return `${item.discountPercent}% OFF`;
      case 'fixed':
        return `R$ ${item.discountAmount?.toFixed(2).replace('.', ',')} OFF / un`;
      case 'promo_price':
        return `Preço R$ ${item.promoPrice?.toFixed(2).replace('.', ',')}`;
      case 'buy_x_pay_y':
        return `Leve ${item.buyQty} Pague ${item.payQty}`;
      case 'tier':
        return item.tiers.map((tier) => `${tier.qty} un = R$ ${tier.totalPrice.toFixed(2).replace('.', ',')}`).join(' · ') || '—';
      case 'gift':
        return `≥${item.giftMinQty} un → Brinde`;
      default:
        return '—';
    }
  }

  function renderTargetSummary(item: PromoCampaign) {
    const parts: string[] = [];
    if (item.criteria?.supplierId) {
      const sup = suppliers.find((s) => s.id === item.criteria.supplierId);
      parts.push(`Fornecedor: ${sup ? sup.name : item.criteria.supplierId}`);
    }
    if (item.criteria?.category) parts.push(`Cat: ${item.criteria.category}`);
    if (item.criteria?.brand) parts.push(`Marca: ${item.criteria.brand}`);
    if (item.stockIds && item.stockIds.length > 0) parts.push(`${item.stockIds.length} produto(s)`);
    if (item.criteria?.minQty && item.criteria.minQty > 1) parts.push(`Mín: ${item.criteria.minQty} un`);
    if (parts.length === 0) return <span className="promo-target-tag">Geral / Todos</span>;
    return (
      <div className="promo-target-wrap">
        {parts.map((p, idx) => (
          <span key={idx} className="promo-target-tag">{p}</span>
        ))}
      </div>
    );
  }

  useEffect(() => {
    if (!formVisible || readOnly) return;
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [formVisible, readOnly, mode, form, selectedId]);

  const headingActions = (
    <PageHeadingActions>
      {!formVisible ? (
        <HeadingNewButton onClick={startNew} label="Nova campanha comercial" />
      ) : readOnly ? (
        <>
          <HeadingCancelButton onClick={closeForm} label="Fechar" />
          <HeadingEditButton onClick={() => setMode('edit')} />
        </>
      ) : (
        <>
          <HeadingCancelButton onClick={closeForm} />
          <HeadingSaveButton onClick={() => save()} />
        </>
      )}
    </PageHeadingActions>
  );

  return (
    <section className="admin-page">
      {headingActions}

      {!formVisible ? (
        <article className="admin-card">
          <CrudListBar
            query={query}
            onQueryChange={setQuery}
            placeholder="Buscar campanha por nome, regra ou categoria…"
            status={status}
            onStatusChange={setStatus}
          />

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Campanha</th>
                  <th>Tipo</th>
                  <th>Benefício / Regra</th>
                  <th>Alvo / Condição</th>
                  <th>Vigência & Prioridade</th>
                  <th>Status</th>
                  <th className="admin-table__actions" style={{ textAlign: 'center', width: '130px' }}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty">
                      Nenhuma campanha comercial cadastrada.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <CrudNameButton onClick={() => loadItem(item, 'view')}>
                          <strong>{item.name}</strong>
                        </CrudNameButton>
                        {item.note ? <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{item.note}</div> : null}
                      </td>
                      <td>
                        <span className={`promo-kind-badge promo-kind-badge--${item.kind}`}>
                          {PROMO_KIND_SHORT_LABEL[item.kind] || item.kind}
                        </span>
                      </td>
                      <td>
                        <strong className="promo-benefit-val">{renderRuleSummary(item)}</strong>
                      </td>
                      <td>
                        {renderTargetSummary(item)}
                      </td>
                      <td>
                        <div className="promo-validity-wrap">
                          {item.startDate || item.endDate ? (
                            <div className="promo-validity-dates">
                              {item.startDate ? `De ${formatDateBr(item.startDate)}` : ''}{' '}
                              {item.endDate ? `até ${formatDateBr(item.endDate)}` : ''}
                            </div>
                          ) : (
                            <div className="promo-validity-dates" style={{ opacity: 0.75 }}>Sem prazo</div>
                          )}
                          <div className="promo-validity-priority">Prioridade: {item.priority}</div>
                        </div>
                      </td>
                      <td>
                        <span className={`promo-status-badge promo-status-badge--${item.active ? 'active' : 'inactive'}`}>
                          {item.active ? 'Ativa no PDV' : 'Inativa'}
                        </span>
                      </td>
                      <td className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
                        <CrudRowActions
                          onView={() => loadItem(item, 'view')}
                          onEdit={() => loadItem(item, 'edit')}
                          onDuplicate={() => duplicateItem(item)}
                          onDelete={() => remove(item)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {formVisible ? (
        <article className={`admin-card ${readOnly ? 'is-readonly' : ''}`}>
          <h2>{crudFormTitle(mode, 'campanha comercial')}</h2>
          {error ? <p className="qty-low" style={{ color: '#ef4444', fontWeight: 600 }}>{error}</p> : null}

          <p className="empty" style={{ margin: '0 0 16px' }}>
            Configure regras flexíveis de desconto comercial (por volume, fornecedor, categoria, % OFF, R$ OFF ou brinde).
            No PDV e no Orçamento, o Marthi avalia e aplica o benefício automaticamente com transparência total.
          </p>

          <div className="admin-form">
            <label className="span-2">
              Nome da Campanha
              <input
                value={form.name}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Cimento 50+ un. R$ 34,50 / Black Friday Tigre 15% OFF"
              />
            </label>

            <AdminPicker
              label="Tipo de Promoção / Benefício"
              value={form.kind}
              disabled={readOnly}
              options={[
                { value: 'percent', label: PROMO_KIND_LABEL.percent },
                { value: 'fixed', label: PROMO_KIND_LABEL.fixed },
                { value: 'promo_price', label: PROMO_KIND_LABEL.promo_price },
                { value: 'tier', label: PROMO_KIND_LABEL.tier },
                { value: 'buy_x_pay_y', label: PROMO_KIND_LABEL.buy_x_pay_y },
                { value: 'gift', label: PROMO_KIND_LABEL.gift },
              ]}
              onChange={(value) => setForm({ ...form, kind: value as PromoKind })}
            />

            <AdminPicker
              label="Situação no PDV & Orçamentos"
              value={form.active ? '1' : '0'}
              disabled={readOnly}
              options={[
                { value: '1', label: 'Ativa (aplicação automática)' },
                { value: '0', label: 'Inativa (pausada)' },
              ]}
              onChange={(value) => setForm({ ...form, active: value === '1' })}
            />

            {/* BENEFÍCIOS ESPECÍFICOS */}
            {form.kind === 'percent' ? (
              <label>
                Percentual de Desconto (% OFF)
                <input
                  type="number"
                  min={0.1}
                  max={100}
                  step={0.1}
                  disabled={readOnly}
                  value={form.discountPercent}
                  onChange={(e) => setForm({ ...form, discountPercent: Number(e.target.value) })}
                  placeholder="Ex: 10 para 10% OFF"
                />
              </label>
            ) : null}

            {form.kind === 'fixed' ? (
              <label>
                Desconto em Valor Fixo (R$ OFF por unidade)
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  disabled={readOnly}
                  value={form.discountAmount}
                  onChange={(e) => setForm({ ...form, discountAmount: Number(e.target.value) })}
                  placeholder="Ex: 5.00 para R$ 5,00 OFF"
                />
              </label>
            ) : null}

            {form.kind === 'promo_price' ? (
              <label>
                Preço Promocional Fixo (R$)
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  disabled={readOnly}
                  value={form.promoPrice}
                  onChange={(e) => setForm({ ...form, promoPrice: Number(e.target.value) })}
                  placeholder="Ex: 34.50"
                />
              </label>
            ) : null}

            {form.kind === 'buy_x_pay_y' ? (
              <>
                <label>
                  Leve Quantidade (X)
                  <input
                    type="number"
                    min={2}
                    disabled={readOnly}
                    value={form.buyQty}
                    onChange={(e) => setForm({ ...form, buyQty: Number(e.target.value) })}
                    placeholder="Ex: 3"
                  />
                </label>
                <label>
                  Pague Quantidade (Y)
                  <input
                    type="number"
                    min={1}
                    disabled={readOnly}
                    value={form.payQty}
                    onChange={(e) => setForm({ ...form, payQty: Number(e.target.value) })}
                    placeholder="Ex: 2"
                  />
                </label>
              </>
            ) : null}

            {form.kind === 'tier' ? (
              <label className="span-2">
                Faixas Progressivas (uma por linha: quantidade=preço total)
                <textarea
                  rows={4}
                  disabled={readOnly}
                  value={form.tiersText}
                  onChange={(e) => setForm({ ...form, tiersText: e.target.value })}
                  placeholder={'3=10\n6=18\n12=32'}
                />
                <small style={{ color: 'var(--muted, #94a3b8)', marginTop: 4, display: 'block' }}>
                  Exemplo: <strong>3=10</strong> significa levar 3 unidades pelo valor total de R$ 10,00 (R$ 3,33/un). A promoção no PDV só é ativada se gerar economia real frente ao preço normal do item. Se o item custar menos (ex: R$ 2,00 x 3 = R$ 6,00), a campanha é ignorada automaticamente para proteger o cliente.
                </small>
              </label>
            ) : null}

            {form.kind === 'gift' ? (
              <>
                <AdminPicker
                  label="Produto Brinde Concedido"
                  value={form.giftStockId}
                  disabled={readOnly}
                  placeholder="Selecionar produto brinde"
                  options={stock.map((item) => ({
                    value: item.id,
                    label: `${item.name} (${item.sku || item.id})`,
                  }))}
                  onChange={(value) => setForm({ ...form, giftStockId: value })}
                />
                <label>
                  Qtd Mínima para Ganhar o Brinde
                  <input
                    type="number"
                    min={1}
                    disabled={readOnly}
                    value={form.giftMinQty}
                    onChange={(e) => setForm({ ...form, giftMinQty: Number(e.target.value) || 1 })}
                  />
                </label>
              </>
            ) : null}

            {/* CRITÉRIOS DE APLICAÇÃO CONDICIONAL */}
            <div className="span-2" style={{ borderTop: '1px solid var(--line, rgba(148, 163, 184, 0.2))', paddingTop: 16, marginTop: 8 }}>
              <h3 className="promo-form-section-title">Condições e Alvo da Promoção</h3>
              <p className="promo-form-section-desc">
                Defina em quais produtos a promoção será ativada. Você pode escolher por Fornecedor, Categoria, Marca ou Produtos específicos.
              </p>
            </div>

            <AdminPicker
              label="Fornecedor Alvo (Opcional)"
              value={form.supplierId}
              disabled={readOnly}
              placeholder="Qualquer fornecedor"
              options={[
                { value: '', label: 'Qualquer fornecedor (Geral)' },
                ...suppliers.map((s) => ({ value: s.id, label: s.name })),
              ]}
              onChange={(value) => setForm({ ...form, supplierId: value })}
            />

            <label>
              Categoria Alvo (Opcional)
              <input
                list="campaign-categories"
                value={form.category}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Ex: Cimento, Tintas, Tubos..."
              />
              <datalist id="campaign-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>

            <label>
              Marca Alvo (Opcional)
              <input
                list="campaign-brands"
                value={form.brand}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="Ex: Tigre, Coral, Votoran..."
              />
              <datalist id="campaign-brands">
                {brands.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </label>

            <label>
              Qtd Mínima do Produto para Disparar
              <input
                type="number"
                min={1}
                disabled={readOnly}
                value={form.minQty}
                onChange={(e) => setForm({ ...form, minQty: Math.max(1, Number(e.target.value) || 1) })}
                placeholder="Padrão: 1"
              />
            </label>

            {/* VIGÊNCIA E PRIORIDADE */}
            <div className="span-2" style={{ borderTop: '1px solid var(--line, rgba(148, 163, 184, 0.2))', paddingTop: 16, marginTop: 8 }}>
              <h3 className="promo-form-section-title">Vigência e Prioridade Comercial</h3>
            </div>

            <label>
              Data de Início da Vigência
              <input
                type="date"
                disabled={readOnly}
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </label>

            <label>
              Data de Término da Vigência
              <input
                type="date"
                disabled={readOnly}
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </label>

            <label>
              Nível de Prioridade (Maior prevalece)
              <input
                type="number"
                min={1}
                max={999}
                disabled={readOnly}
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 1 })}
                placeholder="Padrão: 1"
              />
            </label>

            <AdminPicker
              label="Acúmulo com Outras Promoções"
              value={form.accumulative ? '1' : '0'}
              disabled={readOnly}
              options={[
                { value: '0', label: 'Não acumular (prevalece maior benefício)' },
                { value: '1', label: 'Permitir acúmulo somado' },
              ]}
              onChange={(value) => setForm({ ...form, accumulative: value === '1' })}
            />

            <label className="span-2">
              Observação / Descritivo Comercial
              <input
                value={form.note}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Ex: Campanha de fechamento de trimestre autorizada pela diretoria."
              />
            </label>

            {/* PRODUTOS ESPECÍFICOS */}
            <div className="span-2" style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <strong style={{ color: 'var(--ink, #e8eef4)' }}>
                Vincular Produtos Específicos (Opcional se fornecedor/categoria/marca estiver definido)
              </strong>
              {['tier', 'promo_price', 'buy_x_pay_y', 'gift'].includes(form.kind) &&
              form.stockIds.length === 0 &&
              !form.supplierId &&
              !form.category.trim() &&
              !form.brand.trim() ? (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                  }}
                >
                  ⚠️ Obrigatório: Para campanhas de Faixas, Preço Fixo ou Leve X Pague Y, vincule ao menos um produto abaixo ou defina fornecedor/categoria/marca para evitar atingir produtos não participantes.
                </div>
              ) : null}
              {!readOnly ? (
                <AdminPicker
                  label="Adicionar produto específico à campanha"
                  value={stockPick}
                  placeholder="Selecione um produto para incluir"
                  options={stock
                    .filter((item) => !form.stockIds.includes(item.id))
                    .map((item) => ({
                      value: item.id,
                      label: `${item.name} (${item.sku || item.id}) - R$ ${item.price.toFixed(2)}`,
                    }))}
                  onChange={(value) => addStock(value)}
                />
              ) : null}

              {form.stockIds.length === 0 ? (
                <p className="empty" style={{ margin: '4px 0' }}>
                  {form.supplierId || form.category || form.brand
                    ? 'A regra será aplicada para todos os produtos correspondentes às condições acima.'
                    : 'Nenhum produto individual vinculado ainda.'}
                </p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {form.stockIds.map((id) => (
                    <span key={id} className="promo-stock-item-pill">
                      <span>{stockLabel(id)}</span>
                      {!readOnly ? (
                        <button
                          type="button"
                          className="promo-stock-item-remove"
                          onClick={() =>
                            setForm({
                              ...form,
                              stockIds: form.stockIds.filter((row) => row !== id),
                            })
                          }
                          title="Remover produto"
                        >
                          ×
                        </button>
                      ) : null}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </article>
      ) : null}
    </section>
  );
}
