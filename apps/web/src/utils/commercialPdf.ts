import { jsPDF } from 'jspdf';
import type { PosQuote } from '../data/posQuotesStore';
import type { CompanyPrintData } from '../data/osPrintSettings';
import type { WorkOrder } from '../data/osStore';

function money(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** Formata número de telefone para WhatsApp com DDI 55 */
export function formatWhatsAppUrl(phone: string, text: string): string {
  const cleanPhone = phone.replace(/\D/g, '');
  const encodedText = encodeURIComponent(text);
  if (cleanPhone.length >= 10) {
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    return `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}

/** Tenta compartilhar arquivo via Web Share API ou faz download e abre WhatsApp */
export async function shareOrSendWhatsAppWithFile({
  phone,
  text,
  pdfBlob,
  fileName,
  onNotify,
}: {
  phone: string;
  text: string;
  pdfBlob: Blob;
  fileName: string;
  onNotify?: (msg: string) => void;
}) {
  const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
  const waUrl = formatWhatsAppUrl(phone, text);

  // 1. Tenta compartilhamento nativo com o arquivo PDF (Mobile/Chrome)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: fileName,
        text,
      });
      onNotify?.('PDF e mensagem compartilhados com sucesso!');
      return;
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      // Se falhou, continua com fallback desktop
    }
  }

  // 2. Fallback Desktop: Baixa o PDF no computador e abre o WhatsApp Web
  downloadBlob(pdfBlob, fileName);
  window.open(waUrl, '_blank', 'noopener,noreferrer');
  onNotify?.(
    '📄 O PDF foi baixado para o seu computador e o WhatsApp Web foi aberto. Basta arrastar o PDF para a conversa!',
  );
}

/** Prepara e-mail via mailto e baixa o PDF anexo */
export function sendEmailWithPdf({
  email,
  subject,
  body,
  pdfBlob,
  fileName,
  onNotify,
}: {
  email: string;
  subject: string;
  body: string;
  pdfBlob: Blob;
  fileName: string;
  onNotify?: (msg: string) => void;
}) {
  downloadBlob(pdfBlob, fileName);
  const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailtoUrl;
  onNotify?.(
    `📧 Cliente de e-mail aberto para ${email}. O PDF foi baixado para você anexar ao e-mail!`,
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ==========================================================================
   1. GERAÇÃO DE PDF — PROPOSTA / ORÇAMENTO COMERCIAL
   ========================================================================== */

export function buildQuotePdfDoc(quote: PosQuote, company: CompanyPrintData): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  let y = 14;

  const companyTitle = company.tradeName || company.name || 'MARTHI TECNOLOGIA';

  // Cabeçalho da Empresa
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(companyTitle.toUpperCase(), marginX, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // slate-600
  y += 4.5;
  if (company.document) {
    doc.text(`CNPJ: ${company.document}${company.ie ? ` · IE: ${company.ie}` : ''}`, marginX, y);
    y += 4;
  }
  const addr = [company.address, company.neighborhood, company.city, company.state]
    .filter(Boolean)
    .join(', ');
  if (addr) {
    doc.text(addr, marginX, y);
    y += 4;
  }
  if (company.phone || company.email) {
    doc.text(`Tel/WhatsApp: ${company.phone || '—'} · E-mail: ${company.email || '—'}`, marginX, y);
    y += 4;
  }

  // Caixa da Proposta no Canto Direito Superior
  const boxW = 65;
  const boxH = 26;
  const boxX = pageWidth - marginX - boxW;
  const boxY = 11;
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text('ORÇAMENTO COMERCIAL', boxX + boxW / 2, boxY + 6, { align: 'center' });

  doc.setFontSize(13);
  doc.setTextColor(2, 132, 199); // sky-600
  doc.text(`Nº ${quote.quoteNumber}`, boxX + boxW / 2, boxY + 12, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Emissão: ${formatDate(quote.createdAt)}`, boxX + 4, boxY + 17);
  doc.text(`Validade: ${formatDate(quote.expiresAt)}`, boxX + 4, boxY + 21);
  if (quote.sellerName) {
    doc.text(`Vendedor: ${quote.sellerName}`, boxX + 4, boxY + 25);
  }

  y = Math.max(y + 3, boxY + boxH + 4);

  // Linha separadora
  doc.setDrawColor(226, 232, 240);
  doc.line(marginX, y, marginX + contentWidth, y);
  y += 5;

  // Caixa Dados do Cliente
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(marginX, y, contentWidth, 18, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('DADOS DO CLIENTE / DESTINATÁRIO', marginX + 4, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`Cliente: ${quote.customerName || 'Consumidor Final'}`, marginX + 4, y + 10);
  doc.text(`CPF/CNPJ: ${quote.customerDocument || 'Não informado'}`, marginX + 95, y + 10);
  doc.text(`Telefone: ${quote.customerPhone || 'Não informado'}`, marginX + 4, y + 15);
  doc.text(`E-mail: ${quote.customerEmail || 'Não informado'}`, marginX + 95, y + 15);

  y += 23;

  // Tabela de Itens
  doc.setFillColor(15, 23, 42); // slate-900 header
  doc.rect(marginX, y, contentWidth, 6.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('#', marginX + 2, y + 4.5);
  doc.text('CÓDIGO', marginX + 9, y + 4.5);
  doc.text('DESCRIÇÃO DO PRODUTO / MATERIAL', marginX + 32, y + 4.5);
  doc.text('UN', marginX + 112, y + 4.5, { align: 'center' });
  doc.text('QTD', marginX + 128, y + 4.5, { align: 'right' });
  doc.text('UNITÁRIO', marginX + 150, y + 4.5, { align: 'right' });
  doc.text('DESC.', marginX + 165, y + 4.5, { align: 'right' });
  doc.text('TOTAL', marginX + contentWidth - 2, y + 4.5, { align: 'right' });

  y += 6.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  quote.lines.forEach((line, idx) => {
    const isEven = idx % 2 === 1;
    if (isEven) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, y, contentWidth, 6, 'F');
    }

    doc.setTextColor(100, 116, 139);
    doc.text(String(idx + 1), marginX + 2, y + 4.2);
    doc.text((line.sku || line.stockId?.slice(0, 8) || '—').slice(0, 10), marginX + 9, y + 4.2);

    doc.setTextColor(15, 23, 42);
    const prodName = line.name.length > 46 ? `${line.name.slice(0, 44)}…` : line.name;
    doc.text(prodName, marginX + 32, y + 4.2);

    doc.text(line.unit || 'UN', marginX + 112, y + 4.2, { align: 'center' });
    doc.text(line.qty.toLocaleString('pt-BR', { maximumFractionDigits: 2 }), marginX + 128, y + 4.2, {
      align: 'right',
    });
    doc.text(money(line.unitPrice), marginX + 150, y + 4.2, { align: 'right' });
    doc.text(line.lineDiscount > 0 ? money(line.lineDiscount) : '—', marginX + 165, y + 4.2, {
      align: 'right',
    });

    doc.setFont('helvetica', 'bold');
    doc.text(money(line.total), marginX + contentWidth - 2, y + 4.2, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    doc.setDrawColor(241, 245, 249);
    doc.line(marginX, y + 6, marginX + contentWidth, y + 6);

    y += 6;
  });

  y += 4;

  // Caixa de Condições Comerciais + Totais (Lado a lado)
  const blockW = contentWidth / 2 - 3;

  // Coluna Esquerda: Condições Comerciais
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(marginX, y, blockW, 26, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('CONDIÇÕES COMERCIAIS', marginX + 4, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Pagamento: ${quote.paymentConditions || 'Conforme acordado no fechamento'}`,
    marginX + 4,
    y + 10,
  );
  doc.text(
    `Entrega: ${quote.deliveryTerm || 'Disponibilidade imediata / Sob consulta'}`,
    marginX + 4,
    y + 14,
  );
  doc.text(
    `Validade: ${quote.validityDays} dias (até ${formatDate(quote.expiresAt)})`,
    marginX + 4,
    y + 18,
  );
  if (quote.notes) {
    const cleanNotes = quote.notes.replace(/[\n\r]+/g, ' ');
    doc.text(`Obs: ${cleanNotes.slice(0, 48)}`, marginX + 4, y + 22);
  }

  // Coluna Direita: Resumo Financeiro
  const totX = marginX + blockW + 6;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(totX, y, blockW, 26, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Subtotal dos Itens:', totX + 4, y + 6);
  doc.setTextColor(15, 23, 42);
  doc.text(money(quote.subtotal), totX + blockW - 4, y + 6, { align: 'right' });

  let curY = y + 10.5;
  if (quote.discount > 0) {
    doc.setTextColor(220, 38, 38);
    doc.text('Desconto Comercial:', totX + 4, curY);
    doc.text(`-${money(quote.discount)}`, totX + blockW - 4, curY, { align: 'right' });
    curY += 4.5;
  }
  if (quote.surcharge > 0) {
    doc.setTextColor(37, 99, 235);
    doc.text('Acréscimo / Frete:', totX + 4, curY);
    doc.text(`+${money(quote.surcharge)}`, totX + blockW - 4, curY, { align: 'right' });
    curY += 4.5;
  }

  // Linha de Total Geral
  doc.setDrawColor(15, 23, 42);
  doc.line(totX + 4, curY, totX + blockW - 4, curY);
  curY += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('TOTAL DA PROPOSTA:', totX + 4, curY);
  doc.text(money(quote.total), totX + blockW - 4, curY, { align: 'right' });

  y += 31;

  // Disclaimer Legal
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  const disclaimer =
    '* Os preços e condições ofertados nesta proposta comercial estão garantidos até a data de validade indicada. A confirmação do pedido está sujeita à disponibilidade de estoque no ato do fechamento/faturamento.';
  doc.text(disclaimer, marginX, y, { maxWidth: contentWidth });

  y += 14;

  // Assinaturas
  const sigW = 68;
  const sig1X = marginX + 12;
  const sig2X = marginX + contentWidth - sigW - 12;

  doc.setDrawColor(15, 23, 42);
  doc.line(sig1X, y, sig1X + sigW, y);
  doc.line(sig2X, y, sig2X + sigW, y);

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(companyTitle, sig1X + sigW / 2, y, { align: 'center' });
  doc.text(quote.customerName || 'Cliente / Responsável', sig2X + sigW / 2, y, { align: 'center' });

  y += 3.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Emissor: ${quote.sellerName || 'Atendimento'}`, sig1X + sigW / 2, y, {
    align: 'center',
  });
  doc.text('De acordo / Assinatura do Cliente', sig2X + sigW / 2, y, { align: 'center' });

  return doc;
}

export function generateQuotePdfBlob(quote: PosQuote, company: CompanyPrintData): Blob {
  const doc = buildQuotePdfDoc(quote, company);
  return doc.output('blob');
}

export function downloadQuotePdf(quote: PosQuote, company: CompanyPrintData) {
  const blob = generateQuotePdfBlob(quote, company);
  const fileName = `Proposta_Comercial_${quote.quoteNumber}.pdf`;
  downloadBlob(blob, fileName);
}

/* ==========================================================================
   2. GERAÇÃO DE PDF — ORDEM DE SERVIÇO (OS)
   ========================================================================== */

export function buildOsPdfDoc(order: WorkOrder, company: CompanyPrintData): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  let y = 14;

  const companyTitle = company.tradeName || company.name || 'MARTHI ASSISTÊNCIA TÉCNICA';

  // Cabeçalho da Empresa
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(companyTitle.toUpperCase(), marginX, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  y += 4.5;
  if (company.document) {
    doc.text(`CNPJ: ${company.document} · Tel: ${company.phone || '—'}`, marginX, y);
    y += 4;
  }
  const addr = [company.address, company.city, company.state].filter(Boolean).join(', ');
  if (addr) {
    doc.text(addr, marginX, y);
    y += 4;
  }

  // Caixa da OS no Canto Direito
  const boxW = 60;
  const boxH = 22;
  const boxX = pageWidth - marginX - boxW;
  const boxY = 11;
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text('ORDEM DE SERVIÇO', boxX + boxW / 2, boxY + 6, { align: 'center' });

  doc.setFontSize(14);
  doc.setTextColor(2, 132, 199);
  doc.text(`#${order.id}`, boxX + boxW / 2, boxY + 13, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Entrada: ${formatDate(order.createdAt)}`, boxX + 4, boxY + 18);

  y = Math.max(y + 3, boxY + boxH + 4);

  // Linha divisória
  doc.setDrawColor(226, 232, 240);
  doc.line(marginX, y, marginX + contentWidth, y);
  y += 5;

  // Caixa Cliente e Aparelho
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(marginX, y, contentWidth, 22, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('DADOS DO CLIENTE & EQUIPAMENTO', marginX + 4, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`Cliente: ${order.customerName || 'Cliente Balcão'}`, marginX + 4, y + 10);
  doc.text(`Telefone: ${order.customerPhone || 'Não informado'}`, marginX + 95, y + 10);
  doc.text(`E-mail: ${order.customerEmail || 'Não informado'}`, marginX + 4, y + 15);
  doc.text(`CPF/CNPJ: ${order.customerDocument || 'Não informado'}`, marginX + 95, y + 15);

  const equip = [order.itemName, order.itemBrand, order.itemModel].filter(Boolean).join(' - ');
  doc.text(`Equipamento: ${equip || 'Não especificado'}`, marginX + 4, y + 20);
  if (order.itemRef) {
    doc.text(`IMEI/Série: ${order.itemRef}`, marginX + 95, y + 20);
  }

  y += 27;

  // Relato de Defeito / Diagnóstico
  doc.setFillColor(254, 242, 242);
  doc.roundedRect(marginX, y, contentWidth, 16, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(185, 28, 28);
  doc.text('DEFEITO RECLAMADO / LAUDO TÉCNICO', marginX + 4, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Defeito: ${order.defect || 'Não informado'}`, marginX + 4, y + 10, {
    maxWidth: contentWidth - 8,
  });
  if (order.diagnosis) {
    doc.text(`Diagnóstico: ${order.diagnosis}`, marginX + 4, y + 14, { maxWidth: contentWidth - 8 });
  }

  y += 21;

  // Tabela de Serviços e Peças
  doc.setFillColor(15, 23, 42);
  doc.rect(marginX, y, contentWidth, 6.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('SERVIÇOS EXECUTADOS & PEÇAS SUBSTITUÍDAS', marginX + 4, y + 4.5);
  doc.text('QTD', marginX + 130, y + 4.5, { align: 'right' });
  doc.text('UNITÁRIO', marginX + 155, y + 4.5, { align: 'right' });
  doc.text('TOTAL', marginX + contentWidth - 4, y + 4.5, { align: 'right' });

  y += 6.5;

  let totalOs = 0;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  if (order.lines && order.lines.length > 0) {
    order.lines.forEach((l, idx) => {
      const lineTotal = l.qty * l.unitPrice;
      totalOs += lineTotal;
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, y, contentWidth, 6, 'F');
      }
      doc.setTextColor(15, 23, 42);
      doc.text(`${l.kind === 'part' ? '[Peça]' : '[Serviço]'} ${l.name}`, marginX + 4, y + 4.2);
      doc.text(String(l.qty), marginX + 130, y + 4.2, { align: 'right' });
      doc.text(money(l.unitPrice), marginX + 155, y + 4.2, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(money(lineTotal), marginX + contentWidth - 4, y + 4.2, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += 6;
    });
  } else {
    doc.setTextColor(100, 116, 139);
    doc.text('Nenhum serviço/peça adicional lançado.', marginX + 4, y + 4.5);
    y += 6;
  }

  y += 4;

  // Caixa de Total
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(marginX + contentWidth - 65, y, 65, 12, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('TOTAL DA OS:', marginX + contentWidth - 61, y + 8);
  doc.text(money(totalOs), marginX + contentWidth - 4, y + 8, { align: 'right' });

  y += 18;

  // Termos de Garantia e Condições
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('TERMOS DE RETIRADA E GARANTIA:', marginX, y);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  const terms =
    '1. A garantia legal cobre defeitos das peças substituídas e serviços executados pelo prazo legal (90 dias). Não cobre danos por choque físico, quedas ou líquidos.\n2. Equipamentos prontos não retirados em até 90 dias após notificação poderão ser desfeitos ou cobradas taxas de armazenamento.';
  doc.text(terms, marginX, y, { maxWidth: contentWidth });

  y += 18;

  // Assinaturas
  const sigW = 68;
  const sig1X = marginX + 12;
  const sig2X = marginX + contentWidth - sigW - 12;

  doc.setDrawColor(15, 23, 42);
  doc.line(sig1X, y, sig1X + sigW, y);
  doc.line(sig2X, y, sig2X + sigW, y);

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(companyTitle, sig1X + sigW / 2, y, { align: 'center' });
  doc.text(order.customerName || 'Cliente', sig2X + sigW / 2, y, { align: 'center' });

  y += 3.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text('Técnico / Responsável', sig1X + sigW / 2, y, { align: 'center' });
  doc.text('Retirada / De acordo', sig2X + sigW / 2, y, { align: 'center' });

  return doc;
}

export function generateOsPdfBlob(order: WorkOrder, company: CompanyPrintData): Blob {
  const doc = buildOsPdfDoc(order, company);
  return doc.output('blob');
}

export function downloadOsPdf(order: WorkOrder, company: CompanyPrintData) {
  const blob = generateOsPdfBlob(order, company);
  const fileName = `Ordem_Servico_${order.id}.pdf`;
  downloadBlob(blob, fileName);
}

/* ==========================================================================
   3. GERAÇÃO DE PDF — CERTIFICADO & TERMO DE GARANTIA
   ========================================================================== */

export function buildWarrantyPdfDoc({
  order,
  company,
  warrantyItems,
  deliveryDate,
}: {
  order: WorkOrder;
  company: CompanyPrintData;
  warrantyItems: Array<{ id: string; name: string; days: number; kind: string }>;
  deliveryDate?: string;
}): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  let y = 14;

  const companyTitle = company.tradeName || company.name || 'MARTHI ASSISTÊNCIA TÉCNICA';

  // Cabeçalho Oficial
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(companyTitle.toUpperCase(), marginX, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  y += 4.5;
  if (company.document) {
    doc.text(`CNPJ: ${company.document} · Tel/WhatsApp: ${company.phone || '—'}`, marginX, y);
    y += 4;
  }
  const addr = [company.address, company.city, company.state].filter(Boolean).join(', ');
  if (addr) {
    doc.text(addr, marginX, y);
    y += 4;
  }

  // Caixa Certificado de Garantia no Canto Direito
  const boxW = 65;
  const boxH = 22;
  const boxX = pageWidth - marginX - boxW;
  const boxY = 11;
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text('CERTIFICADO DE GARANTIA', boxX + boxW / 2, boxY + 6, { align: 'center' });

  doc.setFontSize(13);
  doc.setTextColor(16, 185, 129); // emerald-600
  doc.text(`OS #${order.id}`, boxX + boxW / 2, boxY + 12.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Entrega: ${formatDate(deliveryDate || order.updatedAt)}`, boxX + 4, boxY + 18);

  y = Math.max(y + 3, boxY + boxH + 4);

  // Linha divisória
  doc.setDrawColor(226, 232, 240);
  doc.line(marginX, y, marginX + contentWidth, y);
  y += 5;

  // Beneficiário e Equipamento
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(marginX, y, contentWidth, 18, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('BENEFICIÁRIO & EQUIPAMENTO COBERTO', marginX + 4, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(`Cliente: ${order.customerName || 'Cliente Balcão'}`, marginX + 4, y + 10);
  doc.text(`CPF/CNPJ: ${order.customerDocument || 'Não informado'}`, marginX + 95, y + 10);

  const equip = [order.itemName, order.itemBrand, order.itemModel].filter(Boolean).join(' - ');
  doc.text(`Equipamento: ${equip || 'Não especificado'}`, marginX + 4, y + 15);
  if (order.itemRef) {
    doc.text(`IMEI/Série: ${order.itemRef}`, marginX + 95, y + 15);
  }

  y += 24;

  // Tabela de Prazos por Peça e Serviço
  doc.setFillColor(15, 23, 42);
  doc.rect(marginX, y, contentWidth, 6.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('DISCRIMINAÇÃO DOS SERVIÇOS & PRAZOS DE GARANTIA', marginX + 4, y + 4.5);
  doc.text('TIPO', marginX + 115, y + 4.5);
  doc.text('PRAZO VIGENTE', marginX + contentWidth - 4, y + 4.5, { align: 'right' });

  y += 6.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  if (warrantyItems.length > 0) {
    warrantyItems.forEach((it, idx) => {
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, y, contentWidth, 6, 'F');
      }
      doc.setTextColor(15, 23, 42);
      doc.text(it.name, marginX + 4, y + 4.2);
      doc.text(it.kind === 'part' ? 'Peça de reposição' : 'Mão de obra técnica', marginX + 115, y + 4.2);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(5, 150, 105);
      doc.text(`${it.days} dias de garantia`, marginX + contentWidth - 4, y + 4.2, {
        align: 'right',
      });
      doc.setFont('helvetica', 'normal');
      y += 6;
    });
  } else {
    doc.setTextColor(100, 116, 139);
    doc.text('Garantia legal integral sobre a Ordem de Serviço: 90 dias.', marginX + 4, y + 4.5);
    y += 6;
  }

  y += 5;

  // Condições Gerais e Exclusões da Garantia
  doc.setFillColor(254, 252, 232); // yellow-50
  doc.roundedRect(marginX, y, contentWidth, 38, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(161, 98, 7);
  doc.text('CONDIÇÕES GERAIS E EXCLUSÕES DA GARANTIA:', marginX + 4, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);
  const legalTerms =
    '• Cobertura Específica: A garantia cobre exclusivamente vícios técnicos comprovados nas peças substituídas ou serviços discriminados acima.\n• Exclusões: A garantia perderá totalmente a validade em caso de nova queda, impacto, tela trincada, contato com líquidos/umidade, uso de carregadores incompatíveis ou violação do selo/lacre interno.\n• Comprovação: Para acionamento é indispensável a apresentação deste documento original acompanhado do equipamento.\n• Declaro que conferi e retirei o equipamento em perfeito funcionamento, ciente dos prazos e condições estipuladas.';
  doc.text(legalTerms, marginX + 4, y + 10, { maxWidth: contentWidth - 8 });

  y += 44;

  // Assinaturas
  const sigW = 68;
  const sig1X = marginX + 12;
  const sig2X = marginX + contentWidth - sigW - 12;

  doc.setDrawColor(15, 23, 42);
  doc.line(sig1X, y, sig1X + sigW, y);
  doc.line(sig2X, y, sig2X + sigW, y);

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(companyTitle, sig1X + sigW / 2, y, { align: 'center' });
  doc.text(order.customerName || 'Cliente Beneficiário', sig2X + sigW / 2, y, { align: 'center' });

  y += 3.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text('Emissor / Técnico Responsável', sig1X + sigW / 2, y, { align: 'center' });
  doc.text('Assinatura do Cliente / Aceite dos Termos', sig2X + sigW / 2, y, { align: 'center' });

  return doc;
}

export function generateWarrantyPdfBlob({
  order,
  company,
  warrantyItems,
  deliveryDate,
}: {
  order: WorkOrder;
  company: CompanyPrintData;
  warrantyItems: Array<{ id: string; name: string; days: number; kind: string }>;
  deliveryDate?: string;
}): Blob {
  const doc = buildWarrantyPdfDoc({ order, company, warrantyItems, deliveryDate });
  return doc.output('blob');
}

export function downloadWarrantyPdf({
  order,
  company,
  warrantyItems,
  deliveryDate,
}: {
  order: WorkOrder;
  company: CompanyPrintData;
  warrantyItems: Array<{ id: string; name: string; days: number; kind: string }>;
  deliveryDate?: string;
}) {
  const blob = generateWarrantyPdfBlob({ order, company, warrantyItems, deliveryDate });
  const fileName = `Termo_Garantia_OS_${order.id}.pdf`;
  downloadBlob(blob, fileName);
}
