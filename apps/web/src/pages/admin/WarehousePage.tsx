import { useEffect, useMemo, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { getAdminState } from '../../data/adminStore';
import { ERP_BOOTSTRAP_EVENT } from '../../data/erpBootstrap';
import {
  createWarehouseMove,
  listWarehouseMoves,
  listWarehouses,
  upsertWarehouse,
  WAREHOUSE_MOVE_LABEL,
  type WarehouseMoveKind,
} from '../../data/fiscalCatalog';

export function WarehousePage() {
  const stock = useMemo(() => getAdminState().stock, []);
  const [warehouses, setWarehouses] = useState(() => listWarehouses());
  const [moves, setMoves] = useState(() => listWarehouseMoves());
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [kind, setKind] = useState<WarehouseMoveKind>('in');
  const [stockId, setStockId] = useState(stock[0]?.id ?? '');
  const [fromWarehouseId, setFromWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [toWarehouseId, setToWarehouseId] = useState(warehouses[1]?.id ?? warehouses[0]?.id ?? '');
  const [qty, setQty] = useState('1');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    function refresh() {
      setWarehouses(listWarehouses());
      setMoves(listWarehouseMoves());
    }
    window.addEventListener(ERP_BOOTSTRAP_EVENT, refresh);
    window.addEventListener('marthi-fiscal-updated', refresh);
    return () => {
      window.removeEventListener(ERP_BOOTSTRAP_EVENT, refresh);
      window.removeEventListener('marthi-fiscal-updated', refresh);
    };
  }, []);

  async function saveWarehouse() {
    const result = await upsertWarehouse({ name, code, address, active: true });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setWarehouses(listWarehouses());
    setName('');
    setCode('');
    setAddress('');
    setError('');
  }

  async function saveMove() {
    const product = stock.find((item) => item.id === stockId);
    if (!product) {
      setError('Selecione um produto.');
      return;
    }
    const result = await createWarehouseMove({
      kind,
      stockId: product.id,
      stockName: product.name,
      fromWarehouseId: kind === 'in' ? '' : fromWarehouseId,
      toWarehouseId: kind === 'out' ? '' : toWarehouseId,
      qty: Number(qty) || 0,
      description,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMoves(listWarehouseMoves());
    setQty('1');
    setDescription('');
    setError('');
  }

  return (
    <section className="admin-page">
      {error ? <p className="qty-low">{error}</p> : null}
      <article className="admin-card">
        <h2>Almoxarifados</h2>
        <p>Controle físico separado do saldo comercial do produto (locais / depósitos).</p>
        <div className="admin-form">
          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Código
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ALX-01" />
          </label>
          <label className="span-2">
            Endereço / local
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={() => void saveWarehouse()}>
            Cadastrar local
          </button>
        </div>
        <table className="admin-table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>Local</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.map((item) => (
              <tr key={item.id}>
                <td>{item.code}</td>
                <td>{item.name}</td>
                <td>{item.address || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <article className="admin-card">
        <h2>Movimentação de almoxarifado</h2>
        <div className="admin-form">
          <AdminPicker
            label="Tipo"
            value={kind}
            options={(Object.keys(WAREHOUSE_MOVE_LABEL) as WarehouseMoveKind[]).map((key) => ({
              value: key,
              label: WAREHOUSE_MOVE_LABEL[key],
            }))}
            onChange={(value) => setKind(value as WarehouseMoveKind)}
          />
          <AdminPicker
            label="Produto"
            value={stockId}
            options={stock.map((item) => ({ value: item.id, label: item.name }))}
            onChange={setStockId}
          />
          {kind !== 'in' ? (
            <AdminPicker
              label="Origem"
              value={fromWarehouseId}
              options={warehouses.map((item) => ({ value: item.id, label: item.name }))}
              onChange={setFromWarehouseId}
            />
          ) : null}
          {kind !== 'out' ? (
            <AdminPicker
              label="Destino"
              value={toWarehouseId}
              options={warehouses.map((item) => ({ value: item.id, label: item.name }))}
              onChange={setToWarehouseId}
            />
          ) : null}
          <label>
            Quantidade
            <input value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <label className="span-2">
            Descrição
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={() => void saveMove()}>
            Registrar movimento
          </button>
        </div>
        <table className="admin-table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Quando</th>
              <th>Tipo</th>
              <th>Produto</th>
              <th>Qtd</th>
              <th>Descrição</th>
            </tr>
          </thead>
          <tbody>
            {moves.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Sem movimentos.
                </td>
              </tr>
            ) : (
              moves.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.at).toLocaleString('pt-BR')}</td>
                  <td>{WAREHOUSE_MOVE_LABEL[item.kind]}</td>
                  <td>{item.stockName}</td>
                  <td>{item.qty}</td>
                  <td>{item.description}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </section>
  );
}
