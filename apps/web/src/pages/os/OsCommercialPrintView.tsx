import {
  workOrderTotal,
  type WorkOrder,
} from '../../data/osStore';
import {
  type OsPrintSettings,
  type OsPasswordType,
  DEFAULT_WARRANTY_TERMS,
} from '../../data/osPrintSettings';
import { PatternLockGrid } from '../../components/PatternLockGrid';
import { QrCodeView } from '../../components/QrCodeView';

type Props = {
  order: WorkOrder;
  settings: OsPrintSettings;
  passwordType: OsPasswordType;
  customPassword?: string;
  customImei?: string;
};

function money(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso?: string) {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function calculateWarrantyUntil(createdAt: string, days = 90) {
  try {
    const base = new Date(createdAt);
    if (Number.isNaN(base.getTime())) return '90 dias após entrega';
    base.setDate(base.getDate() + days);
    return base.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '90 dias após entrega';
  }
}

function resolveImei(order: WorkOrder, customImei?: string) {
  if (customImei && customImei.trim()) return customImei.trim();
  const raw = order.itemRef || (order as any).imei || (order as any).serialNumber || (order as any).serial || '';
  return raw.trim() || 'Não informado';
}

/* =============================================================================
   1ª VIA — VIA DA LOJA / BANCADA (Com Senha, Sem Termos Longos, Sem QR Code)
   Com local para assinar e dados para bater com o cliente na retirada
   ============================================================================= */
function ShopCopy({ order, settings, passwordType, customPassword, customImei }: {
  order: WorkOrder;
  settings: OsPrintSettings;
  passwordType: OsPasswordType;
  customPassword?: string;
  customImei?: string;
}) {
  const total = workOrderTotal(order);
  const company = settings.company;
  const companyName = company.name?.trim() || company.tradeName?.trim() || 'MARTHI TECNOLOGIA & ASSISTÊNCIA';
  const tradeName = company.tradeName?.trim() || company.name?.trim() || 'ASSISTÊNCIA TÉCNICA ESPECIALIZADA';
  const phone = company.phone?.trim() || '(24) 99811-2200';
  const document = company.document?.trim() || '61.506.270/0001-63';
  const displayedPassword = customPassword !== undefined ? customPassword : order.devicePassword;
  const imei = resolveImei(order, customImei);

  const lines = order.lines && order.lines.length > 0
    ? order.lines
    : [
        ...(order.labor > 0
          ? [{ id: 'labor-1', name: order.defect ? `Serviço: ${order.defect}` : 'Mão de obra técnica', qty: 1, unitPrice: order.labor, unitCost: 0, kind: 'labor' as const, stockId: '' }]
          : []),
        ...(order.parts > 0
          ? [{ id: 'part-1', name: 'Peças / Componentes aplicados', qty: 1, unitPrice: order.parts, unitCost: 0, kind: 'part' as const, stockId: '' }]
          : []),
      ];

  if (lines.length === 0 && total > 0) {
    lines.push({
      id: 'default-line',
      name: order.defect || 'Serviço de manutenção / bancada',
      qty: 1,
      unitPrice: total,
      unitCost: 0,
      kind: 'labor' as const,
      stockId: '',
    });
  }

  const isPaid = order.paymentStatus === 'paid';
  const paymentMethod = order.payments && order.payments.length > 0
    ? order.payments.map((p) => `${p.method}: ${money(p.amount)}`).join(' | ')
    : (isPaid ? `Pago integralmente: ${money(total)}` : 'A receber na entrega');

  return (
    <div className="os-comm-copy os-comm-copy--shop">
      {/* Cabeçalho Compacto da Loja */}
      <div className="os-comm-header os-comm-header--compact">
        <div className="os-comm-header__brand">
          {company.logoUrl ? (
            <img src={company.logoUrl} alt={companyName} className="os-comm-header__logo-img os-comm-header__logo-img--compact" />
          ) : (
            <div className="os-comm-header__logo-badge os-comm-header__logo-badge--compact">
              <strong>{tradeName}</strong>
              <small>ASSISTÊNCIA & BANCADA</small>
            </div>
          )}
        </div>

        <div className="os-comm-header__info">
          <h2 className="os-comm-header__legal-name">{companyName.toUpperCase()}</h2>
          <div className="os-comm-header__contact-line">
            <span><strong>TEL:</strong> {phone}</span>
            {document ? <span><strong>CNPJ:</strong> {document}</span> : null}
            <span><strong>TÉCNICO:</strong> {order.technician || 'Bancada'}</span>
          </div>
        </div>

        <div className="os-comm-header__badge-wrap">
          <span className="os-comm-copy-tag os-comm-copy-tag--shop">1ª VIA · VIA DA LOJA / BANCADA</span>
        </div>
      </div>

      {/* Grade de Dados para Bater na Retirada */}
      <div className="os-comm-grid">
        <div className="os-comm-cell os-comm-cell--w15">
          <span className="os-comm-label">DATA ENTRADA</span>
          <span className="os-comm-val">{formatDate(order.createdAt)}</span>
        </div>
        <div className="os-comm-cell os-comm-cell--w15">
          <span className="os-comm-label">PREVISÃO SAÍDA</span>
          <span className="os-comm-val">{formatDate(order.estimatedReadyAt)}</span>
        </div>
        <div className="os-comm-cell os-comm-cell--w50">
          <span className="os-comm-label">CLIENTE</span>
          <span className="os-comm-val os-comm-val--customer">{order.customerName}</span>
        </div>
        <div className="os-comm-cell os-comm-cell--w20 os-comm-cell--os-num">
          <span className="os-comm-label">NÚMERO DA OS</span>
          <span className="os-comm-val os-comm-val--big-os">*{order.id}*</span>
        </div>
      </div>

      <div className="os-comm-grid">
        <div className="os-comm-cell os-comm-cell--w20">
          <span className="os-comm-label">TELEFONE CLIENTE</span>
          <span className="os-comm-val">{order.customerPhone || 'Não informado'}</span>
        </div>
        <div className="os-comm-cell os-comm-cell--w30">
          <span className="os-comm-label">EQUIPAMENTO / MODELO</span>
          <span className="os-comm-val"><strong>{order.itemModel || order.itemName}</strong></span>
        </div>
        <div className="os-comm-cell os-comm-cell--w15">
          <span className="os-comm-label">MARCA / COR</span>
          <span className="os-comm-val">{[order.itemBrand, order.itemColor].filter(Boolean).join(' · ') || 'Padrão'}</span>
        </div>
        <div className="os-comm-cell os-comm-cell--w20">
          <span className="os-comm-label">IMEI / NÚMERO DE SÉRIE</span>
          <span className="os-comm-val"><strong>{imei}</strong></span>
        </div>
        <div className="os-comm-cell os-comm-cell--w15">
          <span className="os-comm-label">VALOR TOTAL</span>
          <span className="os-comm-val os-comm-val--total">{money(total)}</span>
        </div>
      </div>

      {/* Detalhes, Defeito e Senha da Bancada (Exclusiva da 1ª Via) */}
      <div className="os-comm-grid">
        <div className="os-comm-cell os-comm-cell--flex1">
          <span className="os-comm-label">DEFEITO RECLAMADO & ESTADO DE ENTRADA</span>
          <p className="os-comm-desc-text">
            <strong>Defeito:</strong> {order.defect || 'Conforme avaliação técnica'}
            {order.conditionOnEntry ? ` | Estado: ${order.conditionOnEntry}` : ''}
            {order.accessories ? ` | Acessórios: ${order.accessories}` : ''}
            {order.notes ? ` | Obs: ${order.notes}` : ''}
          </p>
          {passwordType === 'typed' ? (
            <div className="os-comm-pwd-typed">
              <strong>SENHA DO APARELHO:</strong>{' '}
              <span className="os-comm-pwd-badge">{displayedPassword || 'Sem senha'}</span>
            </div>
          ) : null}
        </div>

        {passwordType === 'pattern' ? (
          <div className="os-comm-cell os-comm-cell--pattern os-comm-cell--pattern-compact">
            <span className="os-comm-label">SENHA (DESENHO)</span>
            <PatternLockGrid size={64} label="Padrão" />
          </div>
        ) : null}
      </div>

      {/* Resumo de Serviços Executados */}
      <div className="os-comm-table-wrap">
        <table className="os-comm-table os-comm-table--compact">
          <thead>
            <tr>
              <th style={{ width: '5%' }}>It.</th>
              <th style={{ width: '55%' }}>Serviços Executados / Peças</th>
              <th style={{ width: '10%', textAlign: 'center' }}>Qtd</th>
              <th style={{ width: '15%', textAlign: 'right' }}>Vlr. Un</th>
              <th style={{ width: '15%', textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.slice(0, 3).map((l, idx) => (
              <tr key={l.id || idx}>
                <td>{idx + 1}</td>
                <td>{l.name}</td>
                <td style={{ textAlign: 'center' }}>{l.qty || 1}</td>
                <td style={{ textAlign: 'right' }}>{money(l.unitPrice)}</td>
                <td style={{ textAlign: 'right' }}><strong>{money((l.qty || 1) * l.unitPrice)}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="os-comm-totals-notes">
                <span>Pagamento: {paymentMethod} (Pago: <strong>{isPaid ? 'SIM' : 'NÃO'}</strong>)</span>
              </td>
              <td className="os-comm-total-label"><strong>TOTAL GERAL</strong></td>
              <td className="os-comm-total-val os-comm-total-val--highlight"><strong>{money(total)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Assinatura de Entrada e Quadro de Conferência na Retirada */}
      <div className="os-comm-signatures os-comm-signatures--shop">
        <div className="os-comm-sig-block">
          <div className="os-comm-sig-line" />
          <span className="os-comm-sig-title">AUTORIZAÇÃO DO CLIENTE (ENTRADA)</span>
          <small className="os-comm-sig-sub">Autorizo os serviços e testes necessários</small>
        </div>

        <div className="os-comm-sig-block os-comm-sig-block--delivery">
          <div className="os-comm-delivery-check-box">
            <span className="os-comm-sig-title">CONFERÊNCIA NA RETIRADA DO APARELHO</span>
            <div className="os-comm-delivery-fields">
              <span>Data Retirada: ____/____/________</span>
              <span>Entregue por: __________________</span>
            </div>
            <div className="os-comm-sig-line" style={{ marginTop: 10 }} />
            <span className="os-comm-sig-title">ASSINATURA DO CLIENTE NA RETIRADA</span>
            <small className="os-comm-sig-sub">Recebi o aparelho testado e reparado</small>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =============================================================================
   2ª VIA — VIA DO CLIENTE (Com Termos de Garantia e QR Code, SEM SENHA)
   ============================================================================= */
function CustomerCopy({ order, settings, customImei }: {
  order: WorkOrder;
  settings: OsPrintSettings;
  customImei?: string;
}) {
  const total = workOrderTotal(order);
  const company = settings.company;
  const companyName = company.name?.trim() || company.tradeName?.trim() || 'MARTHI TECNOLOGIA & ASSISTÊNCIA';
  const tradeName = company.tradeName?.trim() || company.name?.trim() || 'ASSISTÊNCIA TÉCNICA ESPECIALIZADA';
  const phone = company.phone?.trim() || '(24) 99811-2200';
  const document = company.document?.trim() || '61.506.270/0001-63';
  const address = company.address?.trim() || 'Rua da Tecnologia, Centro';
  const qr = settings.qrCode;
  const imei = resolveImei(order, customImei);
  const warrantyDate = calculateWarrantyUntil(order.deliveredAt || order.createdAt, settings.warranty.defaultDays || 90);

  const lines = order.lines && order.lines.length > 0
    ? order.lines
    : [
        ...(order.labor > 0
          ? [{ id: 'labor-1', name: order.defect ? `Serviço: ${order.defect}` : 'Mão de obra técnica', qty: 1, unitPrice: order.labor, unitCost: 0, kind: 'labor' as const, stockId: '' }]
          : []),
        ...(order.parts > 0
          ? [{ id: 'part-1', name: 'Peças e insumos aplicados', qty: 1, unitPrice: order.parts, unitCost: 0, kind: 'part' as const, stockId: '' }]
          : []),
      ];

  if (lines.length === 0 && total > 0) {
    lines.push({
      id: 'default-line',
      name: order.defect || 'Serviço de assistência técnica',
      qty: 1,
      unitPrice: total,
      unitCost: 0,
      kind: 'labor' as const,
      stockId: '',
    });
  }

  const isPaid = order.paymentStatus === 'paid';
  const paymentMethod = order.payments && order.payments.length > 0
    ? order.payments.map((p) => `${p.method}: ${money(p.amount)}`).join(' | ')
    : (isPaid ? `Pago integralmente: ${money(total)}` : 'A combinar na retirada');

  return (
    <div className="os-comm-copy os-comm-copy--customer">
      {/* Cabeçalho Comercial Completo da Empresa */}
      <div className="os-comm-header">
        <div className="os-comm-header__brand">
          {company.logoUrl ? (
            <img src={company.logoUrl} alt={companyName} className="os-comm-header__logo-img" />
          ) : (
            <div className="os-comm-header__logo-badge">
              <span className="os-comm-header__logo-badge-top">SMART</span>
              <strong className="os-comm-header__logo-badge-mid">{tradeName}</strong>
              <small className="os-comm-header__logo-badge-bot">CELULAR & INFORMÁTICA</small>
            </div>
          )}
        </div>

        <div className="os-comm-header__info">
          <h2 className="os-comm-header__legal-name">{companyName.toUpperCase()}</h2>
          <p className="os-comm-header__address">
            {address}
            {company.neighborhood ? `, ${company.neighborhood}` : ''}
            {company.city ? ` — ${company.city}` : ''}
            {company.state ? `/${company.state}` : ''}
            {company.zip ? ` — CEP ${company.zip}` : ''}
          </p>
          <div className="os-comm-header__contact-line">
            <span><strong>CONTATO:</strong> {phone}</span>
            {document ? <span><strong>CNPJ:</strong> {document}</span> : null}
            {company.email ? <span><strong>E-MAIL:</strong> {company.email}</span> : null}
          </div>
        </div>

        <div className="os-comm-header__badge-wrap">
          <span className="os-comm-copy-tag os-comm-copy-tag--customer">2ª VIA · COMPROVANTE DO CLIENTE</span>
        </div>
      </div>

      {/* Grade de Entrada, Previsão, Cliente e Número da OS */}
      <div className="os-comm-grid">
        <div className="os-comm-cell os-comm-cell--w15">
          <span className="os-comm-label">DATA ENTRADA</span>
          <span className="os-comm-val">{formatDate(order.createdAt)}</span>
        </div>
        <div className="os-comm-cell os-comm-cell--w15">
          <span className="os-comm-label">PREVISÃO SAÍDA</span>
          <span className="os-comm-val">{formatDate(order.estimatedReadyAt)}</span>
        </div>
        <div className="os-comm-cell os-comm-cell--w50">
          <span className="os-comm-label">CLIENTE</span>
          <span className="os-comm-val os-comm-val--customer">{order.customerName}</span>
        </div>
        <div className="os-comm-cell os-comm-cell--w20 os-comm-cell--os-num">
          <span className="os-comm-label">NÚMERO DA OS</span>
          <span className="os-comm-val os-comm-val--big-os">*{order.id}*</span>
        </div>
      </div>

      {/* Dados do Aparelho, Contato e IMEI */}
      <div className="os-comm-grid">
        <div className="os-comm-cell os-comm-cell--w20">
          <span className="os-comm-label">TELEFONE CLIENTE</span>
          <span className="os-comm-val">{order.customerPhone || 'Não informado'}</span>
        </div>
        <div className="os-comm-cell os-comm-cell--w25">
          <span className="os-comm-label">MODELO DO APARELHO</span>
          <span className="os-comm-val"><strong>{order.itemModel || order.itemName}</strong></span>
        </div>
        <div className="os-comm-cell os-comm-cell--w15">
          <span className="os-comm-label">MARCA / COR</span>
          <span className="os-comm-val">{[order.itemBrand, order.itemColor].filter(Boolean).join(' · ') || 'Padrão'}</span>
        </div>
        <div className="os-comm-cell os-comm-cell--w25">
          <span className="os-comm-label">IMEI / NÚMERO DE SÉRIE</span>
          <span className="os-comm-val"><strong>{imei}</strong></span>
        </div>
        <div className="os-comm-cell os-comm-cell--w15">
          <span className="os-comm-label">VALOR TOTAL</span>
          <span className="os-comm-val os-comm-val--total">{money(total)}</span>
        </div>
      </div>

      {/* Defeito e Observações (SEM SENHA NA VIA DO CLIENTE) */}
      <div className="os-comm-grid">
        <div className="os-comm-cell os-comm-cell--flex1">
          <span className="os-comm-label">SERVIÇO A REALIZAR / DEFEITO INFORMADO & OBSERVAÇÕES</span>
          <p className="os-comm-desc-text">
            <strong>Defeito:</strong> {order.defect || 'Avaliação da assistência técnica'}
            {order.conditionOnEntry ? ` | Estado de entrada: ${order.conditionOnEntry}` : ''}
            {order.accessories ? ` | Acessórios deixados: ${order.accessories}` : ''}
          </p>
        </div>
      </div>

      {/* Valores e Pagamento */}
      <div className="os-comm-payment-strip">
        <div className="os-comm-payment-info">
          <span className="os-comm-label">FORMAS DE PAGAMENTO / FATURAMENTO</span>
          <span className="os-comm-val">{paymentMethod}</span>
        </div>
        <div className="os-comm-payment-status">
          <span className="os-comm-label">PAGO?</span>
          <strong className={`os-comm-paid-badge ${isPaid ? 'os-comm-paid-badge--yes' : 'os-comm-paid-badge--no'}`}>
            {isPaid ? 'SIM' : 'NÃO / NA RETIRADA'}
          </strong>
        </div>
      </div>

      {/* TERMO DE GARANTIA E QR CODE (EXCLUSIVO DA 2ª VIA DO CLIENTE) */}
      <div className="os-comm-terms-wrap">
        <div className="os-comm-terms-text">
          <span className="os-comm-label">TERMOS DE GARANTIA & CONDIÇÕES DE RETIRADA:</span>
          <p>{settings.warranty.termsText || DEFAULT_WARRANTY_TERMS}</p>
          <div className="os-comm-warranty-until">
            <strong>Garantia até:</strong> {warrantyDate} ({settings.warranty.defaultDays || 90} dias)
          </div>
          <small className="os-comm-declaration">
            Apresente este canhoto original com o número da OS para retirada do equipamento.
          </small>
        </div>

        {/* QR Code Configurável do Cliente */}
        {qr.enabled && qr.url ? (
          <div className="os-comm-qr-box">
            <QrCodeView value={qr.url} size={70} />
            <span className="os-comm-qr-label">{qr.label || 'Acesse nosso canal'}</span>
          </div>
        ) : null}
      </div>

      {/* Assinaturas da 2ª Via */}
      <div className="os-comm-signatures">
        <div className="os-comm-sig-block">
          <div className="os-comm-sig-line" />
          <span className="os-comm-sig-title">ASSINATURA DO CLIENTE</span>
          <small className="os-comm-sig-sub">{order.customerName}</small>
        </div>
        <div className="os-comm-sig-block">
          <div className="os-comm-sig-line" />
          <span className="os-comm-sig-title">{company.tradeName || company.name}</span>
          <small className="os-comm-sig-sub">Carimbo / Visto do Atendente</small>
        </div>
      </div>

      {/* Rodapé */}
      <footer className="os-comm-footer">
        <span>Página 1 de 1</span>
        <span>Emissão: {new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        <span>Atendente: {order.technician || 'Atendimento'}</span>
      </footer>
    </div>
  );
}

export function OsCommercialPrintView({ order, settings, passwordType, customPassword, customImei }: Props) {
  const showShop = settings.copies === 'both' || settings.copies === 'shop';
  const showCustomer = settings.copies === 'both' || settings.copies === 'customer';

  return (
    <article className="os-commercial-sheet">
      {/* 1ª VIA: VIA DA LOJA / BANCADA (COM SENHA, SEM TERMOS, SEM QR) */}
      {showShop ? (
        <section className="os-comm-section os-comm-section--shop">
          <ShopCopy
            order={order}
            settings={settings}
            passwordType={passwordType}
            customPassword={customPassword}
            customImei={customImei}
          />
        </section>
      ) : null}

      {/* LINHA DE CORTE E SERRILHA ENTRE AS DUAS VIAS */}
      {showShop && showCustomer ? (
        <div className="os-print-cut-divider" aria-hidden="true">
          <span className="os-print-cut-icon">✂</span>
          <span className="os-print-cut-label">
            CORTE AQUI · DESTAQUE A 2ª VIA PARA ENTREGAR AO CLIENTE
          </span>
          <span className="os-print-cut-icon">✂</span>
        </div>
      ) : null}

      {/* 2ª VIA: VIA DO CLIENTE (COM TERMOS E QR CODE, SEM SENHA) */}
      {showCustomer ? (
        <section className="os-comm-section os-comm-section--customer">
          <CustomerCopy
            order={order}
            settings={settings}
            customImei={customImei}
          />
        </section>
      ) : null}
    </article>
  );
}
