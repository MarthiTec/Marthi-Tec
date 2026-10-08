import { createPortal } from 'react-dom';
import { QrCodeView } from './QrCodeView';
import { formatCpfCnpj } from '../utils/documentUtils';
import './saleReceipt.css';

export type SaleReceipt = {
  store: { name: string; legalName?: string; document?: string; stateRegistration?: string; phone?: string; email?: string; address?: string; city?: string; logo?: string | null; instagram?: string; facebook?: string; website?: string };
  /** Para onde o QR Code leva: Instagram (ou site) da loja. */
  qr?: { url: string; label: string } | null;
  sale: {
    id: string;
    date: string;
    status?: string;
    seller: string;
    customer: { name: string; document?: string; phone?: string };
    items: Array<{ name: string; qty: number; unitPrice: number; totalPrice: number; imei?: string; attributes?: string }>;
    tradeIn: null | { device: string; imei?: string; capacity?: string; color?: string; creditValue: number };
    financial: { subtotal: number; discount: number; surcharge: number; tradeInCredit: number; totalPaid: number; paymentMethod: string; installments?: number };
    warranty: { type?: 'store' | 'manufacturer' | 'none'; months: number; terms: string };
    notes?: string;
  };
  verifyToken?: string;
};

const money = (value: number) => (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Endereço que o QR Code abre: a versão pública e assinada deste comprovante. */
export function receiptVerifyUrl(receipt: SaleReceipt) {
  if (!receipt.verifyToken) return '';
  return `${window.location.origin}/comprovante/${encodeURIComponent(receipt.sale.id)}?t=${encodeURIComponent(receipt.verifyToken)}`;
}

function addMonths(dateIso: string, months: number) {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return '';
  date.setMonth(date.getMonth() + (Number(months) || 0));
  return date.toLocaleDateString('pt-BR');
}

/**
 * Comprovante de venda com cara de nota: cabeçalho da loja, dados da venda, itens, troca,
 * totais, certificado de garantia e QR Code para conferir o documento. Não é documento fiscal.
 */
export function SaleReceiptDocument({ receipt }: { receipt: SaleReceipt }) {
  const { store, sale } = receipt;
  const f = sale.financial;
  const verifyUrl = receiptVerifyUrl(receipt);
  const qrUrl = receipt.qr?.url || verifyUrl;
  const qrLabel = receipt.qr?.label || 'Consulte este comprovante';
  const socials = [store.instagram ? `Instagram ${store.instagram}` : '', store.facebook ? `Facebook ${store.facebook}` : '', store.website || ''].filter(Boolean).join('  ·  ');
  const issued = new Date(sale.date);
  const cancelled = sale.status === 'cancelled';
  const warrantyType = sale.warranty.type ?? 'store';
  const warrantyUntil = warrantyType === 'store' && sale.warranty.months > 0 ? addMonths(sale.date, sale.warranty.months) : '';
  const warrantyTitle = warrantyType === 'none' ? 'Garantia' : 'Certificado de garantia';
  const warrantyText =
    warrantyType === 'manufacturer'
      ? 'Somente garantia do fabricante'
      : warrantyType === 'none'
        ? 'Sem garantia'
        : sale.warranty.months > 0
          ? `Garantia da loja: ${sale.warranty.months} ${sale.warranty.months === 1 ? 'mês' : 'meses'}${warrantyUntil ? ` · válida até ${warrantyUntil}` : ''}`
          : 'Sem garantia da loja';
  const subtotal = f.subtotal || sale.items.reduce((sum, item) => sum + item.totalPrice, 0);

  return (
    <article className={`sale-receipt${cancelled ? ' is-cancelled' : ''}`}>
      {cancelled ? <div className="sale-receipt__stamp">CANCELADA</div> : null}
      <header className="sale-receipt__head">
        <div className={`sale-receipt__store${store.logo ? ' has-logo' : ''}`}>
          {store.logo ? <img className="sale-receipt__logo" src={store.logo} alt="" /> : null}
          <strong>{store.name}</strong>
          {store.legalName && store.legalName !== store.name ? <span>{store.legalName}</span> : null}
          {store.document ? <span>CNPJ {formatCpfCnpj(store.document)}{store.stateRegistration ? ` · IE ${store.stateRegistration}` : ''}</span> : null}
          {store.address ? <span>{store.address}</span> : null}
          {store.phone || store.email ? <span>{[store.phone, store.email].filter(Boolean).join(' · ')}</span> : null}
        </div>
        <div className="sale-receipt__doc">
          <small>Comprovante de venda</small>
          <strong>Nº {sale.id}</strong>
          <span>{Number.isNaN(issued.getTime()) ? '' : issued.toLocaleString('pt-BR')}</span>
          <em>Documento não fiscal</em>
        </div>
      </header>

      <section className="sale-receipt__box sale-receipt__parties">
        <div>
          <small>Cliente</small>
          <strong>{sale.customer.name}</strong>
          {sale.customer.document ? <span>CPF/CNPJ: {sale.customer.document.includes('•') ? sale.customer.document : formatCpfCnpj(sale.customer.document)}</span> : null}
          {sale.customer.phone ? <span>Telefone: {sale.customer.phone}</span> : null}
        </div>
        <div>
          <small>Vendedor</small>
          <strong>{sale.seller}</strong>
          <span>Pagamento: {f.paymentMethod}{(f.installments ?? 1) > 1 ? ` em ${f.installments}x de ${money(f.totalPaid / (f.installments || 1))}` : ''}</span>
        </div>
      </section>

      <table className="sale-receipt__items">
        <thead>
          <tr>
            <th>Descrição</th>
            <th className="num">Qtd</th>
            <th className="num">Valor unit.</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, index) => (
            <tr key={`${item.name}-${index}`}>
              <td>
                <strong>{item.name}</strong>
                {item.attributes ? <span>{item.attributes}</span> : null}
                {item.imei ? <span>IMEI/Série: {item.imei}</span> : null}
              </td>
              <td className="num">{item.qty}</td>
              <td className="num">{money(item.unitPrice)}</td>
              <td className="num">{money(item.totalPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {sale.tradeIn ? (
        <section className="sale-receipt__box">
          <small>Aparelho recebido na troca (upgrade)</small>
          <div className="sale-receipt__row">
            <span>
              <strong>{sale.tradeIn.device}</strong>
              {[sale.tradeIn.capacity, sale.tradeIn.color].filter(Boolean).length ? ` · ${[sale.tradeIn.capacity, sale.tradeIn.color].filter(Boolean).join(' · ')}` : ''}
              {sale.tradeIn.imei ? ` · IMEI ${sale.tradeIn.imei}` : ''}
            </span>
            <strong>- {money(sale.tradeIn.creditValue)}</strong>
          </div>
        </section>
      ) : null}

      <section className="sale-receipt__totals">
        <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
        {f.discount > 0 ? <div><span>Desconto</span><span>- {money(f.discount)}</span></div> : null}
        {f.surcharge > 0 ? <div><span>Acréscimo</span><span>{money(f.surcharge)}</span></div> : null}
        {f.tradeInCredit > 0 ? <div><span>Crédito do aparelho usado</span><span>- {money(f.tradeInCredit)}</span></div> : null}
        <div className="is-total"><span>Total pago</span><span>{money(f.totalPaid)}</span></div>
      </section>

      <section className="sale-receipt__box sale-receipt__warranty">
        <div className="sale-receipt__row">
          <small>{warrantyTitle}</small>
          <strong>{warrantyText}</strong>
        </div>
        <p>{sale.warranty.terms}</p>
        {sale.notes ? <p><strong>Observações:</strong> {sale.notes}</p> : null}
      </section>

      <footer className="sale-receipt__foot">
        {qrUrl ? (
          <div className="sale-receipt__qr">
            <QrCodeView value={qrUrl} size={120} />
            <div>
              <strong>{qrLabel}</strong>
              <span>Aponte a câmera do celular para o código ou acesse:</span>
              <code>{qrUrl}</code>
            </div>
          </div>
        ) : null}
        <div className="sale-receipt__signs">
          <div><i /> <span>Cliente</span></div>
          <div><i /> <span>{store.name}</span></div>
        </div>
        {socials ? <p className="sale-receipt__socials">{socials}</p> : null}
        <p className="sale-receipt__legal">Este comprovante não substitui a nota fiscal. Guarde-o para usar a garantia.</p>
      </footer>
    </article>
  );
}

/**
 * Imprime só o comprovante: ele é colocado fora do resto da tela e o CSS de impressão esconde todo o
 * restante (a janela do sistema não sai no papel).
 */
export function PrintableReceipt({ receipt }: { receipt: SaleReceipt }) {
  return createPortal(
    <div className="sale-receipt-print">
      <SaleReceiptDocument receipt={receipt} />
    </div>,
    document.body,
  );
}
