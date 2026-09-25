import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AdminIcon } from '../../components/AdminIcons';
import {
  STATUS_LABEL,
  PRIORITY_LABEL,
  workOrderTotal,
  type WorkOrder,
} from '../../data/osStore';
import { useStoreCustomization } from '../../data/storeSegment';

type Props = {
  order: WorkOrder | null;
  open: boolean;
  onClose: () => void;
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
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function OsPrintModal({ order, open, onClose }: Props) {
  useEffect(() => {
    if (open) {
      document.body.classList.add('is-printing-os');
    }
    return () => {
      document.body.classList.remove('is-printing-os');
    };
  }, [open]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === 'Escape') onClose();
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        window.print();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || !order) return null;

  const customization = useStoreCustomization();
  const total = workOrderTotal(order);

  return createPortal(
    <div className="os-modal-backdrop os-print-modal-backdrop" onClick={onClose}>
      <div
        className="os-print-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Barra superior de ações na tela (oculta na impressão) */}
        <header className="os-print-modal__bar no-print">
          <div className="os-print-modal__bar-left">
            <span className="os-print-modal__icon">🖨️</span>
            <div>
              <strong>Impressão da Ordem de Serviço — 2 Vias</strong>
              <p>1ª Via para a bancada técnica da loja e 2ª Via comprovante do cliente para retirada</p>
            </div>
          </div>
          <div className="os-print-modal__bar-actions">
            <button
              type="button"
              className="btn btn--primary os-print-modal__btn-print"
              onClick={() => window.print()}
            >
              <AdminIcon name="print" />
              <span>Imprimir Agora (Ctrl+P)</span>
            </button>
            <button
              type="button"
              className="os-print-modal__btn-close"
              onClick={onClose}
              title="Fechar (Esc)"
            >
              ✕ Fechar
            </button>
          </div>
        </header>

        {/* Folha de Impressão (Renderizada na tela e na impressora/PDF) */}
        <div className="os-print-sheet-scroll-wrap">
          <article className="os-print-sheet">
            {/* =================================================================
                1ª VIA — VIA DA LOJA / OFICINA (Bancada Técnica com o Aparelho)
               ================================================================= */}
            <section className="os-print-copy os-print-copy--shop">
              <header className="os-print-head">
                <div className="os-print-head__company">
                  <div className="os-print-logo-box">
                    <span className="os-print-logo-mark">⚡</span>
                    <strong>MARTHI TECNOLOGIA & ASSISTÊNCIA TÉCNICA</strong>
                  </div>
                  <p>Especializada em Smartphones, Notebooks e Eletrônicos</p>
                  <small>Rua do Comércio, 120 · Tel / WhatsApp: (11) 98765-4321 · CNPJ: 12.345.678/0001-90</small>
                </div>
                <div className="os-print-head__meta">
                  <span className="os-print-badge os-print-badge--shop">1ª VIA · VIA DA OFICINA / BANCADA</span>
                  <div className="os-print-os-num">
                    <small>ORDEM DE SERVIÇO</small>
                    <strong>#{order.id}</strong>
                  </div>
                </div>
              </header>

              {/* Faixa com Dados da Operação */}
              <div className="os-print-meta-strip">
                <div>
                  <span>Entrada:</span>
                  <strong>{formatDate(order.createdAt)}</strong>
                </div>
                <div>
                  <span>Previsão de Entrega:</span>
                  <strong>{formatDate(order.estimatedReadyAt)}</strong>
                </div>
                <div>
                  <span>Técnico Responsável:</span>
                  <strong>{order.technician || 'Bancada Técnica'}</strong>
                </div>
                <div>
                  <span>Prioridade:</span>
                  <strong>{PRIORITY_LABEL[order.priority]}</strong>
                </div>
                <div>
                  <span>Situação:</span>
                  <strong>{STATUS_LABEL[order.status]}</strong>
                </div>
              </div>

              {/* Tabela de Dados Completos da OS */}
              <table className="os-print-table">
                <tbody>
                  <tr>
                    <th>Cliente / Contato</th>
                    <td colSpan={3}>
                      <strong>{order.customerName}</strong>
                      {order.customerPhone ? ` · Tel: ${order.customerPhone}` : ''}
                      {order.customerDocument ? ` · CPF/CNPJ: ${order.customerDocument}` : ''}
                      {order.customerEmail ? ` · E-mail: ${order.customerEmail}` : ''}
                    </td>
                  </tr>
                  <tr>
                    <th>{customization.showImei ? 'Equipamento' : 'Item / Serviço'}</th>
                    <td colSpan={customization.showImei ? 1 : 3}>
                      <strong>{order.itemName}</strong>
                      {[order.itemBrand, order.itemModel, order.itemColor].filter(Boolean).length > 0 ? (
                        <span> ({[order.itemBrand, order.itemModel, order.itemColor].filter(Boolean).join(' · ')})</span>
                      ) : null}
                    </td>
                    {customization.showImei ? (
                      <>
                        <th>IMEI / Nº Série</th>
                        <td>
                          <strong>{order.itemRef || 'Não informado'}</strong>
                        </td>
                      </>
                    ) : null}
                  </tr>
                  <tr>
                    {customization.showDevicePassword ? (
                      <>
                        <th>Senha de Desbloqueio</th>
                        <td>
                          <strong className="os-print-highlight-val">
                            {order.devicePassword || 'Sem senha informada'}
                          </strong>
                        </td>
                        <th>Acessórios Deixados</th>
                        <td>{order.accessories || 'Nenhum acessório deixado'}</td>
                      </>
                    ) : (
                      <>
                        <th>Acessórios Deixados</th>
                        <td colSpan={3}>{order.accessories || 'Nenhum acessório deixado'}</td>
                      </>
                    )}
                  </tr>
                  <tr>
                    <th>Estado na Entrada</th>
                    <td colSpan={3}>
                      {order.conditionOnEntry || 'Aparelho sem marcas ou avarias adicionais relatadas na entrada.'}
                    </td>
                  </tr>
                  <tr>
                    <th>Defeito Reclamado</th>
                    <td colSpan={3}>
                      <strong>{order.defect}</strong>
                    </td>
                  </tr>
                  <tr>
                    <th>Diagnóstico Técnico</th>
                    <td colSpan={3}>
                      {order.diagnosis || 'Avaliação técnica preliminar em andamento na bancada.'}
                    </td>
                  </tr>
                  {order.techNotes || order.notes ? (
                    <tr>
                      <th>Notas da Bancada / Técnico</th>
                      <td colSpan={3}>
                        <span className="os-print-notes-text">
                          {[order.techNotes, order.notes].filter(Boolean).join(' | ')}
                        </span>
                      </td>
                    </tr>
                  ) : null}
                  <tr>
                    <th>Orçamento Estimado</th>
                    <td colSpan={3} className="os-print-pricing-td">
                      <span>Mão de Obra: {money(order.labor)}</span>
                      <span>Peças: {money(order.parts)}</span>
                      <strong className="os-print-total-val">VALOR TOTAL: {money(total)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Termo e Assinaturas da 1ª Via */}
              <div className="os-print-footer">
                <p className="os-print-term">
                  Declaro que as informações acima e o estado estético do aparelho estão de acordo.
                  Autorizo a execução dos serviços e testes necessários na bancada técnica.
                </p>
                <div className="os-print-signatures">
                  <div className="os-print-signature-block">
                    <div className="os-print-signature-line" />
                    <strong>Assinatura do Técnico Responsável</strong>
                    <small>{order.technician || 'Técnico Responsável Marthi'}</small>
                  </div>
                  <div className="os-print-signature-block">
                    <div className="os-print-signature-line" />
                    <strong>Assinatura do Cliente</strong>
                    <small>{order.customerName}</small>
                  </div>
                </div>
              </div>
            </section>

            {/* =================================================================
                LINHA DE CORTE E SERRILHA ENTRE AS DUAS VIAS
               ================================================================= */}
            <div className="os-print-cut-divider" aria-hidden="true">
              <span className="os-print-cut-icon">✂</span>
              <span className="os-print-cut-label">
                CORTE AQUI · DESTAQUE A 2ª VIA PARA ENTREGAR AO CLIENTE
              </span>
              <span className="os-print-cut-icon">✂</span>
            </div>

            {/* =================================================================
                2ª VIA — VIA DO CLIENTE (Comprovante de Entrada / Retirada)
               ================================================================= */}
            <section className="os-print-copy os-print-copy--customer">
              <header className="os-print-head">
                <div className="os-print-head__company">
                  <div className="os-print-logo-box">
                    <span className="os-print-logo-mark">⚡</span>
                    <strong>MARTHI TECNOLOGIA & ASSISTÊNCIA TÉCNICA</strong>
                  </div>
                  <small>Rua do Comércio, 120 · Central de Atendimento / WhatsApp: (11) 98765-4321</small>
                </div>
                <div className="os-print-head__meta">
                  <span className="os-print-badge os-print-badge--customer">2ª VIA · COMPROVANTE DO CLIENTE</span>
                </div>
              </header>

              {/* Card de Destaque com o Número da OS */}
              <div className="os-print-customer-ticket-card">
                <div className="os-print-customer-ticket-card__header">
                  <span>COMPROVANTE DE ENTREGA DE EQUIPAMENTO</span>
                  <small>Guarde este documento com cuidado</small>
                </div>
                <div className="os-print-customer-ticket-card__number-row">
                  <span className="os-print-ticket-label">NÚMERO DA SUA ORDEM DE SERVIÇO:</span>
                  <strong className="os-print-ticket-big-num">#{order.id}</strong>
                </div>
                <div className="os-print-customer-ticket-card__alert">
                  ⚠️ APRESENTE ESTE NÚMERO / COMPROVANTE AO RETORNAR PARA RETIRAR SEU APARELHO
                </div>
              </div>

              {/* Resumo do Equipamento e Prazos para o Cliente */}
              <div className="os-print-customer-summary-grid">
                <div>
                  <span>Cliente:</span>
                  <strong>{order.customerName}</strong>
                </div>
                <div>
                  <span>Telefone:</span>
                  <strong>{order.customerPhone || '—'}</strong>
                </div>
                <div>
                  <span>{customization.showImei ? 'Aparelho:' : 'Item / Serviço:'}</span>
                  <strong>
                    {order.itemName}{' '}
                    {[order.itemBrand, order.itemModel].filter(Boolean).length > 0
                      ? `(${[order.itemBrand, order.itemModel].filter(Boolean).join(' ')})`
                      : ''}
                  </strong>
                </div>
                {customization.showImei ? (
                  <div>
                    <span>Nº Série / IMEI:</span>
                    <strong>{order.itemRef || '—'}</strong>
                  </div>
                ) : null}
                <div>
                  <span>Acessórios Deixados:</span>
                  <strong>{order.accessories || 'Nenhum'}</strong>
                </div>
                <div>
                  <span>Previsão de Conclusão:</span>
                  <strong style={{ color: '#0f766e' }}>{formatDate(order.estimatedReadyAt)}</strong>
                </div>
                <div className="os-print-span-full">
                  <span>Defeito Informado:</span>
                  <strong>{order.defect}</strong>
                </div>
                <div className="os-print-span-full os-print-customer-total-row">
                  <span>Total Estimado:</span>
                  <strong>{money(total)}</strong>
                </div>
              </div>

              {/* Termos de Garantia e Condições de Retirada */}
              <div className="os-print-rules-box">
                <strong>TERMOS DE GARANTIA E CONDIÇÕES DE RETIRADA:</strong>
                <ol>
                  <li>
                    A entrega do equipamento será realizada <strong>exclusivamente mediante apresentação deste canhoto original</strong> com o número da OS ou documento com foto do titular cadastrado.
                  </li>
                  <li>
                    Garantia legal de <strong>90 (noventa) dias</strong> sobre os serviços executados e peças substituídas (Artigo 26 do Código de Defesa do Consumidor). A garantia perde a validade em casos de novas quedas, telas trincadas, contato com umidade/líquidos ou violação do selo de segurança.
                  </li>
                  <li>
                    Aparelhos prontos e não retirados no prazo de até 90 dias após a notificação poderão ser desfeitos para ressarcimento de custos operacionais e de armazenagem.
                  </li>
                </ol>
              </div>

              {/* Assinaturas da 2ª Via */}
              <div className="os-print-signatures os-print-signatures--customer">
                <div className="os-print-signature-block">
                  <div className="os-print-signature-line" />
                  <strong>Recebido por (Loja Marthi)</strong>
                  <small>Carimbo / Visto do Atendente</small>
                </div>
                <div className="os-print-signature-block">
                  <div className="os-print-signature-line" />
                  <strong>Assinatura do Cliente</strong>
                  <small>{order.customerName}</small>
                </div>
              </div>
            </section>
          </article>
        </div>
      </div>
    </div>,
    document.body,
  );
}
