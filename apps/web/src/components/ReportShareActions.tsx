import { AdminIcon } from './AdminIcons';

/**
 * Ações de um relatório: enviar o resumo dele pelo WhatsApp ou por e-mail (abre o app da pessoa com
 * o texto pronto) e imprimir. O texto vem do próprio relatório: título, loja, filtros, totais e linhas.
 */
export function ReportShareActions({ title, lines, disabled, onPrint }: { title: string; lines: string[]; disabled?: boolean; onPrint: () => void }) {
  // Links de compartilhamento têm limite de tamanho: corta com aviso em vez de quebrar.
  const text = (() => {
    const full = [title, ...lines].join('\n');
    if (full.length <= 3500) return full;
    return `${full.slice(0, 3400)}\n…\n(relatório completo: imprima ou salve em PDF)`;
  })();
  return (
    <div className="report-share">
      <button type="button" className="btn btn--ghost" disabled={disabled} onClick={() => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noopener')}>
        <AdminIcon name="whatsapp" />
        WhatsApp
      </button>
      <button type="button" className="btn btn--ghost" disabled={disabled} onClick={() => (window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`)}>
        <AdminIcon name="mail" />
        E-mail
      </button>
      <button type="button" className="btn btn--primary" disabled={disabled} onClick={onPrint}>
        <AdminIcon name="print" />
        Imprimir
      </button>
    </div>
  );
}
