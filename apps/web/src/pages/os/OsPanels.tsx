import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  formatDuration,
  searchWorkOrders,
  STATUS_LABEL,
  workOrderExitAt,
  workOrderLaborLines,
  workOrderPartsLines,
  workOrderShopDurationMs,
  workOrderTotal,
  type WorkOrder,
} from '../../data/osStore';

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function when(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR');
}

export type OsPanel = 'consult' | 'reprint' | null;

type PanelProps = {
  panel: Exclude<OsPanel, null>;
  onClose: () => void;
  onOpenOrder: (id: string) => void;
  onReprint: (id: string) => void;
};

export function OsPanelHost(props: PanelProps) {
  const { panel, onClose } = props;
  return (
    <div className="pdv__modal" role="dialog" aria-modal="true">
      <button type="button" className="pdv__modal-backdrop" aria-label="Fechar" onClick={onClose} />
      <div className="admin-card pdv__modal-card pdv__modal-card--wide">
        {panel === 'consult' || panel === 'reprint' ? (
          <OsConsultPanel {...props} mode={panel} />
        ) : null}
      </div>
    </div>
  );
}

function OsConsultPanel({
  mode,
  onClose,
  onOpenOrder,
  onReprint,
}: PanelProps & { mode: 'consult' | 'reprint' }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<WorkOrder | null>(null);
  const hits = useMemo(() => searchWorkOrders(query, 12), [query]);

  const parts = selected ? workOrderPartsLines(selected) : [];
  const laborLines = selected ? workOrderLaborLines(selected) : [];
  const exitAt = selected ? workOrderExitAt(selected) : null;
  const duration = selected ? formatDuration(workOrderShopDurationMs(selected)) : '—';
  const total = selected ? workOrderTotal(selected) : 0;

  return (
    <div className="caixa-panel caixa-panel--fit os-consult">
      <div className="caixa-panel__head">
        <h2>{mode === 'reprint' ? 'Reimpressão de OS' : 'Consulta de OS'}</h2>
        <p className="empty">
          Busque por número, cliente, IMEI ou técnico. Veja peças, tempo na oficina, saída e total.
        </p>
      </div>

      <label className="caixa-panel__full">
        Buscar OS
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="OS-… / Maria / IMEI / Ana"
          autoFocus
        />
      </label>

      {hits.length > 0 && !selected ? (
        <ul className="caixa-panel__hits">
          {hits.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => setSelected(item)}>
                <strong>{item.id}</strong>
                <span>
                  {item.customerName} · {item.itemName}
                </span>
                <em>{money(workOrderTotal(item))}</em>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <div className="caixa-panel__body os-consult__detail">
          <div className="caixa-panel__summary">
            <div>
              <span>OS</span>
              <strong>{selected.id}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{STATUS_LABEL[selected.status]}</strong>
            </div>
            <div>
              <span>Cliente</span>
              <strong>{selected.customerName}</strong>
            </div>
            <div>
              <span>Total gasto</span>
              <strong className="price-red">{money(total)}</strong>
            </div>
            <div>
              <span>Tempo na oficina</span>
              <strong>{duration}</strong>
            </div>
            <div>
              <span>Horário de saída</span>
              <strong>{exitAt ? when(exitAt) : 'Ainda na oficina'}</strong>
            </div>
            <div>
              <span>Entrada</span>
              <strong>{when(selected.createdAt)}</strong>
            </div>
            <div>
              <span>Técnico</span>
              <strong>{selected.technician || '—'}</strong>
            </div>
          </div>

          <div className="os-consult__cols">
            <article>
              <h3>Equipamento</h3>
              <p>
                {selected.itemName}
                {selected.itemRef ? ` · ${selected.itemRef}` : ''}
              </p>
              <p className="empty">
                {[selected.itemBrand, selected.itemModel, selected.itemColor]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </p>
            </article>
            <article>
              <h3>Peças / ferramentas</h3>
              {parts.length === 0 ? (
                <p className="empty">Nenhuma peça lançada.</p>
              ) : (
                <ul>
                  {parts.map((line) => (
                    <li key={line.id}>
                      {line.qty}x {line.name} · {money(line.unitPrice * line.qty)}
                    </li>
                  ))}
                </ul>
              )}
            </article>
            <article>
              <h3>Mão de obra</h3>
              {laborLines.length === 0 && selected.labor <= 0 ? (
                <p className="empty">Sem mão de obra lançada.</p>
              ) : (
                <ul>
                  {laborLines.map((line) => (
                    <li key={line.id}>
                      {line.qty}x {line.name} · {money(line.unitPrice * line.qty)}
                    </li>
                  ))}
                  {laborLines.length === 0 && selected.labor > 0 ? (
                    <li>Mão de obra · {money(selected.labor)}</li>
                  ) : null}
                </ul>
              )}
            </article>
          </div>
        </div>
      ) : (
        <p className="empty">{query ? 'Nenhuma OS encontrada.' : 'Digite para buscar.'}</p>
      )}

      <div className="pdv__modal-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Fechar
        </button>
        {selected ? (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                onOpenOrder(selected.id);
                onClose();
              }}
            >
              Abrir OS
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                onReprint(selected.id);
                onClose();
              }}
            >
              Reimprimir OS
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Atalhos exibidos na tela principal do quadro. */
export function OsHotkeysBar({
  onConsult,
  onReprint,
}: {
  onConsult: () => void;
  onReprint: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="pdv__hotkeys os-hotkeys" aria-label="Atalhos da oficina">
      <kbd>Alt+O</kbd>
      <span>operações</span>
      <button type="button" className="os-hotkeys__hit" onClick={() => navigate('/os/nova')}>
        <kbd>F2</kbd>
        <span>nova OS</span>
      </button>
      <button type="button" className="os-hotkeys__hit" onClick={onConsult}>
        <kbd>F7</kbd>
        <span>consultar</span>
      </button>
      <button type="button" className="os-hotkeys__hit" onClick={onReprint}>
        <kbd>F8</kbd>
        <span>reimprimir</span>
      </button>
      <button type="button" className="os-hotkeys__hit" onClick={() => navigate('/os/agenda')}>
        <kbd>F6</kbd>
        <span>agenda</span>
      </button>
      <Link to="/os/nova" className="btn btn--primary os-hotkeys__cta">
        Nova OS
      </Link>
    </div>
  );
}
