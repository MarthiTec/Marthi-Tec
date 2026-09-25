import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  type WorkOrder,
  registerWorkOrderPayment,
  PAYMENT_STATUS_LABEL,
} from '../../data/osStore';
import { MARTHI_COMPANY } from '../../data/companyContact';

type Props = {
  open: boolean;
  order: WorkOrder | null;
  onClose: () => void;
  onPaymentRegistered?: (updated: WorkOrder) => void;
  operatorName?: string;
};

const PAYMENT_METHODS = [
  { id: 'Dinheiro', label: '💵 Dinheiro', icon: '💵' },
  { id: 'Pix', label: '⚡ Pix', icon: '⚡' },
  { id: 'Cartão de Débito', label: '💳 Cartão de Débito', icon: '💳' },
  { id: 'Cartão de Crédito', label: '💳 Cartão de Crédito', icon: '💳' },
  { id: 'Transferência', label: '🏦 Transferência Bancária', icon: '🏦' },
  { id: 'Outro', label: '📝 Outro Meio', icon: '📝' },
];

function money(v: number) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function OsSimplifiedCheckoutModal({
  open,
  order,
  onClose,
  onPaymentRegistered,
  operatorName = 'Operador Oficina',
}: Props) {
  const [discount, setDiscount] = useState<number>(0);
  const [discountMode, setDiscountMode] = useState<'money' | 'percent'>('money');
  const [surcharge, setSurcharge] = useState<number>(0);
  const [surchargeMode, setSurchargeMode] = useState<'money' | 'percent'>('money');

  const [method, setMethod] = useState<string>('Pix');
  const [payAmount, setPayAmount] = useState<string>('');
  const [cashGiven, setCashGiven] = useState<string>('');
  const [note, setNote] = useState<string>('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successReceipt, setSuccessReceipt] = useState<{
    paidAmount: number;
    method: string;
    change: number;
    remaining: number;
    date: string;
  } | null>(null);

  // Sync initial state when modal opens or order changes
  useEffect(() => {
    if (order) {
      setDiscount(order.discount || 0);
      setDiscountMode(order.discountMode || 'money');
      setSurcharge(order.surcharge || 0);
      setSurchargeMode(order.surchargeMode || 'money');
      setSuccessReceipt(null);
      setError('');
      setNote('');

      const baseTotal = order.labor + (order.lines?.some((l) => l.kind === 'part')
        ? order.lines.filter((l) => l.kind === 'part').reduce((sum, l) => sum + l.unitPrice * l.qty, 0)
        : order.parts);

      const dVal = (order.discountMode === 'percent')
        ? ((baseTotal * (order.discount || 0)) / 100)
        : (order.discount || 0);
      const sVal = (order.surchargeMode === 'percent')
        ? ((baseTotal * (order.surcharge || 0)) / 100)
        : (order.surcharge || 0);
      const finalTot = Math.max(0, Math.round((baseTotal - dVal + sVal) * 100) / 100);

      const paidSoFar = (order.payments ?? []).reduce((sum, p) => sum + p.amount, 0) || (order.paidAmount ?? 0);
      const rem = Math.max(0, Math.round((finalTot - paidSoFar) * 100) / 100);

      setPayAmount(rem > 0 ? rem.toFixed(2) : '0.00');
      setCashGiven(rem > 0 ? rem.toFixed(2) : '0.00');
    }
  }, [order, open]);

  const summary = useMemo(() => {
    if (!order) return null;
    const baseTotal = order.labor + (order.lines?.some((l) => l.kind === 'part')
      ? order.lines.filter((l) => l.kind === 'part').reduce((sum, l) => sum + l.unitPrice * l.qty, 0)
      : order.parts);

    const dVal =
      discountMode === 'percent'
        ? Math.round(((baseTotal * (discount || 0)) / 100) * 100) / 100
        : Number(discount) || 0;
    const sVal =
      surchargeMode === 'percent'
        ? Math.round(((baseTotal * (surcharge || 0)) / 100) * 100) / 100
        : Number(surcharge) || 0;
    const finalTotal = Math.max(0, Math.round((baseTotal - dVal + sVal) * 100) / 100);

    const paidSoFar = (order.payments ?? []).reduce((sum, p) => sum + p.amount, 0) || (order.paidAmount ?? 0);
    const remaining = Math.max(0, Math.round((finalTotal - paidSoFar) * 100) / 100);

    return {
      baseTotal,
      dVal,
      sVal,
      finalTotal,
      paidSoFar,
      remaining,
    };
  }, [order, discount, discountMode, surcharge, surchargeMode]);

  // Update default payAmount whenever remaining changes (if not edited)
  useEffect(() => {
    if (summary && !successReceipt) {
      setPayAmount(summary.remaining.toFixed(2));
      setCashGiven(summary.remaining.toFixed(2));
    }
  }, [summary?.remaining, successReceipt]);

  if (!open || !order || !summary) return null;

  const numPayAmount = Math.max(0, parseFloat(payAmount) || 0);
  const numCashGiven = Math.max(0, parseFloat(cashGiven) || 0);
  const isCash = method === 'Dinheiro';
  const change = isCash && numCashGiven > numPayAmount ? Math.round((numCashGiven - numPayAmount) * 100) / 100 : 0;
  const isPartial = numPayAmount < summary.remaining && numPayAmount > 0;
  const remainingAfterThis = Math.max(0, Math.round((summary.remaining - numPayAmount) * 100) / 100);

  async function handleConfirmPayment() {
    if (!order) return;
    setError('');

    if (numPayAmount <= 0) {
      setError('Informe um valor de recebimento válido maior que zero.');
      return;
    }
    if (numPayAmount > summary!.remaining + 0.01) {
      setError(`O valor a receber não pode ser maior que o saldo restante (${money(summary!.remaining)}).`);
      return;
    }
    if (isCash && numCashGiven < numPayAmount) {
      setError('O valor em dinheiro entregue pelo cliente não pode ser menor que o valor a pagar.');
      return;
    }

    setBusy(true);
    try {
      const updated = await registerWorkOrderPayment(order.id, {
        method,
        amount: numPayAmount,
        receivedAmount: isCash ? numCashGiven : numPayAmount,
        change,
        discount,
        discountMode,
        surcharge,
        surchargeMode,
        note: note.trim() || undefined,
        operatorName,
      });

      if (!updated) {
        setError('Não foi possível registrar o recebimento. Tente novamente.');
        return;
      }

      setSuccessReceipt({
        paidAmount: numPayAmount,
        method,
        change,
        remaining: remainingAfterThis,
        date: new Date().toISOString(),
      });

      if (onPaymentRegistered) {
        onPaymentRegistered(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar pagamento.');
    } finally {
      setBusy(false);
    }
  }

  function handlePrintReceipt() {
    window.print();
  }

  function handleWhatsAppReceipt() {
    if (!order) return;
    const cleanPhone = order.customerPhone.replace(/\D/g, '');
    const isTotal = remainingAfterThis <= 0;
    const msg = [
      `🧾 *COMPROVANTE DE RECEBIMENTO — OS #${order.id}*`,
      '',
      `Olá, *${order.customerName}*! Confirmamos o recebimento do pagamento da sua Ordem de Serviço na Marthi Oficina:`,
      '',
      `• *Equipamento:* ${order.itemName} ${order.itemModel ? `(${order.itemModel})` : ''}`,
      `• *Serviço / Defeito:* ${order.defect}`,
      `• *Valor Total:* ${money(summary!.finalTotal)}`,
      `• *Valor Recebido:* ${money(numPayAmount)} (${method})`,
      change > 0 ? `• *Troco:* ${money(change)}` : '',
      isTotal
        ? '• *Situação:* QUITADA TOTALMENTE ✅'
        : `• *Saldo Restante a Pagar:* ${money(remainingAfterThis)} ⚠️`,
      '',
      `Data: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      `Operador: ${operatorName}`,
      '',
      'Agradecemos a confiança e preferência!',
      `${MARTHI_COMPANY.legalName} — ${MARTHI_COMPANY.whatsappDisplay}`,
    ]
      .filter(Boolean)
      .join('\n');

    const url = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function handleEmailReceipt() {
    if (!order) return;
    const targetEmail = order.customerEmail;
    const isTotal = remainingAfterThis <= 0;
    const subject = `[Marthi] Comprovante de Pagamento OS #${order.id}`;
    const body = [
      `Prezado(a) ${order.customerName},`,
      '',
      `Confirmamos o recebimento do pagamento referente à Ordem de Serviço #${order.id}.`,
      '',
      '--- DETALHES DO RECEBIMENTO ---',
      `Ordem de Serviço: #${order.id}`,
      `Aparelho: ${order.itemName} ${order.itemModel ? `(${order.itemModel})` : ''}`,
      `Valor Total da OS: ${money(summary!.finalTotal)}`,
      `Valor Pago: ${money(numPayAmount)} via ${method}`,
      change > 0 ? `Troco: ${money(change)}` : '',
      isTotal ? 'Status: QUITADA COM SUCESSO' : `Saldo Pendente: ${money(remainingAfterThis)}`,
      `Data/Hora: ${new Date().toLocaleString('pt-BR')}`,
      `Operador de Caixa: ${operatorName}`,
      '',
      'Agradecemos por escolher nossos serviços.',
      `${MARTHI_COMPANY.legalName}`,
      `${MARTHI_COMPANY.addressLine}`,
      `Contato: ${MARTHI_COMPANY.whatsappDisplay}`,
    ]
      .filter(Boolean)
      .join('\n');

    const mailto = `mailto:${targetEmail || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, '_blank', 'noopener,noreferrer');
  }

  return createPortal(
    <div className="os-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="os-modal os-share-modal os-simplified-checkout-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 680 }}
      >
        {/* Header do Caixa Simplificado */}
        <header className="os-modal__header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.4rem' }}>💰</span>
              <h2 className="os-modal__title">
                {successReceipt ? 'Recebimento Concluído' : `Receber OS #${order.id}`}
              </h2>
            </div>
            <p className="os-modal__subtitle">
              Caixa Simplificado de Ordem de Serviço · {order.customerName}
            </p>
          </div>
          <button type="button" className="os-modal__close" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </header>

        <div className="os-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Card Resumo do Equipamento */}
          <div className="os-share-summary" style={{ margin: 0 }}>
            <div className="os-share-summary__row">
              <span className="os-share-summary__label">Equipamento:</span>
              <strong className="os-share-summary__value">
                {order.itemName} {order.itemModel ? `(${order.itemModel})` : ''}
              </strong>
            </div>
            <div className="os-share-summary__row">
              <span className="os-share-summary__label">Defeito / Serviço:</span>
              <span className="os-share-summary__value">{order.defect}</span>
            </div>
            <div className="os-share-summary__row">
              <span className="os-share-summary__label">Mão de obra / Peças:</span>
              <span className="os-share-summary__value">
                Mão de obra: {money(order.labor)} | Peças: {money(order.parts)}
              </span>
            </div>
            <div className="os-share-summary__row" style={{ marginTop: 4, borderTop: '1px dashed #cbd5e1', paddingTop: 6 }}>
              <span className="os-share-summary__label">Status Financeiro:</span>
              <span
                className={`os-status-pill ${
                  order.paymentStatus === 'paid'
                    ? 'os-status-pill--ready'
                    : order.paymentStatus === 'partially_paid'
                    ? 'os-status-pill--progress'
                    : 'os-status-pill--waiting'
                }`}
              >
                {PAYMENT_STATUS_LABEL[order.paymentStatus || 'pending']}
              </span>
            </div>
          </div>

          {!successReceipt ? (
            <>
              {/* Ajuste de Desconto e Acréscimo */}
              <div
                style={{
                  background: 'var(--panel-bg-subtle, #f8fafc)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: 10,
                  padding: '12px 16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Ajuste de Valores (Desconto / Acréscimo)</span>
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    Subtotal: <strong>{money(summary.baseTotal)}</strong>
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  {/* Desconto */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: '#475569' }}>
                      Desconto
                    </label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={discount || ''}
                        placeholder="0.00"
                        onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          fontSize: '0.9rem',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setDiscountMode((m) => (m === 'money' ? 'percent' : 'money'))}
                        className="btn btn--sm btn--ghost"
                        style={{ minWidth: 42, fontWeight: 700 }}
                        title="Alternar entre R$ e %"
                      >
                        {discountMode === 'money' ? 'R$' : '%'}
                      </button>
                    </div>
                    {summary.dVal > 0 ? (
                      <small style={{ color: '#ef4444', fontSize: '0.75rem', display: 'block', marginTop: 2 }}>
                        - {money(summary.dVal)}
                      </small>
                    ) : null}
                  </div>

                  {/* Acréscimo */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: '#475569' }}>
                      Acréscimo
                    </label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={surcharge || ''}
                        placeholder="0.00"
                        onChange={(e) => setSurcharge(Math.max(0, parseFloat(e.target.value) || 0))}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          fontSize: '0.9rem',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setSurchargeMode((m) => (m === 'money' ? 'percent' : 'money'))}
                        className="btn btn--sm btn--ghost"
                        style={{ minWidth: 42, fontWeight: 700 }}
                        title="Alternar entre R$ e %"
                      >
                        {surchargeMode === 'money' ? 'R$' : '%'}
                      </button>
                    </div>
                    {summary.sVal > 0 ? (
                      <small style={{ color: '#0ea5e9', fontSize: '0.75rem', display: 'block', marginTop: 2 }}>
                        + {money(summary.sVal)}
                      </small>
                    ) : null}
                  </div>
                </div>

                {/* Resumo de Quitação */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: '1px solid var(--border-color, #e2e8f0)',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Valor Final Líquido: </span>
                    <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>{money(summary.finalTotal)}</strong>
                  </div>
                  {summary.paidSoFar > 0 ? (
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.8rem', color: '#16a34a', display: 'block' }}>
                        Já recebido: {money(summary.paidSoFar)}
                      </span>
                      <span style={{ fontSize: '0.9rem', color: '#ea580c', fontWeight: 700 }}>
                        Restante: {money(summary.remaining)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Formulário de Recebimento */}
              <div
                style={{
                  background: 'var(--panel-bg, #ffffff)',
                  border: '2px solid #3b82f6',
                  borderRadius: 10,
                  padding: '16px',
                }}
              >
                <h3 style={{ fontSize: '1rem', margin: '0 0 12px 0', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>💳</span> Registrar Recebimento
                </h3>

                {/* Seletor de Forma de Pagamento */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6, color: '#334155' }}>
                    Forma de Pagamento
                  </label>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                      gap: 8,
                    }}
                  >
                    {PAYMENT_METHODS.map((pm) => (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setMethod(pm.id)}
                        className={`btn btn--sm ${method === pm.id ? 'btn--primary' : 'btn--ghost'}`}
                        style={{
                          justifyContent: 'flex-start',
                          padding: '8px 10px',
                          border: method === pm.id ? '2px solid #2563eb' : '1px solid #cbd5e1',
                          fontWeight: method === pm.id ? 700 : 500,
                        }}
                      >
                        {pm.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Campos de Valor */}
                <div style={{ display: 'grid', gridTemplateColumns: isCash ? '1fr 1fr' : '1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4, color: '#334155' }}>
                      Valor a Receber (R$)
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={summary.remaining}
                      value={payAmount}
                      onChange={(e) => {
                        setPayAmount(e.target.value);
                        if (isCash) setCashGiven(e.target.value);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        borderRadius: 8,
                        border: '1px solid #94a3b8',
                        color: '#0f172a',
                      }}
                    />
                    {isPartial ? (
                      <small style={{ color: '#ea580c', fontSize: '0.78rem', display: 'block', marginTop: 4, fontWeight: 600 }}>
                        ⚠️ Recebimento parcial. Ficará restando {money(remainingAfterThis)}.
                      </small>
                    ) : null}
                  </div>

                  {isCash ? (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4, color: '#334155' }}>
                        Valor Entregue pelo Cliente (R$)
                      </label>
                      <input
                        type="number"
                        min={numPayAmount}
                        step="0.01"
                        value={cashGiven}
                        onChange={(e) => setCashGiven(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          fontSize: '1.1rem',
                          fontWeight: 700,
                          borderRadius: 8,
                          border: '1px solid #94a3b8',
                          color: '#0f172a',
                        }}
                      />
                      {change > 0 ? (
                        <div
                          style={{
                            marginTop: 6,
                            padding: '4px 8px',
                            background: '#dcfce7',
                            color: '#15803d',
                            borderRadius: 6,
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            display: 'inline-block',
                          }}
                        >
                          Troco: {money(change)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {/* Observações Opcionais */}
                <div style={{ marginTop: 12 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: 4 }}>
                    Observações / Comprovante (opcional)
                  </label>
                  <input
                    type="text"
                    value={note}
                    placeholder="Ex: Código de autorização, comprovante Pix, etc."
                    onChange={(e) => setNote(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>

                {error ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '8px 12px',
                      background: '#fee2e2',
                      color: '#b91c1c',
                      borderRadius: 6,
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    {error}
                  </div>
                ) : null}

                {/* Botão de Finalização */}
                <button
                  type="button"
                  onClick={handleConfirmPayment}
                  disabled={busy || numPayAmount <= 0}
                  className="btn btn--primary"
                  style={{
                    width: '100%',
                    marginTop: 16,
                    padding: '12px',
                    fontSize: '1rem',
                    fontWeight: 700,
                    backgroundColor: isPartial ? '#d97706' : '#2563eb',
                  }}
                >
                  {busy
                    ? 'Registrando...'
                    : isPartial
                    ? `Registrar Pagamento Parcial de ${money(numPayAmount)}`
                    : `Finalizar Recebimento e Quitar (${money(numPayAmount)})`}
                </button>
              </div>
            </>
          ) : (
            /* Tela de Sucesso com Comprovante e Compartilhamento */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  background: '#dcfce7',
                  border: '1px solid #86efac',
                  borderRadius: 10,
                  padding: '16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '2.5rem', marginBottom: 6 }}>🎉</div>
                <h3 style={{ margin: 0, color: '#15803d', fontSize: '1.25rem' }}>
                  Pagamento registrado com sucesso!
                </h3>
                <p style={{ margin: '4px 0 0 0', color: '#166534', fontSize: '0.9rem' }}>
                  O recebimento foi computado no histórico financeiro da Ordem de Serviço.
                </p>
              </div>

              {/* Detalhes do Comprovante */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '14px',
                  fontSize: '0.88rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#64748b' }}>Valor Pago:</span>
                  <strong style={{ color: '#15803d', fontSize: '1rem' }}>{money(successReceipt.paidAmount)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#64748b' }}>Forma de Pagamento:</span>
                  <strong>{successReceipt.method}</strong>
                </div>
                {successReceipt.change > 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: '#64748b' }}>Troco Devolvido:</span>
                    <strong style={{ color: '#15803d' }}>{money(successReceipt.change)}</strong>
                  </div>
                ) : null}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#64748b' }}>Saldo Restante:</span>
                  <strong style={{ color: successReceipt.remaining > 0 ? '#ea580c' : '#15803d' }}>
                    {successReceipt.remaining > 0 ? money(successReceipt.remaining) : 'Quitada ✅'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px dashed #cbd5e1' }}>
                  <span style={{ color: '#64748b' }}>Operador:</span>
                  <span>{operatorName}</span>
                </div>
              </div>

              {/* Botões de Comprovante */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                <button
                  type="button"
                  onClick={handlePrintReceipt}
                  className="btn btn--secondary"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  🖨️ Imprimir Comprovante
                </button>
                <button
                  type="button"
                  onClick={handleWhatsAppReceipt}
                  className="btn btn--secondary"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  💬 Enviar WhatsApp
                </button>
                <button
                  type="button"
                  onClick={handleEmailReceipt}
                  className="btn btn--secondary"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  ✉️ Enviar E-mail
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="btn btn--primary"
                style={{ width: '100%', marginTop: 8 }}
              >
                Voltar para a OS
              </button>
            </div>
          )}

          {/* Chamada Discreta para o PDV (Upsell Educativo) */}
          <div
            style={{
              background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
              border: '1px solid #bfdbfe',
              borderRadius: 8,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginTop: 4,
            }}
          >
            <div>
              <strong style={{ fontSize: '0.85rem', color: '#1e40af', display: 'block', marginBottom: 2 }}>
                💡 Quer ter um controle completo das suas vendas?
              </strong>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#334155' }}>
                Com o <strong>PDV</strong> você pode controlar abertura e fechamento de caixa, sangrias,
                múltiplas formas de pagamento em uma mesma venda e emitir cupom fiscal integrado às suas OS.
              </p>
            </div>
            <Link
              to="/painel/plano"
              className="btn btn--sm btn--primary"
              style={{ whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '6px 10px' }}
            >
              Conhecer o PDV →
            </Link>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
