import { useState } from 'react';
import { apiCreateSupplier } from '../services/erpApi';

export type CreatedSupplier = { id: string; name: string; origin: 'company' | 'upgrade' };

/**
 * Cadastro rápido de fornecedor sem sair da tela (gravado no banco), já com a origem escolhida:
 * Empresa ou Upgrade (aparelho recebido de cliente).
 */
export function InlineSupplierCreate({ origin, disabled, onCreated }: { origin: 'company' | 'upgrade'; disabled?: boolean; onCreated: (supplier: CreatedSupplier) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const value = name.trim();
    if (!value) return setError('Informe o nome do fornecedor.');
    setBusy(true);
    setError('');
    try {
      const created = await apiCreateSupplier({ name: value, tradeName: '', origin, document: '', phone: '', email: '', city: '', notes: '', active: true });
      onCreated({ id: created.id, name: created.tradeName || created.name, origin: created.origin === 'upgrade' ? 'upgrade' : 'company' });
      setName('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o fornecedor.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="quick-add-btn inline-supplier__open" disabled={disabled} onClick={() => setOpen(true)}>
        ＋ Novo fornecedor
      </button>
    );
  }
  return (
    <div className="inline-supplier">
      <input
        value={name}
        autoFocus
        maxLength={160}
        placeholder={origin === 'upgrade' ? 'Nome do cliente / upgrade' : 'Nome do fornecedor'}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void save();
          }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => void save()}>
        {busy ? 'Salvando…' : 'Salvar'}
      </button>
      <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setOpen(false)}>
        Cancelar
      </button>
      {error ? <p role="alert" className="inline-supplier__error">{error}</p> : null}
    </div>
  );
}
