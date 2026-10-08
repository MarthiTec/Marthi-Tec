import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

/** Mesmo formato devolvido por GET /sales/:id/receipt. */
export type ReceiptData = {
  store: {
    name: string; legalName?: string; document?: string; stateRegistration?: string; phone?: string; email?: string;
    address?: string; logo?: string | null; instagram?: string; facebook?: string; website?: string;
  };
  qr?: { url: string; label: string } | null;
  sale: {
    id: string; date: string; status?: string; seller: string;
    customer: { name: string; document?: string; phone?: string };
    items: Array<{ name: string; qty: number; unitPrice: number; totalPrice: number; imei?: string; attributes?: string }>;
    tradeIn: null | { device: string; imei?: string; capacity?: string; color?: string; creditValue: number };
    financial: { subtotal: number; discount: number; surcharge: number; tradeInCredit: number; totalPaid: number; paymentMethod: string; installments?: number };
    warranty: { type?: 'store' | 'manufacturer' | 'none'; months: number; terms: string };
    notes?: string;
  };
};

const money = (value: number) => (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function formatDocument(value = '') {
  const d = value.replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return value;
}

function warrantyText(warranty: ReceiptData['sale']['warranty'], date: string) {
  if (warranty.type === 'manufacturer') return 'Somente garantia do fabricante';
  if (warranty.type === 'none') return 'Sem garantia';
  if (!warranty.months) return 'Sem garantia da loja';
  const until = new Date(date);
  until.setMonth(until.getMonth() + warranty.months);
  return `Garantia da loja: ${warranty.months} ${warranty.months === 1 ? 'mês' : 'meses'} · válida até ${until.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
}

function imageFormat(dataUrl: string) {
  const match = /^data:image\/(png|jpe?g|webp)/i.exec(dataUrl);
  if (!match) return null;
  return match[1].toLowerCase().startsWith('jp') ? 'JPEG' : match[1].toUpperCase();
}

/**
 * Comprovante de venda em PDF (A4), no mesmo desenho do impresso: loja com logo, dados da venda,
 * itens, troca, totais, garantia, QR Code (Instagram/site da loja) e assinaturas. Não é fiscal.
 */
export async function buildReceiptPdf(receipt: ReceiptData, fallbackQrUrl = ''): Promise<Buffer> {
  const { store, sale } = receipt;
  const f = sale.financial;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const W = 210;
  const M = 12;
  const inner = W - M * 2;
  let y = M;

  const text = (value: string, x: number, yy: number, opts: { size?: number; bold?: boolean; color?: number; align?: 'left' | 'right' | 'center'; max?: number } = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size ?? 9);
    doc.setTextColor(opts.color ?? 17);
    const lines = opts.max ? doc.splitTextToSize(value, opts.max) : [value];
    doc.text(lines, x, yy, { align: opts.align ?? 'left' });
    return lines.length * (opts.size ?? 9) * 0.42;
  };
  const label = (value: string, x: number, yy: number) => text(value.toUpperCase(), x, yy, { size: 6.5, bold: true, color: 85 });
  const ensure = (needed: number) => {
    if (y + needed > 285) {
      doc.addPage();
      y = M;
    }
  };

  // Cabeçalho: loja (com logo) à esquerda, documento à direita.
  const headH = 32;
  doc.setDrawColor(17);
  doc.setLineWidth(0.4);
  doc.rect(M, y, inner, headH);
  doc.line(W - M - 58, y, W - M - 58, y + headH);
  let storeX = M + 4;
  if (store.logo) {
    const format = imageFormat(store.logo);
    if (format) {
      try {
        doc.addImage(store.logo, format, M + 3, y + 4, 24, 24, undefined, 'FAST');
        storeX = M + 31;
      } catch {
        storeX = M + 4;
      }
    }
  }
  const storeMax = W - M - 58 - storeX - 3;
  let sy = y + 7;
  sy += text(store.name, storeX, sy, { size: 13, bold: true, max: storeMax });
  if (store.legalName && store.legalName !== store.name) sy += text(store.legalName, storeX, sy, { size: 8, max: storeMax });
  if (store.document) sy += text(`CNPJ ${formatDocument(store.document)}${store.stateRegistration ? ` · IE ${store.stateRegistration}` : ''}`, storeX, sy, { size: 8, max: storeMax });
  if (store.address) sy += text(store.address, storeX, sy, { size: 8, max: storeMax });
  const contact = [store.phone, store.email].filter(Boolean).join(' · ');
  if (contact) text(contact, storeX, sy, { size: 8, max: storeMax });
  const cx = W - M - 29;
  text('COMPROVANTE DE VENDA', cx, y + 7, { size: 6.5, bold: true, color: 85, align: 'center' });
  text(`Nº ${sale.id}`, cx, y + 13, { size: 9.5, bold: true, align: 'center', max: 54 });
  text(new Date(sale.date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), cx, y + 19, { size: 8, align: 'center' });
  doc.rect(cx - 21, y + 23, 42, 6);
  text('DOCUMENTO NÃO FISCAL', cx, y + 27, { size: 6.5, bold: true, align: 'center' });
  y += headH + 4;

  // Cliente e vendedor.
  doc.rect(M, y, inner, 20);
  label('Cliente', M + 4, y + 5);
  text(sale.customer.name, M + 4, y + 10, { size: 10, bold: true, max: inner / 2 - 8 });
  const customerExtra = [sale.customer.document ? `CPF/CNPJ: ${sale.customer.document.includes('•') ? sale.customer.document : formatDocument(sale.customer.document)}` : '', sale.customer.phone ? `Telefone: ${sale.customer.phone}` : ''].filter(Boolean).join('   ');
  if (customerExtra) text(customerExtra, M + 4, y + 15, { size: 8 });
  const half = M + inner / 2 + 2;
  label('Vendedor', half, y + 5);
  text(sale.seller, half, y + 10, { size: 10, bold: true });
  const parcels = (f.installments ?? 1) > 1 ? ` em ${f.installments}x de ${money(f.totalPaid / (f.installments || 1))}` : '';
  text(`Pagamento: ${f.paymentMethod}${parcels}`, half, y + 15, { size: 8, max: inner / 2 - 6 });
  y += 24;

  // Itens.
  const cols = { qty: W - M - 72, unit: W - M - 36, total: W - M - 3 };
  const itemsTop = y;
  let itemsPage = doc.getNumberOfPages();
  doc.setFillColor(238, 238, 238);
  doc.rect(M, y, inner, 7, 'FD');
  label('Descrição', M + 3, y + 4.7);
  label('Qtd', cols.qty - 4, y + 4.7);
  label('Valor unit.', cols.unit - 14, y + 4.7);
  label('Total', cols.total - 8, y + 4.7);
  y += 7;
  for (const item of sale.items) {
    const details = [item.attributes, item.imei ? `IMEI/Série: ${item.imei}` : ''].filter(Boolean);
    const rowH = 7 + details.length * 3.8;
    ensure(rowH);
    if (doc.getNumberOfPages() !== itemsPage) itemsPage = -1;
    text(item.name, M + 3, y + 5, { size: 9, bold: true, max: cols.qty - M - 12 });
    details.forEach((detail, i) => text(detail!, M + 3, y + 8.8 + i * 3.8, { size: 7.5, color: 68, max: cols.qty - M - 12 }));
    text(String(item.qty), cols.qty, y + 5, { size: 9, align: 'right' });
    text(money(item.unitPrice), cols.unit, y + 5, { size: 9, align: 'right' });
    text(money(item.totalPrice), cols.total, y + 5, { size: 9, align: 'right' });
    doc.setDrawColor(190);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(M, y + rowH, W - M, y + rowH);
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(17);
    y += rowH;
  }
  // Moldura da tabela (quando ela coube numa página só).
  if (itemsPage !== -1) doc.rect(M, itemsTop, inner, y - itemsTop);
  y += 4;

  // Troca (upgrade).
  if (sale.tradeIn) {
    ensure(16);
    doc.rect(M, y, inner, 13);
    label('Aparelho recebido na troca (upgrade)', M + 4, y + 5);
    const extras = [sale.tradeIn.capacity, sale.tradeIn.color, sale.tradeIn.imei ? `IMEI ${sale.tradeIn.imei}` : ''].filter(Boolean).join(' · ');
    text(`${sale.tradeIn.device}${extras ? ` · ${extras}` : ''}`, M + 4, y + 10, { size: 9, bold: true, max: inner - 50 });
    text(`- ${money(sale.tradeIn.creditValue)}`, W - M - 4, y + 10, { size: 10, bold: true, align: 'right' });
    y += 17;
  }

  // Totais.
  const totals: Array<[string, string]> = [['Subtotal', money(f.subtotal || sale.items.reduce((s, it) => s + it.totalPrice, 0))]];
  if (f.discount > 0) totals.push(['Desconto', `- ${money(f.discount)}`]);
  if (f.surcharge > 0) totals.push(['Acréscimo', money(f.surcharge)]);
  if (f.tradeInCredit > 0) totals.push(['Crédito do aparelho usado', `- ${money(f.tradeInCredit)}`]);
  const totalsH = totals.length * 5 + 12;
  ensure(totalsH + 4);
  const tx = W - M - 80;
  doc.rect(tx, y, 80, totalsH);
  totals.forEach(([k, v], i) => {
    text(k, tx + 4, y + 6 + i * 5, { size: 8.5 });
    text(v, W - M - 4, y + 6 + i * 5, { size: 8.5, align: 'right' });
  });
  const ty = y + 6 + totals.length * 5;
  doc.line(tx + 3, ty - 2.5, W - M - 3, ty - 2.5);
  text('Total pago', tx + 4, ty + 3, { size: 11, bold: true });
  text(money(f.totalPaid), W - M - 4, ty + 3, { size: 11, bold: true, align: 'right' });
  y += totalsH + 4;

  // Garantia.
  doc.setFontSize(8.5);
  const termsLines = doc.splitTextToSize(sale.warranty.terms || '', inner - 8);
  const notesLines = sale.notes ? doc.splitTextToSize(`Observações: ${sale.notes}`, inner - 8) : [];
  const warrantyH = 12 + (termsLines.length + notesLines.length) * 3.8;
  ensure(warrantyH + 4);
  doc.rect(M, y, inner, warrantyH);
  label(sale.warranty.type === 'none' ? 'Garantia' : 'Certificado de garantia', M + 4, y + 5);
  text(warrantyText(sale.warranty, sale.date), W - M - 4, y + 5.5, { size: 9, bold: true, align: 'right' });
  text(termsLines.join('\n'), M + 4, y + 10.5, { size: 8.5, color: 51 });
  if (notesLines.length) text(notesLines.join('\n'), M + 4, y + 10.5 + termsLines.length * 3.8, { size: 8.5, color: 51 });
  y += warrantyH + 4;

  // QR Code: Instagram/site da loja (ou a conferência do comprovante).
  const qrUrl = receipt.qr?.url || fallbackQrUrl;
  if (qrUrl) {
    ensure(34);
    doc.rect(M, y, inner, 30);
    const qr = await QRCode.toDataURL(qrUrl, { margin: 1, width: 300, errorCorrectionLevel: 'M' });
    doc.addImage(qr, 'PNG', M + 3, y + 2, 26, 26);
    text(receipt.qr?.label || 'Consulte este comprovante', M + 33, y + 10, { size: 10, bold: true });
    text('Aponte a câmera do celular para o código ou acesse:', M + 33, y + 15, { size: 8, color: 68 });
    text(qrUrl, M + 33, y + 20, { size: 7.5, color: 68, max: inner - 36 });
    y += 34;
  }

  // Assinaturas e rodapé.
  ensure(30);
  y += 12;
  doc.line(M + 6, y, M + inner / 2 - 8, y);
  doc.line(M + inner / 2 + 8, y, W - M - 6, y);
  text('Cliente', M + inner / 4, y + 4, { size: 8, align: 'center' });
  text(store.name, M + (inner * 3) / 4, y + 4, { size: 8, align: 'center' });
  y += 11;
  const socials = [store.instagram ? `Instagram ${store.instagram}` : '', store.facebook ? `Facebook ${store.facebook}` : '', store.website || ''].filter(Boolean).join('  ·  ');
  if (socials) {
    text(socials, W / 2, y, { size: 8, align: 'center', max: inner });
    y += 5;
  }
  text('Este comprovante não substitui a nota fiscal. Guarde-o para usar a garantia.', W / 2, y, { size: 7.5, color: 85, align: 'center' });

  if (sale.status === 'cancelled') {
    doc.setTextColor(185, 28, 28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(48);
    doc.text('CANCELADA', W / 2, 150, { align: 'center', angle: 18 });
  }

  return Buffer.from(doc.output('arraybuffer'));
}
