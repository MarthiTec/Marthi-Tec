import { formatPicked, type PickedAttribute } from './attributeStore';

export type WaitTicketPrint = {
  storeName: string;
  ticketId: string;
  senha: string;
  customerName: string;
  productName: string;
  picked: PickedAttribute[];
  priceLabel: string;
  createdAt?: string;
};

/** Extrai senha de 3 dígitos a partir do id do pedido (ex.: PDV-42 → 042). */
export function ticketSenha(ticketId: string) {
  const digits = ticketId.replace(/\D/g, '');
  const slice = (digits || '1').slice(-3);
  return slice.padStart(3, '0');
}

/**
 * Ticket de aguarde para impressora térmica 80mm.
 * Página: 80mm de largura; conteúdo útil ~72mm (margem 4mm).
 */
export function printWaitTicket(ticket: WaitTicketPrint) {
  const when = new Date(ticket.createdAt || Date.now()).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const variation = formatPicked(ticket.picked);
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Ticket ${ticket.senha}</title>
  <style>
    /* Bobina térmica 80mm — altura automática conforme o conteúdo */
    @page {
      size: 80mm auto;
      margin: 0;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 80mm;
      background: #fff;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: "Courier New", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .ticket {
      width: 72mm;
      margin: 0 auto;
      padding: 4mm 0 6mm;
      text-align: center;
    }
    .store {
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin: 0 0 2mm;
      word-break: break-word;
    }
    .label {
      font-size: 11px;
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.14em;
    }
    .senha {
      font-size: 48px;
      font-weight: 900;
      letter-spacing: 0.1em;
      line-height: 1;
      margin: 3mm 0 2mm;
    }
    .name {
      font-size: 15px;
      font-weight: 700;
      margin: 0 0 3mm;
      word-break: break-word;
    }
    .line {
      border: 0;
      border-top: 1.5px solid #000;
      margin: 3mm 0;
    }
    .line--dash {
      border-top-style: dashed;
    }
    p {
      margin: 1.5mm 0;
      font-size: 13px;
      line-height: 1.25;
      word-break: break-word;
    }
    .mute {
      font-size: 11px;
    }
    .price {
      font-size: 14px;
      font-weight: 800;
    }
    .foot {
      margin-top: 3mm;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .no-print {
      margin-top: 8mm;
      font-size: 12px;
      color: #444;
      font-family: system-ui, sans-serif;
    }
    @media print {
      .no-print { display: none !important; }
      html, body { width: 80mm; }
    }
  </style>
</head>
<body>
  <div class="ticket">
    <p class="store">${escapeHtml(ticket.storeName)}</p>
    <p class="label">Ticket de aguarde</p>
    <div class="senha">${escapeHtml(ticket.senha)}</div>
    <p class="name">${escapeHtml(ticket.customerName || 'Cliente')}</p>
    <hr class="line" />
    <p>${escapeHtml(ticket.productName)}</p>
    ${variation ? `<p class="mute">${escapeHtml(variation)}</p>` : ''}
    <p class="price">${escapeHtml(ticket.priceLabel)}</p>
    <hr class="line line--dash" />
    <p class="mute">${escapeHtml(when)}</p>
    <p class="mute">${escapeHtml(ticket.ticketId)}</p>
    <p class="foot">Aguarde ser chamado</p>
    <p class="no-print">Impressora térmica 80mm · Se a janela não abrir, use Ctrl+P e escolha a térmica.</p>
  </div>
</body>
</html>`;

  const popup = window.open('', 'totem-ticket', 'width=320,height=720');
  if (!popup) return false;
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => {
    try {
      popup.print();
    } catch {
      /* ignore */
    }
  }, 250);
  return true;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
