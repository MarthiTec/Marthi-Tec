import { UppercaseToggle, useUppercase } from './UppercaseToggle';
import './productSpecs.css';

export type ProductSpec = { label: string; value: string };

/** Linhas comuns de celular (como a ficha técnica dos grandes sites); só as preenchidas aparecem ao cliente. */
const PHONE_TEMPLATE = [
  'Marca',
  'Modelo',
  'Referência',
  'Tela',
  'Tamanho da tela',
  'Processador',
  'Armazenamento',
  'Memória RAM',
  'Câmera traseira',
  'Câmera frontal',
  'Bateria',
  'Sistema operacional',
  'Conectividade',
  'Chip',
  'Resistência à água',
  'Sensores',
  'Peso',
  'Acompanha',
  'Garantia',
];

/** O link do vídeo vira embed (YouTube) ou arquivo de vídeo HTTPS. */
export function videoEmbed(url: string): { kind: 'youtube' | 'file'; src: string } | null {
  const text = url.trim();
  if (!/^https:\/\//i.test(text)) return null;
  const yt = text.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/i);
  if (yt) return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  if (/\.(mp4|webm|mov)(\?|$)/i.test(text)) return { kind: 'file', src: text };
  return null;
}

/**
 * Aba "Ficha técnica" do cadastro do produto: vídeo do aparelho e as linhas da ficha (opcionais).
 * Aparece na página do produto no catálogo / página de venda.
 */
export function ProductSpecsPanel({
  videoUrl,
  specs,
  readOnly,
  onChange,
}: {
  videoUrl: string;
  specs: ProductSpec[];
  readOnly?: boolean;
  onChange: (patch: { videoUrl?: string; specs?: ProductSpec[] }) => void;
}) {
  const embed = videoEmbed(videoUrl);
  const { uppercase, setUppercase, upper } = useUppercase();
  const set = (index: number, patch: Partial<ProductSpec>) => onChange({ specs: specs.map((line, i) => (i === index ? { ...line, ...patch } : line)) });
  const fillTemplate = () => {
    const have = new Set(specs.map((line) => line.label.trim().toLowerCase()));
    onChange({ specs: [...specs, ...PHONE_TEMPLATE.filter((label) => !have.has(label.toLowerCase())).map((label) => ({ label, value: '' }))] });
  };

  return (
    <div className="pspecs">
      <section className="pspecs__card">
        <h3>Vídeo do aparelho</h3>
        <p className="pspecs__muted">Link do YouTube (vídeo ou Shorts) ou de um arquivo de vídeo HTTPS. Aparece na página do produto.</p>
        <input className="admin-input" type="url" value={videoUrl} disabled={readOnly} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => onChange({ videoUrl: e.target.value })} />
        {videoUrl && !embed ? <p className="pspecs__warn">Link não reconhecido: use um link do YouTube ou de um arquivo .mp4 por HTTPS.</p> : null}
        {embed?.kind === 'youtube' ? (
          <div className="pspecs__video">
            <iframe src={embed.src} title="Vídeo do aparelho" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" />
          </div>
        ) : embed?.kind === 'file' ? (
          <div className="pspecs__video">
            <video src={embed.src} controls preload="metadata" />
          </div>
        ) : null}
      </section>

      <section className="pspecs__card">
        <div className="pspecs__head">
          <h3>Ficha técnica</h3>
          {!readOnly ? (
            <span className="pspecs__tools">
              <UppercaseToggle checked={uppercase} onChange={setUppercase} />
              <button type="button" className="btn btn--ghost btn--sm" onClick={fillTemplate}>
                Usar modelo de celular
              </button>
            </span>
          ) : null}
        </div>
        <p className="pspecs__muted">Opcional. Só as linhas preenchidas aparecem para o cliente, nesta ordem.</p>
        {specs.length ? (
          <ul className="pspecs__rows">
            {specs.map((line, index) => (
              <li key={index}>
                <input className="admin-input" value={line.label} maxLength={80} disabled={readOnly} placeholder="Ex.: Processador" aria-label={`Item ${index + 1}`} onChange={(e) => set(index, { label: upper(e.target.value) })} />
                <input className="admin-input" value={line.value} maxLength={600} disabled={readOnly} placeholder="Ex.: Chip A18" aria-label={`Valor de ${line.label || `item ${index + 1}`}`} onChange={(e) => set(index, { value: upper(e.target.value) })} />
                {!readOnly ? (
                  <button type="button" className="pspecs__drop" aria-label={`Remover ${line.label || 'linha'}`} onClick={() => onChange({ specs: specs.filter((_, i) => i !== index) })}>
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pspecs__muted">Nenhuma linha ainda.</p>
        )}
        {!readOnly ? (
          <button type="button" className="quick-add-btn" onClick={() => onChange({ specs: [...specs, { label: '', value: '' }] })}>
            ＋ Linha
          </button>
        ) : null}
      </section>
    </div>
  );
}
