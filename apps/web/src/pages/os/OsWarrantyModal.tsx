import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AdminIcon } from '../../components/AdminIcons';
import type { WorkOrder, WorkOrderLine } from '../../data/osStore';
import { useOsPrintSettings } from '../../data/osPrintSettings';
import { QrCodeView } from '../../components/QrCodeView';

type Props = {
  order: WorkOrder | null;
  open: boolean;
  onClose: () => void;
};

type WarrantyItemConfig = {
  id: string;
  name: string;
  kind: 'part' | 'labor';
  days: number;
};

function formatIsoToBr(iso: string) {
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

function calculateEndDate(startDateStr: string, days: number): string {
  try {
    const d = new Date(startDateStr);
    if (Number.isNaN(d.getTime())) return '—';
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function OsWarrantyModal({ order, open, onClose }: Props) {
  const [settings] = useOsPrintSettings();

  // Delivery / Start date
  const [deliveryDate, setDeliveryDate] = useState<string>(() => {
    if (order?.deliveredAt) {
      try {
        return new Date(order.deliveredAt).toISOString().split('T')[0];
      } catch {
        // fallback
      }
    }
    return new Date().toISOString().split('T')[0];
  });

  // Items with individual warranty days
  const [items, setItems] = useState<WarrantyItemConfig[]>([]);

  // Initialize warranty items whenever order opens
  useEffect(() => {
    if (!order) return;

    if (order.deliveredAt) {
      try {
        setDeliveryDate(new Date(order.deliveredAt).toISOString().split('T')[0]);
      } catch {
        setDeliveryDate(new Date().toISOString().split('T')[0]);
      }
    } else {
      setDeliveryDate(new Date().toISOString().split('T')[0]);
    }

    if (order.lines && order.lines.length > 0) {
      setItems(
        order.lines.map((l: WorkOrderLine, idx) => {
          const lower = l.name.toLowerCase();
          // Smart default: batteries often get 180 days, screen/labor 90 days
          const days = lower.includes('bateria') ? 180 : (lower.includes('acess') ? 30 : 90);
          return {
            id: l.id || `line-${idx}`,
            name: l.name,
            kind: l.kind || 'part',
            days,
          };
        }),
      );
    } else {
      // Fallback from defect / main service
      setItems([
        {
          id: 'default-1',
          name: order.defect || 'Serviço executado na bancada técnica',
          kind: 'labor',
          days: 90,
        },
      ]);
    }
  }, [order, open]);

  // Set printing class on body
  useEffect(() => {
    if (open) {
      document.body.classList.add('is-printing-os');
    }
    return () => {
      document.body.classList.remove('is-printing-os');
    };
  }, [open]);

  // Keyboard shortcut Ctrl+P / Escape
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

  if (!open || !order || typeof document === 'undefined') return null;

  const company = settings.company;
  const qr = settings.qrCode;

  function updateDays(id: string, days: number) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, days: Math.max(1, days) } : item)),
    );
  }

  return createPortal(
    <div className="os-modal-backdrop os-print-modal-backdrop" onClick={onClose}>
      <div
        className="os-print-modal-dialog os-warranty-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* BARRA SUPERIOR DE AÇÕES E CONFIGURAÇÃO DE PRAZOS (OCULTA NA IMPRESSÃO) */}
        <header className="os-print-modal__bar no-print">
          <div className="os-print-modal__bar-left">
            <span className="os-print-modal__icon">📜</span>
            <div>
              <strong>Termo & Comprovante de Garantia — OS #{order.id}</strong>
              <p>Configure os prazos por componente antes de imprimir o documento para o cliente</p>
            </div>
          </div>

          <div className="os-print-modal__bar-actions">
            <button
              type="button"
              className="btn btn--primary os-print-modal__btn-print"
              onClick={() => window.print()}
            >
              <AdminIcon name="print" />
              <span>Imprimir Certificado (Ctrl+P)</span>
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

        {/* PAINEL DE CONFIGURAÇÃO DE PRAZOS (NO-PRINT) */}
        <div className="os-warranty-config-strip no-print">
          <div className="os-warranty-config-field">
            <label>
              <span>Data da Entrega / Início:</span>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </label>
          </div>

          <div className="os-warranty-config-items">
            <span>Ajustar Garantia por Peça/Serviço:</span>
            <div className="os-warranty-config-tags">
              {items.map((it) => (
                <div key={it.id} className="os-warranty-tag-row">
                  <span className="os-warranty-item-name" title={it.name}>
                    {it.name} <small>({it.kind === 'part' ? 'Peça' : 'Mão de obra'})</small>:
                  </span>
                  <div className="os-warranty-tag-inputs">
                    <input
                      type="number"
                      min={1}
                      max={730}
                      value={it.days}
                      onChange={(e) => updateDays(it.id, Number(e.target.value) || 0)}
                      className="os-warranty-days-input"
                    />
                    <span className="os-warranty-unit">dias</span>
                    <button
                      type="button"
                      className="btn-quick-day"
                      onClick={() => updateDays(it.id, 90)}
                      title="Definir 90 dias"
                    >
                      90d
                    </button>
                    <button
                      type="button"
                      className="btn-quick-day"
                      onClick={() => updateDays(it.id, 180)}
                      title="Definir 180 dias"
                    >
                      180d
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* FOLHA DE IMPRESSÃO DO CERTIFICADO DE GARANTIA */}
        <div className="os-print-sheet-scroll-wrap">
          <article className="os-print-sheet os-warranty-sheet">
            {/* CABEÇALHO COMERCIAL / EMPRESA */}
            <header className="os-comm-header">
              <div className="os-comm-header__brand">
                {company.logoUrl ? (
                  <img
                    src={company.logoUrl}
                    alt={company.name}
                    className="os-comm-header__logo-img"
                  />
                ) : (
                  <div className="os-comm-header__logo-badge">
                    <span className="os-comm-header__logo-badge-top">SMART</span>
                    <strong className="os-comm-header__logo-badge-mid">{company.tradeName || company.name}</strong>
                    <small className="os-comm-header__logo-badge-bot">CELULAR & INFORMÁTICA</small>
                  </div>
                )}
              </div>

              <div className="os-comm-header__info">
                <h2 className="os-comm-header__legal-name">{company.name.toUpperCase()}</h2>
                <p className="os-comm-header__address">
                  {company.address}
                  {company.neighborhood ? `, ${company.neighborhood}` : ''}
                  {company.city ? ` — ${company.city}` : ''}
                  {company.state ? `/${company.state}` : ''}
                  {company.zip ? ` — CEP ${company.zip}` : ''}
                </p>
                <div className="os-comm-header__contact-line">
                  <span><strong>CONTATO:</strong> {company.phone}</span>
                  {company.document ? <span><strong>CNPJ:</strong> {company.document}</span> : null}
                  {company.ie ? <span><strong>IE:</strong> {company.ie}</span> : null}
                </div>
                {company.email ? (
                  <p className="os-comm-header__email"><strong>E-MAIL:</strong> {company.email}</p>
                ) : null}
              </div>

              <div className="os-comm-header__badge-wrap">
                <span className="os-comm-copy-tag os-comm-copy-tag--warranty">
                  CERTIFICADO DE GARANTIA
                </span>
              </div>
            </header>

            {/* DADOS DA OS E DO CLIENTE */}
            <div className="os-comm-grid os-comm-grid--row1">
              <div className="os-comm-cell os-comm-cell--w20">
                <span className="os-comm-label">DATA DA ENTREGA</span>
                <span className="os-comm-val"><strong>{formatIsoToBr(deliveryDate)}</strong></span>
              </div>
              <div className="os-comm-cell os-comm-cell--w55">
                <span className="os-comm-label">CLIENTE BENEFICIÁRIO</span>
                <span className="os-comm-val os-comm-val--customer">{order.customerName}</span>
              </div>
              <div className="os-comm-cell os-comm-cell--w25 os-comm-cell--os-num">
                <span className="os-comm-label">ORDEM DE SERVIÇO Nº</span>
                <span className="os-comm-val os-comm-val--big-os">*{order.id}*</span>
              </div>
            </div>

            <div className="os-comm-grid os-comm-grid--row2">
              <div className="os-comm-cell os-comm-cell--w25">
                <span className="os-comm-label">CPF / CNPJ</span>
                <span className="os-comm-val">{order.customerDocument || 'Não informado'}</span>
              </div>
              <div className="os-comm-cell os-comm-cell--w25">
                <span className="os-comm-label">TELEFONE DE CONTATO</span>
                <span className="os-comm-val">{order.customerPhone || 'Não informado'}</span>
              </div>
              <div className="os-comm-cell os-comm-cell--w25">
                <span className="os-comm-label">EQUIPAMENTO REPARADO</span>
                <span className="os-comm-val">
                  <strong>{order.itemModel || order.itemName}</strong> ({order.itemBrand || 'Aparelho'})
                </span>
              </div>
              <div className="os-comm-cell os-comm-cell--w25">
                <span className="os-comm-label">IMEI / NÚMERO DE SÉRIE</span>
                <span className="os-comm-val"><strong>{order.itemRef || 'Não informado'}</strong></span>
              </div>
            </div>

            {/* TABELA DE DISCRIMINAÇÃO DE PRAZOS POR PEÇA E SERVIÇO */}
            <div className="os-warranty-table-section">
              <h3 className="os-warranty-section-title">
                DISCRIMINAÇÃO DOS SERVIÇOS EXECUTADOS & PRAZOS DE GARANTIA
              </h3>
              <table className="os-comm-table os-warranty-table">
                <thead>
                  <tr>
                    <th style={{ width: '5%' }}>It.</th>
                    <th style={{ width: '45%' }}>Peça Trocada / Serviço Executado</th>
                    <th style={{ width: '15%', textAlign: 'center' }}>Prazo Vigente</th>
                    <th style={{ width: '17%', textAlign: 'center' }}>Data Inicial</th>
                    <th style={{ width: '18%', textAlign: 'center' }}>Data de Vencimento</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const startStr = formatIsoToBr(deliveryDate);
                    const endStr = calculateEndDate(deliveryDate, item.days);
                    return (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td>
                          <strong>{item.name}</strong>
                          <span className="os-comm-tag-kind">
                            {item.kind === 'part' ? ' [Peça Substituída]' : ' [Mão de Obra]'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <strong className="os-warranty-highlight-days">{item.days} dias</strong>
                        </td>
                        <td style={{ textAlign: 'center' }}>{startStr}</td>
                        <td style={{ textAlign: 'center' }}>
                          <strong className="os-warranty-highlight-end">{endStr}</strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* TERMOS E CONDIÇÕES LEGAIS DA GARANTIA */}
            <div className="os-comm-terms-wrap os-warranty-rules-wrap">
              <div className="os-comm-terms-text">
                <span className="os-comm-label">CONDIÇÕES GERAIS E EXCLUSÕES DA GARANTIA:</span>
                <ol className="os-warranty-legal-list">
                  <li>
                    <strong>Cobertura Específica:</strong> A garantia cobre exclusivamente os defeitos de fabricação das peças substituídas ou vícios na mão de obra técnica executada e discriminada nesta Ordem de Serviço.
                  </li>
                  <li>
                    <strong>Exclusões de Garantia:</strong> A garantia perde totalmente a sua validade caso seja constatado:
                    <ul>
                      <li>Quedas, impactos físicos, telas trincadas, display quebrado ou arranhões posteriores;</li>
                      <li>Contato com umidade, líquidos, oxidação ou exposição a calor excessivo;</li>
                      <li>Violação, rompimento ou remoção do selo/lacre de garantia interno ou externo da oficina;</li>
                      <li>Intervenção ou tentativa de conserto realizada por terceiros ou pelo próprio cliente;</li>
                      <li>Uso de carregadores piratas, variações de tensão elétrica ou sobrecarga de energia.</li>
                    </ul>
                  </li>
                  <li>
                    <strong>Comprovação:</strong> Para acionamento da garantia dentro do prazo legal estipulado acima, é indispensável a apresentação deste documento original acompanhado do equipamento.
                  </li>
                </ol>
                <div className="os-warranty-acceptance">
                  Declaro que conferi e retirei o equipamento em perfeito estado de funcionamento e estética, ciente dos termos de garantia e prazos estipulados acima.
                </div>
              </div>

              {/* QR Code */}
              {qr.enabled && qr.url ? (
                <div className="os-comm-qr-box os-warranty-qr-box">
                  <QrCodeView value={qr.url} size={82} />
                  <span className="os-comm-qr-label">{qr.label || 'Central de Atendimento'}</span>
                </div>
              ) : null}
            </div>

            {/* ASSINATURAS DO TERMO */}
            <div className="os-comm-signatures">
              <div className="os-comm-sig-block">
                <div className="os-comm-sig-line" />
                <span className="os-comm-sig-title">ASSINATURA DO CLIENTE</span>
                <small className="os-comm-sig-sub">{order.customerName}</small>
              </div>
              <div className="os-comm-sig-block">
                <div className="os-comm-sig-line" />
                <span className="os-comm-sig-title">{company.tradeName || company.name}</span>
                <small className="os-comm-sig-sub">Técnico / Responsável: {order.technician || 'Bancada'}</small>
              </div>
            </div>

            {/* RODAPÉ */}
            <footer className="os-comm-footer">
              <span>Certificado de Garantia Oficial — Página 1 de 1</span>
              <span>Emissão: {new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              <span>Autenticação: OS-{order.id}-{Date.now().toString(36).toUpperCase()}</span>
            </footer>
          </article>
        </div>
      </div>
    </div>,
    document.body,
  );
}
