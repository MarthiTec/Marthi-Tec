import '../pages/admin/externalSale.css';
import { useState } from 'react';
import { nestRequest } from '../services/nestClient';
import { apiSendWarrantyWhatsApp } from '../services/erpApi';

type Props = {
  receipt: any;
  onClose: () => void;
  onNewSale: () => void;
  /** Reabrindo uma venda antiga (consulta de vendas): muda o título e esconde "Nova Venda". */
  reprint?: boolean;
};

export function WarrantyReceiptModal({ receipt, onClose, onNewSale, reprint = false }: Props) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(receipt?.sale?.customer?.phone || '');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const sale = receipt?.sale;
  const store = receipt?.store || { name: '' };

  async function handleSendWhatsApp() {
    if (!phone.trim()) {
      setFeedback({ ok: false, msg: 'Informe o número de WhatsApp do cliente.' });
      return;
    }
    setSending(true);
    setFeedback(null);
    try {
      const res = await apiSendWarrantyWhatsApp(sale.id, { phone }, store.id);
      if (res?.sentViaEvolution) {
        setFeedback({ ok: true, msg: 'Comprovante e termo de garantia enviados com sucesso via WhatsApp!' });
      } else if (res?.directUrl) {
        window.open(res.directUrl, '_blank');
        setFeedback({ ok: false, msg: 'Envio automático não confirmado. Janela do WhatsApp aberta para envio da garantia.' });
      } else {
        setFeedback({ ok: false, msg: 'A API não confirmou o envio. Confira a configuração de WhatsApp da loja.' });
      }
    } catch (err: any) {
      setFeedback({ ok: false, msg: err.message || 'Falha ao disparar WhatsApp.' });
    } finally {
      setSending(false);
    }
  }

  async function handleSendEmail() {
    setSending(true);setFeedback(null);
    try {
      await nestRequest('/sales/'+encodeURIComponent(sale.id)+'/send-receipt-email', {method:'POST',headers:{'x-store-id':store.id},body:JSON.stringify({recipient:email.trim()})});
      setFeedback({ok:true,msg:'Comprovante aceito pelo servidor de e-mail da loja.'});
    } catch(error) {setFeedback({ok:false,msg:error instanceof Error ? error.message : 'Falha no envio do e-mail.'});}
    finally {setSending(false);}
  }
  function handlePrint() {
    window.print();
  }

  return (
    <div className="admin-modal-backdrop external-sale-backdrop" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label="Comprovante e garantia" className="admin-modal admin-modal--lg external-sale-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px', width: '95vw' }}
      >
        <div className="admin-modal__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.4rem' }}>✅</span>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                {reprint ? 'Comprovante da venda' : 'Venda Finalizada com Sucesso!'}
              </h3>
            </div>
            <small style={{ color: 'var(--mute, #94a3b8)', marginLeft: '32px' }}>{store?.name || ''}</small>
          </div>
          <button className="admin-btn admin-btn--icon" onClick={onClose} title="Fechar">
            ✕
          </button>
        </div>

        <div className="admin-modal__body" style={{ maxHeight: '78vh', overflowY: 'auto', padding: '16px' }}>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
            <input aria-label="E-mail do cliente" className="admin-input" type="email" placeholder="E-mail do cliente" value={email} onChange={event=>setEmail(event.target.value)} />
            <button type="button" className="btn btn--ghost" disabled={sending || !email.trim()} onClick={()=>void handleSendEmail()}>Enviar comprovante por e-mail</button>
          </div>
          {/* Cartão de Identificação da Venda */}
          <div
            style={{
              background: 'var(--card-2, #1c2430)',
              border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
              borderRadius: '8px',
              padding: '14px',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <span style={{ fontSize: '0.78rem', color: 'var(--mute, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Número da Venda
                </span>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent, #2dd4bf)' }}>
                  #{sale?.id}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--mute, #94a3b8)' }}>Data / Hora</span>
                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                  {sale?.date ? new Date(sale.date).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR')}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '12px' }}>
              <div>
                <small style={{ color: 'var(--mute)' }}>Cliente:</small>
                <div style={{ fontWeight: 600 }}>{sale?.customer?.name}</div>
                {sale?.customer?.document && <small style={{ color: 'var(--mute)' }}>CPF: {sale.customer.document}</small>}
              </div>
              <div>
                <small style={{ color: 'var(--mute)' }}>Vendedora:</small>
                <div style={{ fontWeight: 600 }}>{sale?.seller}</div>
              </div>
              <div>
                <small style={{ color: 'var(--mute)' }}>Forma de Pagamento:</small>
                <div style={{ fontWeight: 600 }}>{sale?.financial?.paymentMethod}</div>
              </div>
              <div>
                <small style={{ color: 'var(--mute)' }}>Total Pago:</small>
                <div style={{ fontWeight: 800, color: 'var(--accent, #2dd4bf)', fontSize: '1.1rem' }}>
                  R$ {sale?.financial?.totalPaid?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          {/* Produtos Comprados */}
          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', fontWeight: 700, color: 'var(--ink)' }}>
              📦 Produtos Adquiridos
            </h4>
            <div className="admin-table-container">
              <table className="admin-table" style={{ width: '100%', fontSize: '0.88rem' }}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ textAlign: 'center' }}>Qtd</th>
                    <th style={{ textAlign: 'right' }}>Valor Unit.</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sale?.items?.map((it: any, idx: number) => (
                    <tr key={idx}>
                      <td>
                        <strong>{it.name}</strong>
                        {it.imei && <div style={{ fontSize: '0.75rem', color: 'var(--mute)' }}>IMEI: {it.imei}</div>}
                      </td>
                      <td style={{ textAlign: 'center' }}>{it.qty}</td>
                      <td style={{ textAlign: 'right' }}>
                        R$ {it.unitPrice?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        R$ {it.totalPrice?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Aparelho de Upgrade / Trade-in se houver */}
          {sale?.tradeIn && (
            <div
              style={{
                background: 'rgba(45, 212, 191, 0.08)',
                border: '1px solid rgba(45, 212, 191, 0.3)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ color: 'var(--accent, #2dd4bf)' }}>🔄 Aparelho Entregue na Troca (Upgrade)</strong>
                  <div style={{ fontSize: '0.92rem', marginTop: '4px' }}>
                    {sale.tradeIn.device} · {sale.tradeIn.capacity} {sale.tradeIn.color}
                  </div>
                  {sale.tradeIn.imei && <small style={{ color: 'var(--mute)' }}>IMEI: {sale.tradeIn.imei}</small>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <small style={{ color: 'var(--mute)' }}>Crédito Abatido:</small>
                  <div style={{ fontWeight: 800, color: 'var(--accent, #2dd4bf)', fontSize: '1.05rem' }}>
                    - R$ {sale.tradeIn.creditValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Garantia do Aparelho */}
          <div
            style={{
              background: 'var(--card, #171e27)',
              border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '1.1rem' }}>🛡️</span>
              <strong style={{ fontSize: '0.92rem' }}>Certificado & Termo de Garantia</strong>
              <span className="admin-badge admin-badge--active" style={{ marginLeft: 'auto' }}>
                {sale?.warranty?.months || 3} Meses
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--mute)', lineHeight: 1.5 }}>
              {sale?.warranty?.terms}
            </p>
          </div>

          {/* Disparo WhatsApp */}
          <div
            style={{
              background: 'var(--card-2, #1c2430)',
              border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
              borderRadius: '8px',
              padding: '14px',
            }}
          >
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
              Enviar Garantia e Comprovante para o WhatsApp do Cliente:
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="admin-input"
                style={{ flex: '1 1 200px' }}
                placeholder="(24) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '160px' }}
                onClick={handleSendWhatsApp}
                disabled={sending}
              >
                <span>📱</span>
                {sending ? 'Enviando...' : 'Enviar WhatsApp'}
              </button>
            </div>
            {feedback && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '0.84rem',
                  background: feedback.ok ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: feedback.ok ? '#4ade80' : '#f87171',
                  border: `1px solid ${feedback.ok ? '#22c55e' : '#ef4444'}`,
                }}
              >
                {feedback.msg}
              </div>
            )}
          </div>
        </div>

        <div
          className="admin-modal__foot"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            padding: '14px 16px',
            borderTop: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
          }}
        >
          <button type="button" className="admin-btn admin-btn--secondary" onClick={handlePrint}>
            🖨️ Imprimir Comprovante
          </button>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="admin-btn admin-btn--secondary" onClick={onClose}>
              Fechar
            </button>
            {reprint ? null : (
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                onClick={() => {
                  onClose();
                  onNewSale();
                }}
              >
                ➕ Nova Venda
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
