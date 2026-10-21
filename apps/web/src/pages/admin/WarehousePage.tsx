import { useEffect, useMemo, useState } from 'react';
import {
  AdminPicker,
  CrudNameButton,
  CrudRowActions,
  HeadingFormActions,
  HeadingSaveButton,
  PageHeadingActions,
  confirmDelete,
} from '../../design-system';
import { getAdminState } from '../../data/adminStore';
import { ERP_BOOTSTRAP_EVENT } from '../../data/erpBootstrap';
import {
  createWarehouseMove,
  deleteWarehouse,
  listWarehouseMoves,
  listWarehouses,
  upsertWarehouse,
  WAREHOUSE_MOVE_LABEL,
  type Warehouse,
  type WarehouseMoveKind,
} from '../../data/fiscalCatalog';

export function WarehousePage() {
  const stock = useMemo(() => getAdminState().stock, []);
  const [warehouses, setWarehouses] = useState(() => listWarehouses());
  const [moves, setMoves] = useState(() => listWarehouseMoves());
  const [editingId, setEditingId] = useState<string | undefined>();
  const [readOnly, setReadOnly] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
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
  const [saving, setSaving] = useState(false);
  const [savingMove, setSavingMove] = useState(false);

  useEffect(() => {
    function refresh() {
      const next = listWarehouses();
      setWarehouses(next);
      setMoves(listWarehouseMoves());
      setFromWarehouseId((current) => current || next[0]?.id || '');
      setToWarehouseId((current) => current || next[1]?.id || next[0]?.id || '');
    }
    window.addEventListener(ERP_BOOTSTRAP_EVENT, refresh);
    window.addEventListener('marthi-fiscal-updated', refresh);
    return () => {
      window.removeEventListener(ERP_BOOTSTRAP_EVENT, refresh);
      window.removeEventListener('marthi-fiscal-updated', refresh);
    };
  }, []);

  function clearForm() {
    setEditingId(undefined);
    setReadOnly(false);
    setFormOpen(false);
    setName('');
    setCode('');
    setAddress('');
    setError('');
  }

  function open(item?: Warehouse, view = false, duplicate = false) {
    setError('');
    setReadOnly(view);
    setFormOpen(true);
    if (!item) {
      setEditingId(undefined);
      setName('');
      setCode('');
      setAddress('');
      return;
    }
    setEditingId(duplicate ? undefined : item.id);
    setName(duplicate ? `${item.name} (cópia)` : item.name);
    setCode(duplicate ? '' : item.code);
    setAddress(item.address || '');
  }

  async function saveWarehouse() {
    if (saving || readOnly) return;
    setSaving(true);
    setError('');
    try {
      const result = await upsertWarehouse({
        id: editingId,
        name,
        code,
        address,
        active: true,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setWarehouses(listWarehouses());
      clearForm();
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: Warehouse) {
    if (!confirmDelete(item.name)) return;
    const result = await deleteWarehouse(item.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setWarehouses(listWarehouses());
    if (editingId === item.id) clearForm();
  }

  async function saveMove() {
    if (savingMove) return;
    const product = stock.find((item) => item.id === stockId);
    if (!product) {
      setError('Selecione um produto.');
      return;
    }
    setSavingMove(true);
    setError('');
    try {
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
    } finally {
      setSavingMove(false);
    }
  }

  const formMode = !formOpen ? 'list' : readOnly ? 'view' : 'edit';

  useEffect(() => {
    if (!formOpen || readOnly) return;
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveWarehouse();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <section className="admin-page">
      {formOpen ? (
        <HeadingFormActions
          mode={formMode}
          onNew={() => open()}
          onClose={clearForm}
          onEdit={() => setReadOnly(false)}
          onSave={() => void saveWarehouse()}
          saving={saving}
          newLabel="Novo local"
          saveLabel={saving ? 'Salvando…' : editingId ? 'Salvar local' : 'Cadastrar local'}
          items={warehouses}
          currentId={editingId}
          onOpen={(row) => open(row, true)}
        />
      ) : (
        <PageHeadingActions>
          <HeadingSaveButton
            onClick={() => void saveMove()}
            disabled={savingMove}
            label={savingMove ? 'Registrando…' : 'Registrar movimento'}
            showShortcut={false}
          />
        </PageHeadingActions>
      )}
      {error ? <p className="qty-low">{error}</p> : null}

      {formOpen ? (
        <article className="admin-card">
          <h2>{readOnly ? 'Consultar almoxarifado' : editingId ? 'Editar almoxarifado' : 'Novo almoxarifado'}</h2>
          <p>Controle físico separado do saldo comercial do produto (locais / depósitos).</p>
          <div className="admin-form">
            <label>
              Nome
              <input value={name} disabled={readOnly || saving} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Código
              <input
                value={code}
                disabled={readOnly || saving}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ALX-01"
              />
            </label>
            <label className="span-2">
              Endereço / local
              <input
                value={address}
                disabled={readOnly || saving}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>
          </div>
        </article>
      ) : (
        <>
          <article className="admin-card">
            <div className="admin-toolbar" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <h2 style={{ margin: 0, flex: '1 1 auto' }}>Almoxarifados</h2>
              <button type="button" className="btn btn--primary" onClick={() => open()}>
                + Novo local
              </button>
            </div>
            <p>Controle físico separado do saldo comercial do produto (locais / depósitos).</p>
            <div className="admin-table-container" style={{ marginTop: 16 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nome</th>
                    <th>Local</th>
                    <th className="admin-table__actions" style={{ textAlign: 'center', width: 130 }}>
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {warehouses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty">
                        Nenhum almoxarifado cadastrado.
                      </td>
                    </tr>
                  ) : (
                    warehouses.map((item) => (
                      <tr key={item.id}>
                        <td>{item.code}</td>
                        <td>
                          <CrudNameButton onClick={() => open(item, true)}>
                            <strong>{item.name}</strong>
                          </CrudNameButton>
                        </td>
                        <td>{item.address || '—'}</td>
                        <td className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
                          <CrudRowActions
                            onView={() => open(item, true)}
                            onEdit={() => open(item)}
                            onDuplicate={() => open(item, false, true)}
                            onDelete={() => void remove(item)}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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
            <div className="admin-table-container" style={{ marginTop: 16 }}>
              <table className="admin-table">
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
            </div>
          </article>
        </>
      )}
    </section>
  );
}
