import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { upsertStockItem, type StockItem, type StockUnit } from '../../data/adminStore';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (item: StockItem) => void;
};

export function OsProductQuickModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState<StockUnit>('UN');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Informe o nome do produto / peça.');
      return;
    }

    const numPrice = Math.max(0, parseFloat(price) || 0);
    const numCost = Math.max(0, parseFloat(cost) || 0);
    const numQty = Math.max(0, parseFloat(qty) || 0);

    setBusy(true);
    try {
      const generatedSku = sku.trim() || `PRD-${Date.now().toString(36).toUpperCase().slice(-5)}`;
      const state = await upsertStockItem({
        name: name.trim(),
        sku: generatedSku,
        barcode: '',
        imei: '',
        color: '',
        capacity: '',
        attrs: {},
        qty: numQty,
        minQty: 1,
        maxQty: 20,
        cost: numCost,
        avgCost: numCost,
        price: numPrice,
        lastPurchaseAt: new Date().toISOString(),
        lastPurchaseCost: numCost,
        kind: 'part',
        condition: 'new',
        unit,
        showOnTotem: false,
        images: [],
      });

      const created = state.stock.find((s) => s.sku === generatedSku) || state.stock[0];
      if (onCreated && created) {
        onCreated(created);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar produto.');
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="os-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="os-modal os-share-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <header className="os-modal__header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.3rem' }}>📦</span>
              <h2 className="os-modal__title">Cadastrar Produto / Peça</h2>
            </div>
            <p className="os-modal__subtitle">
              Cadastro simplificado da oficina para uso em Ordens de Serviço
            </p>
          </div>
          <button type="button" className="os-modal__close" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </header>

        <form onSubmit={handleSubmit} className="os-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#b91c1c', borderRadius: 6, fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
              Nome do Produto / Peça *
            </label>
            <input
              type="text"
              required
              value={name}
              placeholder="Ex: Tela iPhone 13 Original, Cabo Flat, Conector de Carga..."
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: '0.9rem',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                Código / SKU (opcional)
              </label>
              <input
                type="text"
                value={sku}
                placeholder="Ex: TEL-IP13"
                onChange={(e) => setSku(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                Unidade
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as StockUnit)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                }}
              >
                <option value="UN">Unidade (UN)</option>
                <option value="KG">Quilograma (KG)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                Preço de Venda (R$)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={price}
                placeholder="0.00"
                onChange={(e) => setPrice(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                Custo (R$)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cost}
                placeholder="0.00"
                onChange={(e) => setCost(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                Estoque Inicial
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={qty}
                placeholder="1"
                onChange={(e) => setQty(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                }}
              />
            </div>
          </div>

          {/* Upsell Retaguarda */}
          <div
            style={{
              background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)',
              border: '1px solid #bbf7d0',
              borderRadius: 8,
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginTop: 4,
            }}
          >
            <div>
              <strong style={{ fontSize: '0.82rem', color: '#166534', display: 'block', marginBottom: 2 }}>
                Precisa controlar estoque e produtos?
              </strong>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#334155' }}>
                Com a <strong>Retaguarda</strong> você pode gerenciar produtos com custo médio, compras,
                fornecedores, estoque mínimo/máximo e balanço da sua empresa.
              </p>
            </div>
            <Link
              to="/painel/plano"
              className="btn btn--sm btn--primary"
              style={{ whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '5px 8px' }}
            >
              Conhecer a Retaguarda →
            </Link>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button type="button" onClick={onClose} className="btn btn--ghost" style={{ flex: 1 }}>
              Cancelar
            </button>
            <button type="submit" disabled={busy} className="btn btn--primary" style={{ flex: 1 }}>
              {busy ? 'Salvando...' : 'Salvar Produto'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
