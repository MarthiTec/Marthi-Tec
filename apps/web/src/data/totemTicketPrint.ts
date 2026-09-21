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

export function ticketSenha(ticketId: string) {
  const digits = ticketId.replace(/\D/g, '');
  const slice = (digits || '1').slice(-3);
  return slice.padStart(3, '0');
}

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
    @page { size: 80mm auto; margin: 6mm; }
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; margin: 0; color: #111; }
    .ticket { width: 68mm; margin: 0 auto; text-align: center; }
    h1 { font-size: 13px; margin: 0 0 4px; letter-spacing: 0.12em; text-transform: uppercase; }
    .senha { font-size: 42px; font-weight: 800; letter-spacing: 0.08em; margin: 10px 0 6px; }
    p { margin: 4px 0; font-size: 13px; }
    .mute { color: #444; font-size: 11px; }
    hr { border: 0; border-top: 1px dashed #111; margin: 10px 0; }
    .no-print { margin-top: 16px; font-size: 12px; color: #666; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="ticket">
    <h1>${escapeHtml(ticket.storeName)}</h1>
    <p class="mute">Ticket de aguarde</p>
    <div class="senha">${escapeHtml(ticket.senha)}</div>
    <p><strong>${escapeHtml(ticket.customerName || 'Cliente')}</strong></p>
    <hr />
    <p>${escapeHtml(ticket.productName)}</p>
    ${variation ? `<p class="mute">${escapeHtml(variation)}</p>` : ''}
    <p><strong>${escapeHtml(ticket.priceLabel)}</strong></p>
    <hr />
    <p class="mute">${escapeHtml(when)}</p>
    <p class="mute">${escapeHtml(ticket.ticketId)}</p>
    <p>Aguarde ser chamado</p>
    <p class="no-print">Se a impressão não abrir, use Ctrl+P.</p>
  </div>
</body>
</html>`;

  const popup = window.open('', 'totem-ticket', 'width=380,height=640');
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
