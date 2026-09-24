import { useEffect, useMemo, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { getAdminState } from '../../data/adminStore';
import { ERP_BOOTSTRAP_EVENT } from '../../data/erpBootstrap';
import { listKits, upsertKit, type ProductKitItem } from '../../data/fiscalCatalog';

export function KitsPage() {
  const stock = useMemo(() => getAdminState().stock, []);
  const [kits, setKits] = useState(() => listKits());
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [parentStockId, setParentStockId] = useState('');
  const [lineStockId, setLineStockId] = useState(stock[0]?.id ?? '');
  const [lineQty, setLineQty] = useState('1');
  const [items, setItems] = useState<ProductKitItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    function refresh() {
      setKits(listKits());
    }
    window.addEventListener(ERP_BOOTSTRAP_EVENT, refresh);
    window.addEventListener('marthi-fiscal-updated', refresh);
    return () => {
      window.removeEventListener(ERP_BOOTSTRAP_EVENT, refresh);
      window.removeEventListener('marthi-fiscal-updated', refresh);
    };
  }, []);

  function addLine() {
    const product = stock.find((item) => item.id === lineStockId);
    if (!product) return;
    const qty = Math.max(1, Number(lineQty) || 1);
    setItems((current) => {
      const existing = current.find((row) => row.stockId === product.id);
      if (existing) {
        return current.map((row) =>
          row.stockId === product.id ? { ...row, qty: row.qty + qty } : row,
        );
      }
      return [...current, { stockId: product.id, stockName: product.name, qty }];
    });
  }

  async function submit() {
    const result = await upsertKit({
      name,
      sku,
      parentStockId,
      items,
      active: true,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setKits(listKits());
    setName('');
    setSku('');
    setItems([]);
    setError('');
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>Novo kit</h2>
        <p>
          Composição de produtos (kit). Opcionalmente vincule a um produto-pai marcado como kit no
          cadastro.
        </p>
        {error ? <p className="qty-low">{error}</p> : null}
        <div className="admin-form">
          <label>
            Nome do kit
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            SKU
            <input value={sku} onChange={(e) => setSku(e.target.value)} />
          </label>
          <AdminPicker
            className="span-2"
            label="Produto-pai (opcional)"
            value={parentStockId}
            placeholder="Nenhum"
            options={stock
              .filter((item) => item.isKit)
              .map((item) => ({ value: item.id, label: item.name }))}
            onChange={setParentStockId}
          />
          <AdminPicker
            label="Item"
            value={lineStockId}
            options={stock.map((item) => ({ value: item.id, label: item.name }))}
            onChange={setLineStockId}
          />
          <label>
            Qtd
            <input value={lineQty} onChange={(e) => setLineQty(e.target.value)} />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--ghost" onClick={addLine}>
            Adicionar item
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void submit()}>
            Salvar kit
          </button>
        </div>
        {items.length > 0 ? (
          <ul className="empty" style={{ marginTop: 12 }}>
            {items.map((item) => (
              <li key={item.stockId}>
                {item.qty}× {item.stockName}
              </li>
            ))}
          </ul>
        ) : null}
      </article>

      <article className="admin-card">
        <h2>Kits</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>SKU</th>
              <th>Itens</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {kits.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  Nenhum kit cadastrado.
                </td>
              </tr>
            ) : (
              kits.map((kit) => (
                <tr key={kit.id}>
                  <td>{kit.name}</td>
                  <td>{kit.sku || '—'}</td>
                  <td>
                    {kit.items.map((item) => `${item.qty}× ${item.stockName}`).join(', ')}
                  </td>
                  <td>{kit.active ? 'Ativo' : 'Inativo'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </section>
  );
}
