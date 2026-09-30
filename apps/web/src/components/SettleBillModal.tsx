import { useState, useMemo } from 'react';
import { AdminPicker } from './AdminPicker';
import { money, type BankAccount, type Payable, type Receivable, type SettleBillOptions } from '../data/financeBook';
import { listInvoices, invoiceTotal, type Invoice } from '../data/invoiceStore';
import './settleBillModal.css';

export type SettleBillModalProps = {
  open: boolean;
  kind: 'payable' | 'receivable';
  item: Payable | Receivable | null;
  accounts: BankAccount[];
  onConfirm: (options: SettleBillOptions) => Promise<void>;
  onClose: () => void;
};

export function SettleBillModal({
  open,
  kind,
  item,
  accounts,
  onConfirm,
  onClose,
}: SettleBillModalProps) {
  if (!open || !item) return null;

  const isPayable = kind === 'payable';
  const openRemainder = Math.max(0, item.amount - (isPayable ? (item as Payable).paidAmount : (item as Receivable).receivedAmount));

  // Estados dos inputs de baixa
  const [amountStr, setAmountStr] = useState(openRemainder.toFixed(2));
  const [interestStr, setInterestStr] = useState('0,00');
  const [fineStr, setFineStr] = useState('0,00');
  const [discountStr, setDiscountStr] = useState('0,00');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState(item.accountId || accounts[0]?.id || '');
  const [documentNumber, setDocumentNumber] = useState(item.documentNumber || '');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(item.invoiceId || '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Busca notas fiscais disponíveis para vínculo
  const availableInvoices = useMemo(() => {
    try {
      const invoiceKind = isPayable ? 'entry' : 'exit';
      return listInvoices(invoiceKind);
    } catch {
      return [];
    }
  }, [isPayable]);

  const parsedAmount = Math.max(0, Number(amountStr.replace(',', '.')) || 0);
  const parsedInterest = Math.max(0, Number(interestStr.replace(',', '.')) || 0);
  const parsedFine = Math.max(0, Number(fineStr.replace(',', '.')) || 0);
  const parsedDiscount = Math.max(0, Number(discountStr.replace(',', '.')) || 0);

  const netTotal = Math.max(0, parsedAmount + parsedInterest + parsedFine - parsedDiscount);
  const isPartial = parsedAmount < openRemainder - 0.01;

  async function handleConfirm() {
    if (parsedAmount <= 0) {
      setErrorMsg('Informe um valor de baixa válido maior que zero.');
      return;
    }
    if (parsedAmount > openRemainder + 0.01) {
      setErrorMsg(`O valor de amortização não pode ser maior que o saldo em aberto (${money(openRemainder)}).`);
      return;
    }

    const linkedInvoice = availableInvoices.find((inv) => inv.id === selectedInvoiceId);

    setSaving(true);
    setErrorMsg('');
    try {
      await onConfirm({
        amount: parsedAmount,
        interestAmount: parsedInterest,
        fineAmount: parsedFine,
        discountAmount: parsedDiscount,
        paymentDate,
        accountId,
        documentNumber: documentNumber.trim(),
        invoiceId: linkedInvoice?.id,
        invoiceNumber: linkedInvoice ? (linkedInvoice.number ? `NF ${linkedInvoice.number}` : linkedInvoice.id) : undefined,
        invoiceType: linkedInvoice?.kind,
        notes: notes.trim(),
      });
      onClose();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Falha ao processar baixa.');
    } finally {
      setSaving(false);
    }
  }

  const invoiceOptions = [
    { value: '', label: 'Sem vínculo com nota fiscal' },
    ...availableInvoices.map((inv: Invoice) => ({
      value: inv.id,
      label: `${inv.kind === 'entry' ? '📥 Compra' : '📤 Venda'} NF nº ${inv.number || 'S/N'} (Série ${inv.series || '1'}) - ${money(invoiceTotal(inv))}`,
    })),
  ];

  const partyName = isPayable ? (item as Payable).supplierName : (item as Receivable).customerName;

  return (
    <div className="settle-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="settle-dialog-title">
      <div className="settle-modal-card">
        <header className="settle-modal-header">
          <div>
            <span className={`settle-modal-badge ${isPayable ? 'is-payable' : 'is-receivable'}`}>
              {isPayable ? 'Contas a Pagar' : 'Contas a Receber'}
            </span>
            <h2 id="settle-dialog-title">
              {isPayable ? 'Baixar Pagamento' : 'Confirmar Recebimento'}
            </h2>
          </div>
          <button type="button" className="settle-modal-close" onClick={onClose} aria-label="Fechar modal">
            ✕
          </button>
        </header>

        {errorMsg ? (
          <div className="settle-modal-error" role="alert">
            {errorMsg}
          </div>
        ) : null}

        {/* Resumo do Título */}
        <section className="settle-modal-summary">
          <div className="settle-summary-row">
            <span className="settle-summary-label">Título:</span>
            <strong className="settle-summary-value">{item.description}</strong>
          </div>
          <div className="settle-summary-row">
            <span className="settle-summary-label">{isPayable ? 'Fornecedor:' : 'Cliente:'}</span>
            <span className="settle-summary-value">{partyName || 'Não especificado'}</span>
          </div>
          <div className="settle-summary-grid">
            <div>
              <span className="settle-summary-sub">Valor do Título</span>
              <strong>{money(item.amount)}</strong>
            </div>
            <div>
              <span className="settle-summary-sub">Já Amortizado</span>
              <span>{money(isPayable ? (item as Payable).paidAmount : (item as Receivable).receivedAmount)}</span>
            </div>
            <div>
              <span className="settle-summary-sub">Saldo em Aberto</span>
              <strong className={isPayable ? 'qty-low' : 'price-red'}>{money(openRemainder)}</strong>
            </div>
            <div>
              <span className="settle-summary-sub">Vencimento Original</span>
              <span>{item.dueDate}</span>
            </div>
          </div>
        </section>

        {/* Formulário de Baixa */}
        <div className="settle-modal-form">
          <div className="settle-form-row">
            <label className="settle-form-field">
              <span>Valor a {isPayable ? 'Pagar' : 'Receber'} (Principal) *</span>
              <input
                type="text"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0,00"
                autoFocus
              />
              {isPartial ? (
                <small className="settle-field-hint settle-hint--warn">
                  ⚠️ Pagamento Parcial: restará {money(openRemainder - parsedAmount)} em aberto.
                </small>
              ) : null}
            </label>

            <label className="settle-form-field">
              <span>Data da Baixa / Pagamento *</span>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </label>
          </div>

          <div className="settle-form-row settle-form-row--three">
            <label className="settle-form-field">
              <span>Juros (+) R$</span>
              <input
                type="text"
                value={interestStr}
                onChange={(e) => setInterestStr(e.target.value)}
                placeholder="0,00"
              />
            </label>
            <label className="settle-form-field">
              <span>Multa (+) R$</span>
              <input
                type="text"
                value={fineStr}
                onChange={(e) => setFineStr(e.target.value)}
                placeholder="0,00"
              />
            </label>
            <label className="settle-form-field">
              <span>Desconto (-) R$</span>
              <input
                type="text"
                value={discountStr}
                onChange={(e) => setDiscountStr(e.target.value)}
                placeholder="0,00"
              />
            </label>
          </div>

          {/* Destaque do Valor Líquido */}
          <div className="settle-net-card">
            <div className="settle-net-breakdown">
              <span>Principal: <strong>{money(parsedAmount)}</strong></span>
              {parsedInterest > 0 ? <span className="settle-tag--add">+ Juros: {money(parsedInterest)}</span> : null}
              {parsedFine > 0 ? <span className="settle-tag--add">+ Multa: {money(parsedFine)}</span> : null}
              {parsedDiscount > 0 ? <span className="settle-tag--sub">- Desconto: {money(parsedDiscount)}</span> : null}
            </div>
            <div className="settle-net-total">
              <span className="settle-net-label">Total Líquido Efetivo:</span>
              <span className={`settle-net-value ${isPayable ? 'qty-low' : 'price-red'}`}>
                {money(netTotal)}
              </span>
            </div>
          </div>

          <div className="settle-form-row">
            <div className="settle-form-field">
              <AdminPicker
                label="Conta Bancária / Caixa de Movimento"
                value={accountId}
                options={accounts.map((acc) => ({
                  value: acc.id,
                  label: `${acc.name} (${acc.bank || 'Interno'})`,
                }))}
                onChange={setAccountId}
              />
            </div>
            <label className="settle-form-field">
              <span>Nº do Documento / Comprovante / Pix</span>
              <input
                type="text"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="Ex: BOL-9482, DOC-01928, PIX-E2E"
              />
            </label>
          </div>

          <div className="settle-form-field">
            <AdminPicker
              label={`Vincular Nota Fiscal de ${isPayable ? 'Entrada (Compra)' : 'Saída (Venda)'} do Emissor`}
              value={selectedInvoiceId}
              options={invoiceOptions}
              onChange={setSelectedInvoiceId}
            />
          </div>

          <label className="settle-form-field">
            <span>Observações da Baixa</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Pago via aplicativo bancário com desconto pontualidade."
            />
          </label>
        </div>

        <footer className="settle-modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn ${isPayable ? 'btn--primary' : 'btn--primary'}`}
            onClick={() => void handleConfirm()}
            disabled={saving || parsedAmount <= 0}
          >
            {saving ? 'Processando baixa...' : isPayable ? `Confirmar Pagamento (${money(netTotal)})` : `Confirmar Recebimento (${money(netTotal)})`}
          </button>
        </footer>
      </div>
    </div>
  );
}
