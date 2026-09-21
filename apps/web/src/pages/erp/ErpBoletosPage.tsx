import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import {
  BOLETO_EVENT,
  BOLETO_KIND_LABEL,
  BOLETO_STATUS_LABEL,
  cancelBoleto,
  createBoleto,
  listBoletos,
  markBoletoPaid,
  type BoletoKind,
} from '../../data/boletoStore';
import { money } from '../../data/financeBook';

function defaultDue() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

export function ErpBoletosPage() {
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [kind, setKind] = useState<BoletoKind>('pix');
  const [customerName, setCustomerName] = useState('');
  const [customerDocument, setCustomerDocument] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(defaultDue);

  useEffect(() => {
    function refresh() {
      setTick((value) => value + 1);
    }
    window.addEventListener(BOLETO_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(BOLETO_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const items = useMemo(() => listBoletos(), [tick]);

  function onCreate(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    const value = Number(amount.replace(',', '.'));
    if (!customerName.trim()) {
      setError('Informe o pagador.');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError('Valor inválido.');
      return;
    }
    const boleto = createBoleto({
      kind,
      customerName,
      customerDocument,
      description: description || BOLETO_KIND_LABEL[kind],
      amount: value,
      dueDate,
    });
    setMessage(`${BOLETO_KIND_LABEL[boleto.kind]} ${boleto.id} gerado.`);
    setCustomerName('');
    setCustomerDocument('');
    setDescription('');
    setAmount('');
    setTick((value) => value + 1);
  }

  return (
    <section className="admin-page">
      <div className="admin-toolbar" style={{ marginBottom: 12 }}>
        <p className="empty" style={{ margin: 0 }}>
          Cobrança atrelada ao financeiro: Pix puro, boleto bancário ou híbrido (Pix + linha
          digitável).
        </p>
        <Link to="/erp/financeiro" className="btn btn--ghost">
          Abrir financeiro
        </Link>
      </div>

      <form className="admin-card" onSubmit={onCreate} style={{ marginBottom: 12 }}>
        <h2 style={{ marginTop: 0 }}>Emitir boleto</h2>
        <div className="admin-form">
          <AdminPicker
            label="Tipo"
            value={kind}
            options={[
              { value: 'pix', label: 'Boleto Pix' },
              { value: 'hybrid', label: 'Boleto híbrido (Pix + boleto)' },
              { value: 'bank', label: 'Boleto bancário' },
            ]}
            onChange={(value) => setKind(value as BoletoKind)}
          />
          <label>
            Pagador
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nome ou razão social"
              required
            />
          </label>
          <label>
            CPF/CNPJ
            <input
              value={customerDocument}
              onChange={(e) => setCustomerDocument(e.target.value)}
              placeholder="Documento"
            />
          </label>
          <label>
            Valor (R$)
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              required
            />
          </label>
          <label>
            Vencimento
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </label>
          <label className="span-2">
            Descrição
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Referência da cobrança"
            />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 14 }}>
          <button type="submit" className="btn btn--primary">
            Gerar cobrança
          </button>
        </div>
        {message ? <p className="empty">{message}</p> : null}
        {error ? <p className="qty-low">{error}</p> : null}
      </form>

      <article className="admin-card">
        <h2>Cobranças</h2>
        {items.length === 0 ? (
          <p className="empty">Nenhum boleto ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Tipo</th>
                  <th>Pagador</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>
                      <span className={`erp-boleto-kind erp-boleto-kind--${item.kind}`}>
                        {BOLETO_KIND_LABEL[item.kind]}
                      </span>
                    </td>
                    <td>
                      {item.customerName}
                      {item.customerDocument ? (
                        <>
                          <br />
                          <span className="empty">{item.customerDocument}</span>
                        </>
                      ) : null}
                    </td>
                    <td className="price-red">{money(item.amount)}</td>
                    <td>{new Date(`${item.dueDate}T12:00:00`).toLocaleDateString('pt-BR')}</td>
                    <td>{BOLETO_STATUS_LABEL[item.status]}</td>
                    <td className="admin-table__action">
                      {item.status === 'open' ? (
                        <div className="admin-toolbar">
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => {
                              markBoletoPaid(item.id);
                              setTick((value) => value + 1);
                            }}
                          >
                            Baixar
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => {
                              cancelBoleto(item.id);
                              setTick((value) => value + 1);
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
