import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  STATUS_LABEL,
  PRIORITY_LABEL,
  workOrderTotal,
  updateWorkOrder,
  logWorkOrderActivity,
  type WorkOrder,
} from '../../data/osStore';
import { getAdminState, upsertCustomer } from '../../data/adminStore';
import { OsPrintModal } from './OsPrintModal';
import { MARTHI_COMPANY } from '../../data/companyContact';

type Props = {
  open: boolean;
  order: WorkOrder | null;
  onClose: () => void;
  onContinueToOrder?: (order: WorkOrder) => void;
  authorName?: string;
};

function money(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string) {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function OsCreatedShareModal({
  open,
  order,
  onClose,
  onContinueToOrder,
  authorName = 'Operador',
}: Props) {
  const [printOpen, setPrintOpen] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [emailed, setEmailed] = useState(false);
  const [whatsapped, setWhatsapped] = useState(false);

  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');

  const [editingPhone, setEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState('');

  const [feedback, setFeedback] = useState<string | null>(null);

  if (!open || !order || typeof document === 'undefined') return null;

  const total = workOrderTotal(order);
  const customerEmail = order.customerEmail?.trim();
  const customerPhone = order.customerPhone?.trim();

  // Print Action
  function handlePrint() {
    setPrintOpen(true);
    setPrinted(true);
    void logWorkOrderActivity(
      order!.id,
      'Impressão',
      'adicionou',
      'Ordem de Serviço impressa (2 vias)',
      authorName,
    );
    setFeedback('Versão para impressão aberta com sucesso!');
  }

  // Save Email and Update Order
  async function handleSaveEmail() {
    if (!newEmail.trim() || !newEmail.includes('@')) return;
    const email = newEmail.trim().toLowerCase();
    await updateWorkOrder(order!.id, { customerEmail: email });
    order!.customerEmail = email;

    // Also update customer in adminStore if exists
    try {
      const state = getAdminState();
      const match = state.customers.find(
        (c) => c.name.toLowerCase() === order!.customerName.toLowerCase(),
      );
      if (match) {
        await upsertCustomer({ ...match, email });
      }
    } catch {
      // safe fallback
    }

    setEditingEmail(false);
    sendEmail(email);
  }

  // Trigger Email Flow
  function sendEmail(targetEmail: string) {
    if (!targetEmail) return;
    const subject = `[Marthi Tecnologia] Ordem de Serviço #${order!.id} - ${order!.itemName}`;
    const bodyLines = [
      `Olá, ${order!.customerName}!`,
      '',
      `Sua Ordem de Serviço #${order!.id} foi cadastrada com sucesso na Marthi Tecnologia.`,
      '',
      '--- DETALHES DA ORDEM DE SERVIÇO ---',
      `Número da OS: #${order!.id}`,
      `Cliente: ${order!.customerName}`,
      `Equipamento / Modelo: ${order!.itemName} ${order!.itemModel ? `(${order!.itemModel})` : ''}`,
      `Defeito Relatado: ${order!.defect}`,
      `Status Inicial: ${STATUS_LABEL[order!.status] || 'Aberta'}`,
      `Prioridade: ${PRIORITY_LABEL[order!.priority] || 'Normal'}`,
      `Técnico Responsável: ${order!.technician || 'Equipe Técnica'}`,
      order!.estimatedReadyAt ? `Previsão de Conclusão: ${formatDate(order!.estimatedReadyAt)}` : '',
      total > 0 ? `Valor do Orçamento: ${money(total)}` : '',
      '',
      '--- INFORMAÇÕES DA LOJA ---',
      `${MARTHI_COMPANY.legalName}`,
      `Endereço: ${MARTHI_COMPANY.addressLine}`,
      `Central / WhatsApp: ${MARTHI_COMPANY.whatsappDisplay}`,
      '',
      'Agradecemos a confiança em nossos serviços!',
    ]
      .filter(Boolean)
      .join('\n');

    const mailto = `mailto:${targetEmail}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(bodyLines)}`;
    window.open(mailto, '_blank', 'noopener,noreferrer');

    void logWorkOrderActivity(
      order!.id,
      'E-mail',
      'adicionou',
      `Ordem de Serviço enviada por e-mail para ${targetEmail}`,
      authorName,
    );

    setEmailed(true);
    setFeedback(`OS enviada com sucesso! A Ordem de Serviço foi direcionada para ${targetEmail}.`);
  }

  // Save Phone and Update Order
  async function handleSavePhone() {
    if (!newPhone.trim()) return;
    const phone = newPhone.trim();
    await updateWorkOrder(order!.id, { customerPhone: phone });
    order!.customerPhone = phone;

    try {
      const state = getAdminState();
      const match = state.customers.find(
        (c) => c.name.toLowerCase() === order!.customerName.toLowerCase(),
      );
      if (match) {
        await upsertCustomer({ ...match, phone });
      }
    } catch {
      // safe fallback
    }

    setEditingPhone(false);
    sendWhatsApp(phone);
  }

  // Trigger WhatsApp Flow
  function sendWhatsApp(targetPhone: string) {
    if (!targetPhone) return;
    const digits = targetPhone.replace(/\D/g, '');
    const cleanPhone = digits.startsWith('55') ? digits : `55${digits}`;

    const textLines = [
      `*Ordem de Serviço #${order!.id} - Marthi Tecnologia*`,
      `Olá, *${order!.customerName}*!`,
      'Sua OS foi cadastrada com sucesso em nossa loja.',
      '',
      `📱 *Equipamento:* ${order!.itemName} ${order!.itemModel ? `(${order!.itemModel})` : ''}`,
      `🔧 *Defeito Relatado:* ${order!.defect}`,
      `⏱️ *Status:* ${STATUS_LABEL[order!.status] || 'Aberta'}`,
      `⚡ *Prioridade:* ${PRIORITY_LABEL[order!.priority] || 'Normal'}`,
      `👨‍🔧 *Técnico:* ${order!.technician || 'Equipe Técnica'}`,
      order!.estimatedReadyAt ? `📅 *Previsão:* ${formatDate(order!.estimatedReadyAt)}` : '',
      total > 0 ? `💰 *Valor Estimado:* ${money(total)}` : '',
      '',
      'Qualquer dúvida sobre o andamento, estamos à disposição por aqui!',
    ]
      .filter(Boolean)
      .join('\n');

    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(textLines)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    void logWorkOrderActivity(
      order!.id,
      'WhatsApp',
      'adicionou',
      `Ordem de Serviço compartilhada pelo WhatsApp com ${targetPhone}`,
      authorName,
    );

    setWhatsapped(true);
    setFeedback(`WhatsApp aberto com sucesso! Notificação enviada para ${targetPhone}.`);
  }

  return createPortal(
    <>
      <div className="os-modal-backdrop" onClick={onClose}>
        <div
          className="os-share-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="os-share-title"
        >
          {/* Header de Sucesso */}
          <header className="os-share-modal__head">
            <div className="os-share-modal__title-box">
              <div className="os-share-modal__check-circle" aria-hidden="true">
                ✓
              </div>
              <div>
                <h3 id="os-share-title">
                  OS criada com sucesso!
                  <span className="os-share-modal__os-code">#{order.id}</span>
                </h3>
                <p>A ordem de serviço já está registrada no sistema e no quadro de operações.</p>
              </div>
            </div>
            <button
              type="button"
              className="os-modal__close-btn"
              onClick={onClose}
              title="Fechar (Esc)"
              aria-label="Fechar"
            >
              ×
            </button>
          </header>

          {/* Resumo da OS */}
          <div className="os-share-modal__summary">
            <div className="os-share-modal__summary-item">
              <span>Cliente</span>
              <strong>{order.customerName}</strong>
            </div>
            <div className="os-share-modal__summary-item">
              <span>Equipamento</span>
              <strong>{order.itemName}</strong>
            </div>
            <div className="os-share-modal__summary-item">
              <span>Prioridade</span>
              <strong>{PRIORITY_LABEL[order.priority] || 'Normal'}</strong>
            </div>
            {total > 0 ? (
              <div className="os-share-modal__summary-item">
                <span>Orçamento</span>
                <strong style={{ color: '#16a34a' }}>{money(total)}</strong>
              </div>
            ) : null}
          </div>

          {/* Corpo com as 3 Opções de Envio */}
          <div className="os-share-modal__body">
            <p className="os-share-modal__lead-text">Como deseja enviar a OS ao cliente?</p>

            <div className="os-share-cards">
              {/* Card 1: Impressão */}
              <article className="os-share-card os-share-card--print">
                {printed ? <span className="os-share-card__badge-ok">✓ Impressa</span> : null}
                <div>
                  <div className="os-share-card__icon">🖨️</div>
                  <h4 className="os-share-card__title">Imprimir OS</h4>
                  <p className="os-share-card__desc">
                    Gera a via de bancada técnica e o comprovante do cliente para retirada.
                  </p>
                </div>
                <button
                  type="button"
                  className="os-share-card__btn os-share-card__btn--print"
                  onClick={handlePrint}
                >
                  Imprimir 2 Vias
                </button>
              </article>

              {/* Card 2: E-mail */}
              <article
                className={`os-share-card os-share-card--email ${
                  !customerEmail ? 'os-share-card--disabled' : ''
                }`}
              >
                {emailed ? <span className="os-share-card__badge-ok">✓ Enviado</span> : null}
                <div>
                  <div className="os-share-card__icon">✉️</div>
                  <h4 className="os-share-card__title">Enviar por E-mail</h4>
                  <p className="os-share-card__desc">
                    {customerEmail ? (
                      <>
                        Enviar para: <br />
                        <strong>{customerEmail}</strong>
                      </>
                    ) : (
                      'Cliente não possui e-mail cadastrado.'
                    )}
                  </p>
                </div>

                {customerEmail ? (
                  <button
                    type="button"
                    className="os-share-card__btn os-share-card__btn--email"
                    onClick={() => sendEmail(customerEmail)}
                  >
                    Enviar por E-mail
                  </button>
                ) : (
                  <button
                    type="button"
                    className="os-share-card__btn os-share-card__btn--secondary"
                    onClick={() => setEditingEmail((v) => !v)}
                  >
                    {editingEmail ? 'Cancelar' : 'Cadastrar E-mail'}
                  </button>
                )}

                {editingEmail ? (
                  <div className="os-share-inline-edit">
                    <label>
                      E-mail do cliente:
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="cliente@exemplo.com"
                        autoFocus
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={handleSaveEmail}
                      disabled={!newEmail.includes('@')}
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    >
                      Salvar e Enviar
                    </button>
                  </div>
                ) : null}
              </article>

              {/* Card 3: WhatsApp */}
              <article
                className={`os-share-card os-share-card--wa ${
                  !customerPhone ? 'os-share-card--disabled' : ''
                }`}
              >
                {whatsapped ? <span className="os-share-card__badge-ok">✓ Enviado</span> : null}
                <div>
                  <div className="os-share-card__icon">💬</div>
                  <h4 className="os-share-card__title">Enviar por WhatsApp</h4>
                  <p className="os-share-card__desc">
                    {customerPhone ? (
                      <>
                        WhatsApp cadastrado: <br />
                        <strong>{customerPhone}</strong>
                      </>
                    ) : (
                      'Cliente não possui WhatsApp cadastrado.'
                    )}
                  </p>
                </div>

                {customerPhone ? (
                  <button
                    type="button"
                    className="os-share-card__btn os-share-card__btn--wa"
                    onClick={() => sendWhatsApp(customerPhone)}
                  >
                    Enviar pelo WhatsApp
                  </button>
                ) : (
                  <button
                    type="button"
                    className="os-share-card__btn os-share-card__btn--secondary"
                    onClick={() => setEditingPhone((v) => !v)}
                  >
                    {editingPhone ? 'Cancelar' : 'Cadastrar WhatsApp'}
                  </button>
                )}

                {editingPhone ? (
                  <div className="os-share-inline-edit">
                    <label>
                      Número do WhatsApp com DDD:
                      <input
                        type="tel"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="(24) 99999-9999"
                        autoFocus
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={handleSavePhone}
                      disabled={newPhone.replace(/\D/g, '').length < 10}
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    >
                      Salvar e Enviar
                    </button>
                  </div>
                ) : null}
              </article>
            </div>

            {/* Mensagem de Feedback de Envio */}
            {feedback ? (
              <div className="os-share-feedback" role="status">
                <span>✓</span>
                <span>{feedback}</span>
              </div>
            ) : null}
          </div>

          {/* Rodapé com Ações Secundárias */}
          <footer className="os-share-modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Continuar sem enviar
            </button>
            {onContinueToOrder ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => onContinueToOrder(order)}
              >
                Continuar para a OS →
              </button>
            ) : null}
          </footer>
        </div>
      </div>

      {/* Modal de Impressão Integrado */}
      <OsPrintModal order={order} open={printOpen} onClose={() => setPrintOpen(false)} />
    </>,
    document.body,
  );
}
