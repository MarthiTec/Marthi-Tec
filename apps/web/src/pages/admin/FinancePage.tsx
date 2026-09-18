import { useState } from 'react';
import { addFinance, getAdminState } from '../../data/adminStore';

export function FinancePage() {
  const [state, setState] = useState(() => getAdminState());
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'in' | 'out'>('out');

  const balance = state.finance.reduce(
    (sum, item) => sum + (item.type === 'in' ? item.amount : -item.amount),
    0,
  );
  const inflow = state.finance
    .filter((item) => item.type === 'in')
    .reduce((sum, item) => sum + item.amount, 0);

  function submit() {
    const value = Number(amount.replace(',', '.'));
    if (!label.trim() || !Number.isFinite(value) || value <= 0) return;
    setState(addFinance({ type, label: label.trim(), amount: value }));
    setLabel('');
    setAmount('');
  }

  return (
    <section className="admin-page">
      <div className="admin-grid">
        <article className="admin-card">
          <h2>Saldo</h2>
          <strong>{balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
        </article>
        <article className="admin-card">
          <h2>Entradas</h2>
          <strong>{inflow.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
        </article>
      </div>

      <article className="admin-card">
        <h2>Lançar movimento</h2>
        <div className="admin-form">
          <label>
            Tipo
            <select value={type} onChange={(e) => setType(e.target.value as 'in' | 'out')}>
              <option value="in">Entrada</option>
              <option value="out">Saída</option>
            </select>
          </label>
          <label>
            Valor
            <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="span-2">
            Descrição
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={submit}>
            Lançar
          </button>
        </div>
      </article>

      <article className="admin-card">
        <h2>Extrato</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Descrição</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {state.finance.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.createdAt).toLocaleString('pt-BR')}</td>
                <td>{item.label}</td>
                <td className={item.type === 'in' ? 'price-red' : 'qty-low'}>
                  {item.type === 'in' ? '+' : '-'}
                  {item.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
