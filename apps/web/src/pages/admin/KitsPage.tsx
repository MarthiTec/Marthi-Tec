import { useContext, useEffect, useMemo, useState } from 'react';
import {
  AdminPicker,
  CrudNameButton,
  CrudRowActions,
  HeadingFormActions,
  confirmDelete,
  InlineHeadingActions,
} from '../../design-system';
import { getAdminState } from '../../data/adminStore';
import { ERP_BOOTSTRAP_EVENT } from '../../data/erpBootstrap';
import { deleteKit, listKits, upsertKit, type ProductKit, type ProductKitItem } from '../../data/fiscalCatalog';

export function KitsPage() {
  const stock = useMemo(() => getAdminState().stock, []);
  const [kits, setKits] = useState(() => listKits());
  const [editingId, setEditingId] = useState<string | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [parentStockId, setParentStockId] = useState('');
  const [lineStockId, setLineStockId] = useState(stock[0]?.id ?? '');
  const [lineQty, setLineQty] = useState('1');
  const [items, setItems] = useState<ProductKitItem[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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

  function clearForm() {
    setEditingId(undefined);
    setFormOpen(false);
    setReadOnly(false);
    setName('');
    setSku('');
    setParentStockId('');
    setItems([]);
    setError('');
  }

  function open(kit?: ProductKit, view = false, duplicate = false) {
    setError('');
    setReadOnly(view);
    setFormOpen(true);
    if (!kit) {
      setEditingId(undefined);
      setName('');
      setSku('');
      setParentStockId('');
      setItems([]);
      return;
    }
    setEditingId(duplicate ? undefined : kit.id);
    setName(duplicate ? `${kit.name} (cópia)` : kit.name);
    setSku(duplicate ? '' : kit.sku);
    setParentStockId(kit.parentStockId || '');
    setItems(kit.items.map((row) => ({ ...row })));
  }

  async function submit() {
    if (saving || readOnly) return;
    setSaving(true);
    setError('');
    try {
      const result = await upsertKit({
        id: editingId,
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
      clearForm();
    } finally {
      setSaving(false);
    }
  }

  async function remove(kit: ProductKit) {
    if (!confirmDelete(kit.name)) return;
    const result = await deleteKit(kit.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setKits(listKits());
    if (editingId === kit.id) clearForm();
  }

  const formMode = !formOpen ? 'list' : readOnly ? 'view' : 'edit';
  const inline = useContext(InlineHeadingActions);

  useEffect(() => {
    if (inline || readOnly) return;
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void submit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <section className="admin-page">
      <HeadingFormActions
        mode={formMode}
        onNew={() => open()}
        onClose={clearForm}
        onEdit={() => setReadOnly(false)}
        onSave={() => void submit()}
        saving={saving}
        newLabel="Novo kit"
        saveLabel={saving ? 'Salvando…' : editingId ? 'Salvar kit' : 'Cadastrar kit'}
        items={kits}
        currentId={editingId}
        onOpen={(kit) => open(kit, true)}
      />
      {formOpen ? (
        <article className="admin-card">
          <h2>{readOnly ? 'Consultar kit' : editingId ? 'Editar kit' : 'Novo kit'}</h2>
          <p>
            Composição de produtos (kit). Opcionalmente vincule a um produto-pai marcado como kit no
            cadastro.
          </p>
          {error ? <p className="qty-low">{error}</p> : null}
          <div className="admin-form">
            <label>
              Nome do kit
              <input value={name} disabled={readOnly || saving} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              SKU
              <input value={sku} disabled={readOnly || saving} onChange={(e) => setSku(e.target.value)} />
            </label>
            <AdminPicker
              className="span-2"
              label="Produto-pai (opcional)"
              value={parentStockId}
              placeholder="Nenhum"
              disabled={readOnly || saving}
              options={stock
                .filter((item) => item.isKit)
                .map((item) => ({ value: item.id, label: item.name }))}
              onChange={setParentStockId}
            />
            {!readOnly ? (
              <>
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
              </>
            ) : null}
          </div>
          {!readOnly ? (
            <div className="admin-toolbar" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn--ghost" onClick={addLine}>
                Adicionar item
              </button>
            </div>
          ) : null}
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
      ) : null}

      {!formOpen ? (
        <article className="admin-card">
          <h2>Kits</h2>
          {error ? <p className="qty-low">{error}</p> : null}
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>SKU</th>
                  <th>Itens</th>
                  <th>Status</th>
                  <th className="admin-table__actions" style={{ textAlign: 'center', width: 130 }}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {kits.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      Nenhum kit cadastrado.
                    </td>
                  </tr>
                ) : (
                  kits.map((kit) => (
                    <tr key={kit.id}>
                      <td>
                        <CrudNameButton onClick={() => open(kit, true)}>
                          <strong>{kit.name}</strong>
                        </CrudNameButton>
                      </td>
                      <td>{kit.sku || '—'}</td>
                      <td>
                        {kit.items.map((item) => `${item.qty}× ${item.stockName}`).join(', ')}
                      </td>
                      <td>{kit.active ? 'Ativo' : 'Inativo'}</td>
                      <td className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
                        <CrudRowActions
                          onView={() => open(kit, true)}
                          onEdit={() => open(kit)}
                          onDuplicate={() => open(kit, false, true)}
                          onDelete={() => void remove(kit)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </section>
  );
}
