import './externalSale.css';
import { getActiveStore, getActiveStoreId, STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AdminPicker } from '../../components/AdminPicker';
import {
  apiCreateExternalSale,
  apiGetSaleReceipt,
  apiListCustomers,
  apiListStock,
  type ExternalSaleLine,
  type TradeInPayload,
} from '../../services/erpApi';
import { WarrantyReceiptModal } from '../../components/WarrantyReceiptModal';
import { CashPickupModal } from '../../components/CashPickupModal';
import { DailyPendingModal } from '../../components/DailyPendingModal';

type StockOption = {
  id: string;
  name: string;
  price: number;
  cost: number;
  qty: number;
  imei: string;
  category: string;
};

export function ExternalSalePage() {
  const { user } = useAuth();
  const isPrivileged = user?.role === 'admin' || user?.role === 'superadmin';

  const [storeId, setStoreId] = useState(getActiveStoreId);
  const storeRef = useRef(storeId);
  storeRef.current = storeId;
  const activeStore = getActiveStore();
  useEffect(() => {
    const changed = () => { setStoreId(getActiveStoreId()); setCreatedReceipt(null); setShowPickupModal(false); setShowPendingModal(false); setSavedSaleId(null); requestId.current = crypto.randomUUID(); };
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, changed);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, changed);
  }, []);

  // Estados Base
  const [customers, setCustomers] = useState<any[]>([]);
  const [stockItems, setStockItems] = useState<StockOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Vendedor
  const sellerName = user?.name || '';

  // Cliente
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('Consumidor Final');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerDocument, setCustomerDocument] = useState('');

  // Itens da Venda
  const [lines, setLines] = useState<ExternalSaleLine[]>([
    {
      stockId: '',
      name: '',
      qty: 1,
      unitPrice: 0,
      unitCost: 0,
      discount: 0,
      surcharge: 0,
      imei: '',
    },
  ]);

  // Desconto / Acréscimo Geral
  const [generalDiscount, setGeneralDiscount] = useState(0);
  const [generalSurcharge, setGeneralSurcharge] = useState(0);

  // Upgrade / Trade-in
  const [hasTradeIn, setHasTradeIn] = useState(false);
  const [tradeIn, setTradeIn] = useState<TradeInPayload>({
    deviceName: '',
    imei: '',
    capacity: '',
    color: '',
    conditionState: 'used',
    notes: '',
    tradeValue: 0,
  });

  // Forma de Pagamento e Parcelas
  const [paymentMethod, setPaymentMethod] = useState('Cartão de Crédito');
  const [installments, setInstallments] = useState(1);
  const [warrantyMonths, setWarrantyMonths] = useState(3);
  const [warrantyTerms, setWarrantyTerms] = useState(
    'Garantia legal de 90 dias balcão para defeitos de fabricação. Não cobre choques físicos, quedas ou umidade.',
  );
  const [saleNotes, setSaleNotes] = useState('');

  // Modais de Sucesso, Recolhimento e Pendências
  const requestId = useRef(crypto.randomUUID());
  const [savedSaleId, setSavedSaleId] = useState<string | null>(null);
  const [createdReceipt, setCreatedReceipt] = useState<any>(null);
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError('');
      setCustomers([]);
      setStockItems([]);
      setSelectedCustomerId('');
      setCustomerName('Consumidor Final');
      setCustomerPhone('');
      setCustomerDocument('');
      setLines([{ name: '', qty: 1, unitPrice: 0, stockId: '' }]);
      try {
        const [custRes, stkRes] = await Promise.all([
          apiListCustomers(),
          apiListStock(),
        ]);

        if (storeRef.current !== storeId) return;
        setCustomers(Array.isArray(custRes) ? custRes : []);

        const mappedStock: StockOption[] = (Array.isArray(stkRes) ? stkRes : []).map((it: any) => ({
          id: it.id,
          name: it.name,
          price: Number(it.price) || 0,
          cost: Number(it.cost) || 0,
          qty: Number(it.qty) || 0,
          imei: it.imei || '',
          category: it.category || 'Geral',
        }));

        setStockItems(mappedStock);

        // Se houver produtos no estoque, pré-seleciona o primeiro
        if (mappedStock.length > 0) {
          const first = mappedStock[0];
          setLines([
            {
              stockId: first.id,
              name: first.name,
              qty: 1,
              unitPrice: first.price,
              unitCost: first.cost,
              discount: 0,
              surcharge: 0,
              imei: first.imei,
            },
          ]);
        }
      } catch (err) {
        if (storeRef.current === storeId) setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados da loja.');
      } finally {
        if (storeRef.current === storeId) setLoading(false);
      }
    }
    void loadData();
  }, [storeId, user?.id]);

  function handleSelectCustomer(val: string) {
    setSelectedCustomerId(val);
    if (!val) {
      setCustomerName('Consumidor Final');
      setCustomerPhone('');
      setCustomerDocument('');
      return;
    }
    const found = customers.find((c) => c.id === val);
    if (found) {
      setCustomerName(found.name);
      setCustomerPhone(found.phone || '');
      setCustomerDocument(found.document || '');
    }
  }

  function handleAddLine() {
    setLines((prev) => [
      ...prev,
      {
        stockId: '',
        name: '',
        qty: 1,
        unitPrice: 0,
        unitCost: 0,
        discount: 0,
        surcharge: 0,
        imei: '',
      },
    ]);
  }

  function handleRemoveLine(index: number) {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  function handleLineProductChange(index: number, stockId: string) {
    const prod = stockItems.find((p) => p.id === stockId);
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx !== index) return l;
        if (!prod) return { ...l, stockId: '', name: '', unitPrice: 0, unitCost: 0, imei: '' };
        return {
          ...l,
          stockId: prod.id,
          name: prod.name,
          unitPrice: prod.price,
          unitCost: prod.cost,
          imei: prod.imei || '',
        };
      }),
    );
  }

  function handleLineFieldChange(index: number, field: keyof ExternalSaleLine, val: any) {
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx !== index) return l;
        return { ...l, [field]: val };
      }),
    );
  }

  // Cálculos Financeiros
  const subtotal = useMemo(() => {
    return lines.reduce((sum, l) => sum + (Number(l.qty) || 1) * (Number(l.unitPrice) || 0), 0);
  }, [lines]);

  const totalCost = useMemo(() => {
    return lines.reduce((sum, l) => sum + (Number(l.qty) || 1) * (Number(l.unitCost) || 0), 0);
  }, [lines]);

  const grossTotal = Math.max(0, subtotal - Number(generalDiscount || 0) + Number(generalSurcharge || 0));
  const tradeInCredit = hasTradeIn ? Number(tradeIn.tradeValue || 0) : 0;
  const netAmountToPay = Math.max(0, Math.round((grossTotal - tradeInCredit) * 100) / 100);

  const grossProfit = Math.round((grossTotal - totalCost) * 100) / 100;
  const marginPercent = grossTotal > 0 ? Math.round((grossProfit / grossTotal) * 10000) / 100 : 0;
  const installmentValue = installments > 0 ? Math.round((netAmountToPay / installments) * 100) / 100 : netAmountToPay;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || loading || storeRef.current !== getActiveStoreId()) { setError('Aguarde o carregamento da loja ativa.'); return; }
    if (lines.length === 0 || lines.some(line => !line.stockId || !line.name || Number(line.qty) <= 0)) {
      setError('Adicione ao menos um produto válido na venda.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const payload = {
        customerId: selectedCustomerId || null,
        customerName: customerName.trim() || 'Consumidor Final',
        customerPhone: customerPhone.trim(),
        customerDocument: customerDocument.trim(),
        sellerId: null,
        sellerName: sellerName.trim(),
        paymentMethod,
        installments: Number(installments) || 1,
        discount: Number(generalDiscount) || 0,
        surcharge: Number(generalSurcharge) || 0,
        notes: saleNotes.trim(),
        warrantyMonths: Number(warrantyMonths),
        warrantyTerms: warrantyTerms.trim(),
        lines: lines.map((l) => ({
          stockId: l.stockId || null,
          name: l.name.trim(),
          qty: Number(l.qty) || 1,
          unitPrice: Number(l.unitPrice) || 0,
          unitCost: Number(l.unitCost) || 0,
          imei: l.imei || '',
        })),
        tradeIn: hasTradeIn && tradeIn.tradeValue > 0 ? tradeIn : null,
      };

      const result = await apiCreateExternalSale({...payload, requestId: requestId.current}, storeId);
      if (!result?.id) throw new Error('A API não confirmou a gravação da venda.');
      if (storeRef.current === storeId) setSavedSaleId(result.id);
      // Never reconstruct the receipt from browser caches or fixed company data.
      try {
        const receipt = await apiGetSaleReceipt(result.id, storeId);
        if (storeRef.current === storeId) setCreatedReceipt(receipt);
      } catch {
        if (storeRef.current === storeId) setError('Venda ' + result.id + ' salva. O comprovante não carregou; consulte a venda antes de tentar novamente.');
      }
      const refreshed = await apiListStock().catch(() => null);
      if (refreshed && storeRef.current === storeId) setStockItems(refreshed.map((it: any) => ({ ...it, qty: Number(it.qty), price: Number(it.price), cost: Number(it.cost) })));
    } catch (err: any) {
      setError(err.message || 'Falha ao processar venda externa.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleResetForm() {
    requestId.current = crypto.randomUUID();
    setSavedSaleId(null);
    setLines([
      {
        stockId: stockItems[0]?.id || '',
        name: stockItems[0]?.name || '',
        qty: 1,
        unitPrice: stockItems[0]?.price || 0,
        unitCost: stockItems[0]?.cost || 0,
        discount: 0,
        surcharge: 0,
        imei: stockItems[0]?.imei || '',
      },
    ]);
    setSelectedCustomerId('');
    setCustomerName('Consumidor Final');
    setCustomerPhone('');
    setCustomerDocument('');
    setGeneralDiscount(0);
    setGeneralSurcharge(0);
    setHasTradeIn(false);
    setTradeIn({
      deviceName: '',
      imei: '',
      capacity: '',
      color: '',
      conditionState: 'used',
      notes: '',
      tradeValue: 0,
    });
    setPaymentMethod('Cartão de Crédito');
    setInstallments(1);
    setCreatedReceipt(null);
  }

  return (
    <div className="admin-page external-sale-page" style={{ padding: '16px 20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Cabeçalho da Página */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>⚡</span>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--ink)' }}>
              Venda Externa / Venda sem Caixa
            </h1>
            <span className="admin-badge admin-badge--active" style={{ fontSize: '0.75rem' }}>
              {activeStore?.tradeName || 'Loja ativa'}
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--mute)' }}>
            Venda ágil e direta sem exigência de abertura de caixa físico. Integração em tempo real com estoque, financeiro e metas.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            style={{ fontSize: '0.84rem' }}
            onClick={() => setShowPendingModal(true)}
          >
            📋 Pendências do Dia
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            style={{ fontSize: '0.84rem' }}
            onClick={() => setShowPickupModal(true)}
          >
            💰 Recolhimento de valores
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#f87171',
            border: '1px solid #ef4444',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div style={{ color: 'var(--mute, #94a3b8)', fontSize: '0.85rem', marginBottom: '12px' }}>
          ⏳ Carregando catálogo e clientes...
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '16px', marginBottom: '16px' }}>
          {/* Card 1: Identificação da Operação (Vendedora & Cliente) */}
          <div
            style={{
              background: 'var(--card, #171e27)',
              border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
              borderRadius: '10px',
              padding: '16px',
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>
              👤 Vendedor & Cliente
            </h3>

            <div style={{ marginBottom: '12px' }}>
              <label className="admin-label">Vendedor responsável</label>
              <input
                type="text"
                className="admin-input"
                value={sellerName}
                readOnly
                placeholder="Nome do responsável pela venda"
                required
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <AdminPicker
                label="Selecionar Cliente Cadastrado"
                value={selectedCustomerId}
                options={[
                  { value: '', label: 'Consumidor Final (Sem Cadastro)' },
                  ...customers.map((c) => ({
                    value: c.id,
                    label: `${c.name} ${c.phone ? `· ${c.phone}` : ''}`,
                  })),
                ]}
                onChange={handleSelectCustomer}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="admin-label">Nome do Cliente</label>
                <input
                  type="text"
                  className="admin-input"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nome do cliente"
                  required
                />
              </div>
              <div>
                <label className="admin-label">WhatsApp / Telefone</label>
                <input
                  type="text"
                  className="admin-input"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="DDD e número de telefone"
                />
              </div>
            </div>

            <div style={{ marginTop: '10px' }}>
              <label className="admin-label">CPF (Opcional para recibo)</label>
              <input
                type="text"
                className="admin-input"
                value={customerDocument}
                onChange={(e) => setCustomerDocument(e.target.value)}
                placeholder="000.000.000-00"
              />
            </div>
          </div>

          {/* Card 2: Pagamento & Condições */}
          <div
            style={{
              background: 'var(--card, #171e27)',
              border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
              borderRadius: '10px',
              padding: '16px',
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>
              💳 Forma de Pagamento
            </h3>

            <div style={{ marginBottom: '12px' }}>
              <AdminPicker
                label="Meio de Pagamento"
                value={paymentMethod}
                options={[
                  { value: 'Cartão de Crédito', label: 'Cartão de Crédito' },
                  { value: 'Cartão de Débito', label: 'Cartão de Débito' },
                  { value: 'PIX', label: 'PIX (Chave da Loja)' },
                  { value: 'Dinheiro', label: 'Dinheiro em Espécie (Sem Caixa)' },
                  { value: 'Transferência Bancária', label: 'Transferência / TED' },
                ]}
                onChange={(val) => setPaymentMethod(val)}
              />
            </div>

            {paymentMethod === 'Cartão de Crédito' && (
              <div style={{ marginBottom: '12px' }}>
                <AdminPicker
                  label="Parcelamento (Cartão)"
                  value={String(installments)}
                  options={[
                    { value: '1', label: `1x à vista (R$ ${netAmountToPay.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})` },
                    { value: '2', label: `2x de R$ ${(netAmountToPay / 2).toFixed(2)}` },
                    { value: '3', label: `3x de R$ ${(netAmountToPay / 3).toFixed(2)}` },
                    { value: '4', label: `4x de R$ ${(netAmountToPay / 4).toFixed(2)}` },
                    { value: '5', label: `5x de R$ ${(netAmountToPay / 5).toFixed(2)}` },
                    { value: '6', label: `6x de R$ ${(netAmountToPay / 6).toFixed(2)}` },
                    { value: '10', label: `10x de R$ ${(netAmountToPay / 10).toFixed(2)}` },
                    { value: '12', label: `12x de R$ ${(netAmountToPay / 12).toFixed(2)}` },
                  ]}
                  onChange={(val) => setInstallments(Number(val))}
                />
              </div>
            )}

            {paymentMethod === 'Dinheiro' && (
              <div
                style={{
                  background: 'rgba(234, 179, 8, 0.12)',
                  border: '1px solid rgba(234, 179, 8, 0.35)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  fontSize: '0.82rem',
                  color: '#eab308',
                  lineHeight: 1.45,
                  marginBottom: '12px',
                }}
              >
                ⚠️ <strong>Recebimento sem caixa:</strong> Esta venda será registrada no sistema e o dinheiro ficará fisicamente na loja até o recolhimento pelo responsável pelo recolhimento.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="admin-label">Desconto (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="admin-input"
                  value={generalDiscount}
                  onChange={(e) => setGeneralDiscount(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="admin-label">Acréscimo (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="admin-input"
                  value={generalSurcharge}
                  onChange={(e) => setGeneralSurcharge(Number(e.target.value))}
                />
              </div>
            </div>

            <div style={{ marginTop: '10px' }}>
              <label className="admin-label">Garantia (Meses)</label>
              <input
                type="number"
                min="0"
                max="24"
                className="admin-input"
                value={warrantyMonths}
                onChange={(e) => setWarrantyMonths(Number(e.target.value))}
              />
            </div>

            <div style={{ marginTop: '10px' }}>
              <label className="admin-label">Termos de Garantia</label>
              <input
                type="text"
                className="admin-input"
                value={warrantyTerms}
                onChange={(e) => setWarrantyTerms(e.target.value)}
              />
            </div>

            <div style={{ marginTop: '10px' }}>
              <label className="admin-label">Observações da Venda</label>
              <input
                type="text"
                className="admin-input"
                placeholder="Ex: Aparelho entregue com película 3D aplicada"
                value={saleNotes}
                onChange={(e) => setSaleNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Card 3: Produtos da Venda */}
        <div
          style={{
            background: 'var(--card, #171e27)',
            border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>
              📦 Produtos da Venda
            </h3>
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              style={{ fontSize: '0.82rem' }}
              onClick={handleAddLine}
            >
              ➕ Adicionar Outro Produto
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {lines.map((line, idx) => (
              <div
                key={idx}
                style={{
                  background: 'var(--card-2, #1c2430)',
                  border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                  borderRadius: '8px',
                  padding: '12px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr)) 40px',
                  gap: '10px',
                  alignItems: 'end',
                }}
              >
                <div style={{ gridColumn: 'span 2' }}>
                  <AdminPicker
                    label={`Produto #${idx + 1}`}
                    value={line.stockId || ''}
                    options={[
                      { value: '', label: 'Selecione um produto do estoque...' },
                      ...stockItems.map((p) => ({
                        value: p.id,
                        label: `${p.name} · R$ ${p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Disp: ${p.qty})`,
                      })),
                    ]}
                    onChange={(val) => handleLineProductChange(idx, val)}
                  />
                </div>

                <div>
                  <label className="admin-label">Quantidade</label>
                  <input
                    type="number"
                    min="1"
                    className="admin-input"
                    value={line.qty}
                    onChange={(e) => handleLineFieldChange(idx, 'qty', Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="admin-label">Preço de Venda (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="admin-input"
                    value={line.unitPrice}
                    onChange={(e) => handleLineFieldChange(idx, 'unitPrice', Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="admin-label">IMEI (Se aplicável)</label>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="3542..."
                    value={line.imei || ''}
                    onChange={(e) => handleLineFieldChange(idx, 'imei', e.target.value)}
                  />
                </div>

                <div>
                  <button
                    type="button"
                    className="admin-btn admin-btn--icon"
                    onClick={() => handleRemoveLine(idx)}
                    title="Remover Item"
                    style={{ height: '38px', color: '#f87171' }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card 4: UPGRADE / TRADE-IN DE APARELHO USADO */}
        <div
          style={{
            background: hasTradeIn ? 'rgba(45, 212, 191, 0.06)' : 'var(--card, #171e27)',
            border: hasTradeIn
              ? '1.5px solid var(--accent, #2dd4bf)'
              : '1px solid var(--line, rgba(148, 163, 184, 0.22))',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '16px',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>🔄</span>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>
                  Upgrade / Troca de Aparelho Usado
                </h3>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--mute)' }}>
                Use na entrega imediata: ao concluir a venda, o aparelho usado entra no estoque.
                Se o cliente continuar com o usado enquanto aguarda uma encomenda, não finalize a troca nesta tela.
              </p>
            </div>

            <button
              type="button"
              className={hasTradeIn ? 'admin-btn admin-btn--primary' : 'admin-btn admin-btn--secondary'}
              onClick={() => setHasTradeIn(!hasTradeIn)}
              style={{ fontSize: '0.84rem' }}
            >
              {hasTradeIn ? '✓ Upgrade Ativado' : '+ Adicionar Aparelho Usado (Upgrade)'}
            </button>
          </div>

          {hasTradeIn && (
            <div style={{ marginTop: '16px', borderTop: '1px solid var(--line, rgba(148, 163, 184, 0.22))', paddingTop: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="admin-label">Aparelho Entregue pelo Cliente</label>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="Ex: iPhone 15 Pro Max Usado"
                    value={tradeIn.deviceName}
                    onChange={(e) => setTradeIn({ ...tradeIn, deviceName: e.target.value })}
                    required={hasTradeIn}
                  />
                </div>

                <div>
                  <label className="admin-label">IMEI do Aparelho Entregue</label>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="3589..."
                    value={tradeIn.imei}
                    onChange={(e) => setTradeIn({ ...tradeIn, imei: e.target.value })}
                  />
                </div>

                <div>
                  <AdminPicker
                    label="Capacidade"
                    value={tradeIn.capacity || ''}
                    options={[
                      { value: '64GB', label: '64 GB' },
                      { value: '128GB', label: '128 GB' },
                      { value: '256GB', label: '256 GB' },
                      { value: '512GB', label: '512 GB' },
                      { value: '1TB', label: '1 TB' },
                    ]}
                    onChange={(val) => setTradeIn({ ...tradeIn, capacity: val })}
                  />
                </div>

                <div>
                  <label className="admin-label">Cor</label>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="Cor do aparelho recebido"
                    value={tradeIn.color}
                    onChange={(e) => setTradeIn({ ...tradeIn, color: e.target.value })}
                  />
                </div>

                <div>
                  <AdminPicker
                    label="Estado de Conservação"
                    value={tradeIn.conditionState || 'used'}
                    options={[
                      { value: 'used', label: 'Usado - Excelente Estado' },
                      { value: 'refurbished', label: 'Recondicionado / Marcas de Uso' },
                      { value: 'damaged', label: 'Avariado / Peças' },
                    ]}
                    onChange={(val: any) => setTradeIn({ ...tradeIn, conditionState: val })}
                  />
                </div>

                <div>
                  <label className="admin-label" style={{ color: 'var(--accent, #2dd4bf)', fontWeight: 700 }}>
                    Oferta acordada pelo usado / crédito (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="admin-input"
                    style={{ borderColor: 'var(--accent, #2dd4bf)', fontWeight: 700 }}
                    placeholder="Ex: 4000,00"
                    value={tradeIn.tradeValue || ''}
                    onChange={(e) => setTradeIn({ ...tradeIn, tradeValue: Number(e.target.value) })}
                    required={hasTradeIn}
                  />
                  <p className="empty">
                    Informe a oferta após a avaliação. O preço de um aparelho equivalente no mercado
                    é uma referência e não define automaticamente o crédito da troca.
                  </p>
                </div>
              </div>

              {/* CARD DE DEMONSTRAÇÃO DO UPGRADE */}
              <div
                style={{
                  marginTop: '16px',
                  background: 'var(--card-2, #1c2430)',
                  border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                  borderRadius: '8px',
                  padding: '14px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '12px',
                }}
              >
                <div>
                  <small style={{ color: 'var(--mute)' }}>Valor do Produto Novo:</small>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                    R$ {grossTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <small style={{ color: 'var(--mute)' }}>Crédito do Aparelho Usado:</small>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent, #2dd4bf)' }}>
                    - R$ {tradeInCredit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <small style={{ color: 'var(--mute)' }}>Saldo Efetivo a Pagar:</small>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent, #2dd4bf)' }}>
                    R$ {netAmountToPay.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Card 5: RESUMO FINANCEIRO, CUSTO, LUCRO E FINALIZAÇÃO */}
        <div
          style={{
            background: 'var(--card, #171e27)',
            border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '0.78rem', color: 'var(--mute)', textTransform: 'uppercase' }}>
                Resumo da Venda
              </span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent, #2dd4bf)', marginTop: '2px' }}>
                R$ {netAmountToPay.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.84rem', color: 'var(--mute)', marginTop: '2px' }}>
                {paymentMethod} {installments > 1 ? `· ${installments}x de R$ ${installmentValue.toFixed(2)}` : 'à vista'}
              </div>
            </div>

            {/* ÁREA CONFIDENCIAL DE CUSTO E LUCRO (VISÍVEL APENAS PARA PRIVILEGIADOS) */}
            {isPrivileged && (
              <div
                style={{
                  background: 'rgba(234, 179, 8, 0.08)',
                  border: '1px solid rgba(234, 179, 8, 0.25)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.9rem' }}>🔒</span>
                  <strong style={{ fontSize: '0.82rem', color: '#eab308' }}>
                    Informações Internas (Confidencial)
                  </strong>
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: 'var(--mute)' }}>Custo:</span>{' '}
                    <strong>R$ {totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--mute)' }}>Lucro:</span>{' '}
                    <strong style={{ color: '#4ade80' }}>
                      R$ {grossProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--mute)' }}>Margem:</span>{' '}
                    <strong style={{ color: '#4ade80' }}>{marginPercent}%</strong>
                  </div>
                </div>
                <small style={{ color: 'var(--mute)', display: 'block', marginTop: '2px', fontSize: '0.72rem' }}>
                  Nunca exibido no comprovante ou mensagem do cliente.
                </small>
              </div>
            )}

            <div style={{ textAlign: 'right' }}>
              <button
                type="submit"
                className="admin-btn admin-btn--primary"
                style={{
                  padding: '14px 28px',
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  width: '100%',
                  maxWidth: '280px',
                }}
                disabled={submitting || loading || !storeId || Boolean(savedSaleId)}
              >
                {submitting ? 'Gravando Venda...' : '✓ Concluir Venda Externa'}
              </button>
            </div>
          </div>
        </div>
      </form>

      {savedSaleId && !createdReceipt && (
        <div className="admin-card" style={{padding: '16px', marginTop: '16px'}}>
          <p>Venda {savedSaleId} já gravada.</p>
          <button type="button" className="admin-btn admin-btn--primary" onClick={handleResetForm}>Iniciar nova venda</button>
        </div>
      )}
      {/* Modais */}
      {createdReceipt && (
        <WarrantyReceiptModal
          receipt={createdReceipt}
          onClose={() => setCreatedReceipt(null)}
          onNewSale={handleResetForm}
        />
      )}

      {showPickupModal && (
        <CashPickupModal
          onClose={() => setShowPickupModal(false)}
          onSuccess={() => alert('Recolhimento registrado com sucesso no financeiro!')}
        />
      )}

      {showPendingModal && (
        <DailyPendingModal
          onClose={() => setShowPendingModal(false)}
          onOpenPickupModal={() => setShowPickupModal(true)}
        />
      )}
    </div>
  );
}
