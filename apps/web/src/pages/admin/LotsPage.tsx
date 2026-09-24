import { useEffect, useMemo, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { getAdminState } from '../../data/adminStore';
import { ERP_BOOTSTRAP_EVENT } from '../../data/erpBootstrap';
import { listSuppliers } from '../../data/erpRegistry';
import { createLot, listLots, listWarehouses } from '../../data/fiscalCatalog';

export function LotsPage() {
  const stock = useMemo(() => getAdminState().stock, []);
  const [warehouses, setWarehouses] = useState(() => listWarehouses(true));
  const suppliers = useMemo(() => listSuppliers(true), []);
  const [lots, setLots] = useState(() => listLots());
  const [stockId, setStockId] = useState(stock.find((item) => item.trackLot)?.id ?? stock[0]?.id ?? '');
  const [lotNumber, setLotNumber] = useState('');
  const [qty, setQty] = useState('1');
  const [manufacturingDate, setManufacturingDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [supplierId, setSupplierId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    function refresh() {
      const nextWarehouses = listWarehouses(true);
      setWarehouses(nextWarehouses);
      setLots(listLots());
      setWarehouseId((current) => current || nextWarehouses[0]?.id || '');
    }
    window.addEventListener(ERP_BOOTSTRAP_EVENT, refresh);
    window.addEventListener('marthi-fiscal-updated', refresh);
    return () => {
      window.removeEventListener(ERP_BOOTSTRAP_EVENT, refresh);
      window.removeEventListener('marthi-fiscal-updated', refresh);
    };
  }, []);

  async function submit() {
    const product = stock.find((item) => item.id === stockId);
    if (!product) {
      setError('Selecione um produto.');
      return;
    }
    const supplier = suppliers.find((item) => item.id === supplierId);
    const result = await createLot({
      stockId: product.id,
      stockName: product.name,
      lotNumber,
      qty: Number(qty) || 0,
      manufacturingDate,
      expiryDate,
      warehouseId,
      supplierId,
      supplierName: supplier?.name ?? '',
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLots(listLots());
    setLotNumber('');
    setQty('1');
    setError('');
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>Lote / Grupo Rastro</h2>
        <p>
          Controle de lote por produto (NF-e Grupo Rastro): número, fabricação, validade, fornecedor e
          almoxarifado. Marque “Controla lote” no cadastro do produto.
        </p>
        {error ? <p className="qty-low">{error}</p> : null}
        <div className="admin-form">
          <AdminPicker
            label="Produto"
            value={stockId}
            options={stock.map((item) => ({
              value: item.id,
              label: `${item.name}${item.trackLot ? '' : ' (sem rastro)'}`,
            }))}
            onChange={setStockId}
          />
          <label>
            Nº do lote
            <input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} />
          </label>
          <label>
            Quantidade
            <input value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <AdminPicker
            label="Almoxarifado"
            value={warehouseId}
            options={warehouses.map((item) => ({ value: item.id, label: item.name }))}
            onChange={setWarehouseId}
          />
          <AdminPicker
            label="Fornecedor"
            value={supplierId}
            placeholder="Opcional"
            options={suppliers.map((item) => ({ value: item.id, label: item.name }))}
            onChange={setSupplierId}
          />
          <label>
            Fabricação
            <input
              type="date"
              value={manufacturingDate}
              onChange={(e) => setManufacturingDate(e.target.value)}
            />
          </label>
          <label>
            Validade
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={() => void submit()}>
            Registrar lote
          </button>
        </div>
      </article>

      <article className="admin-card">
        <h2>Lotes cadastrados</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Lote</th>
              <th>Produto</th>
              <th>Qtd</th>
              <th>Validade</th>
              <th>Fornecedor</th>
            </tr>
          </thead>
          <tbody>
            {lots.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Nenhum lote ainda.
                </td>
              </tr>
            ) : (
              lots.map((item) => (
                <tr key={item.id}>
                  <td>{item.lotNumber}</td>
                  <td>{item.stockName}</td>
                  <td>{item.qty}</td>
                  <td>{item.expiryDate || '—'}</td>
                  <td>{item.supplierName || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </section>
  );
}
