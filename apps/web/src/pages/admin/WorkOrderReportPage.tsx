import { Link, useParams } from 'react-router-dom';
import {
  CHECKLIST_MARK_LABEL,
  formatDuration,
  getWorkOrder,
  PHOTO_KIND_LABEL,
  PRIORITY_LABEL,
  QUOTE_STATUS_LABEL,
  STATUS_LABEL,
  workOrderExitAt,
  workOrderShopDurationMs,
  workOrderTotal,
} from '../../data/osStore';

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function when(iso: string) {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  return new Date(iso).toLocaleString('pt-BR');
}

function Row({ label, value }: { label: string; value?: string | null }) {
  const text = (value ?? '').trim();
  if (!text) return null;
  return (
    <div className="os-report__row">
      <span>{label}</span>
      <strong>{text}</strong>
    </div>
  );
}

export function WorkOrderReportPage() {
  const { id = '' } = useParams();
  const order = getWorkOrder(id);

  if (!order) {
    return (
      <section className="admin-page">
        <article className="admin-card">
          <h2>OS não encontrada</h2>
          <Link to="/os" className="btn btn--ghost">
            Voltar ao quadro
          </Link>
        </article>
      </section>
    );
  }

  const partsLines = order.lines.filter((line) => line.kind === 'part');
  const partsTotal =
    partsLines.length > 0
      ? partsLines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0)
      : order.parts;

  return (
    <section className="admin-page os-report-page">
      <div className="admin-toolbar no-print">
        <Link to={`/os/${order.id}`} className="btn btn--ghost">
          Abrir OS
        </Link>
        <Link to="/os" className="btn btn--ghost">
          Quadro
        </Link>
        <button type="button" className="btn btn--primary" onClick={() => window.print()}>
          Imprimir / PDF
        </button>
      </div>

      <article className="admin-card os-report">
        <header className="os-report__head">
          <div>
            <p className="os-report__kicker">Ordem de serviço</p>
            <h1>{order.id}</h1>
            <p>
              Aberta em {when(order.createdAt)} · {STATUS_LABEL[order.status]} · Prioridade{' '}
              {PRIORITY_LABEL[order.priority]}
            </p>
          </div>
          <div className="os-report__total">
            <span>Total estimado</span>
            <strong>{money(workOrderTotal(order))}</strong>
          </div>
        </header>

        <div className="os-report__grid">
          <section>
            <h2>Cliente</h2>
            <Row label="Nome" value={order.customerName} />
            <Row label="Telefone" value={order.customerPhone} />
            <Row label="CPF / CNPJ" value={order.customerDocument} />
            <Row label="E-mail" value={order.customerEmail} />
          </section>

          <section>
            <h2>Equipamento</h2>
            <Row label="Descrição" value={order.itemName} />
            <Row label="Marca" value={order.itemBrand} />
            <Row label="Modelo" value={order.itemModel} />
            <Row label="Cor" value={order.itemColor} />
            <Row label="IMEI / série" value={order.itemRef} />
            <Row label="Senha / padrão" value={order.devicePassword} />
            <Row label="Acessórios" value={order.accessories} />
            <Row label="Estado na entrada" value={order.conditionOnEntry} />
          </section>

          <section className="os-report__span">
            <h2>Serviço</h2>
            <Row label="Defeito relatado" value={order.defect} />
            <Row label="Diagnóstico" value={order.diagnosis} />
            <Row label="Técnico" value={order.technician} />
            <Row label="Previsão" value={when(order.estimatedReadyAt)} />
            <Row
              label="Tempo na oficina"
              value={formatDuration(workOrderShopDurationMs(order))}
            />
            <Row
              label="Horário de saída"
              value={
                workOrderExitAt(order)
                  ? when(workOrderExitAt(order)!)
                  : 'Ainda na oficina'
              }
            />
            <Row label="Obs. internas" value={order.notes} />
          </section>

          <section className="os-report__span">
            <h2>Orçamento</h2>
            <Row label="Situação" value={QUOTE_STATUS_LABEL[order.quoteStatus]} />
            <Row
              label="Validade"
              value={order.quoteValidUntil ? when(order.quoteValidUntil) : ''}
            />
            <Row label="Condições" value={order.quoteNotes} />
            <Row label="Mão de obra" value={money(order.labor)} />
            <Row label="Peças" value={money(partsTotal)} />
            <Row label="Total" value={money(workOrderTotal(order))} />
            {partsLines.length > 0 ? (
              <table className="admin-table os-report__parts">
                <thead>
                  <tr>
                    <th>Peça</th>
                    <th>Qtd</th>
                    <th>Cliente</th>
                  </tr>
                </thead>
                <tbody>
                  {partsLines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.name}</td>
                      <td>{line.qty}</td>
                      <td>{money(line.unitPrice * line.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>

          <section className="os-report__span">
            <h2>Resumo de valores</h2>
            <Row label="Total estimado" value={money(workOrderTotal(order))} />
          </section>

          <section className="os-report__span">
            <h2>Checklist de inspeção</h2>
            <table className="admin-table os-report__checklist">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Resultado</th>
                  <th>Obs.</th>
                </tr>
              </thead>
              <tbody>
                {order.checklist.map((item) => (
                  <tr key={item.id}>
                    <td>{item.label}</td>
                    <td>{CHECKLIST_MARK_LABEL[item.mark]}</td>
                    <td>{item.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {order.photos.length > 0 ? (
            <section className="os-report__span">
              <h2>Fotos</h2>
              <div className="os-report__photos">
                {order.photos.map((photo) => (
                  <figure key={photo.id}>
                    <img src={photo.dataUrl} alt={photo.caption || PHOTO_KIND_LABEL[photo.kind]} />
                    <figcaption>
                      {PHOTO_KIND_LABEL[photo.kind]}
                      {photo.caption ? ` · ${photo.caption}` : ''}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <footer className="os-report__sign">
          <div>
            <p>Recebi o equipamento nas condições descritas.</p>
            {order.customerSignature ? (
              <img
                className="os-report__signature"
                src={order.customerSignature}
                alt={`Assinatura ${order.customerSignedName || order.customerName}`}
              />
            ) : (
              <span>Assinatura do cliente</span>
            )}
            {order.customerSignedName || order.customerName ? (
              <small>
                {order.customerSignedName || order.customerName}
                {order.customerSignedAt
                  ? ` · ${new Date(order.customerSignedAt).toLocaleString('pt-BR')}`
                  : ''}
              </small>
            ) : null}
          </div>
          <div>
            <p>Responsável pela oficina</p>
            <span>Assinatura / carimbo</span>
          </div>
        </footer>
      </article>
    </section>
  );
}
