import { useState } from 'react';
import { QuickModal } from './QuickModal';
import { createBrand, type Brand } from '../data/brandStore';
import { createAttribute, type ProductAttribute } from '../data/attributeStore';
import { getErpRegistry, upsertSupplier } from '../data/erpRegistry';
import { apiCreateSeller, type ApiSeller } from '../services/erpApi';
import { CustomerQuickFields, emptyCustomerDraft, saveCustomerDraft, type CustomerDraft } from './CustomerQuickFields';
import type { Customer } from '../data/adminStore';

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/** Fornecedor em poucos campos; o cadastro completo continua em Pessoas › Fornecedores. */
export function QuickCreateSupplier({ onClose, onCreated }: { onClose: () => void; onCreated: (supplierId: string) => void }) {
  const [name, setName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!name.trim()) return setError('Informe a razão social ou o nome do fornecedor.');
    setBusy(true);
    setError('');
    try {
      const before = new Set(getErpRegistry().suppliers.map((item) => item.id));
      const state = await upsertSupplier({ name, tradeName, document, phone, email, city: '', notes: '', active: true });
      const created = state.suppliers.find((item) => !before.has(item.id));
      if (created) onCreated(created.id);
      onClose();
    } catch (err) {
      setError(message(err, 'Não foi possível salvar o fornecedor.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <QuickModal title="Novo fornecedor" subtitle="Cadastro rápido. Os demais dados podem ser completados depois." busy={busy} error={error} onClose={onClose} onSubmit={save} submitLabel="Salvar fornecedor">
      <label>
        Razão social / Nome *
        <input value={name} maxLength={160} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="quick-modal__row">
        <label>
          Nome fantasia
          <input value={tradeName} maxLength={160} onChange={(event) => setTradeName(event.target.value)} />
        </label>
        <label>
          CNPJ / CPF
          <input value={document} maxLength={20} inputMode="numeric" onChange={(event) => setDocument(event.target.value)} />
        </label>
      </div>
      <div className="quick-modal__row">
        <label>
          Telefone / WhatsApp
          <input value={phone} maxLength={30} inputMode="tel" onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label>
          E-mail
          <input value={email} maxLength={160} type="email" onChange={(event) => setEmail(event.target.value)} />
        </label>
      </div>
    </QuickModal>
  );
}

export function QuickCreateBrand({ onClose, onCreated }: { onClose: () => void; onCreated: (brand: Brand) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!name.trim()) return setError('Informe o nome da marca.');
    setBusy(true);
    setError('');
    try {
      onCreated(await createBrand(name));
      onClose();
    } catch (err) {
      setError(message(err, 'Não foi possível salvar a marca.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <QuickModal title="Nova marca" busy={busy} error={error} onClose={onClose} onSubmit={save} submitLabel="Salvar marca">
      <label>
        Nome da marca *
        <input value={name} maxLength={80} placeholder="Ex.: Samsung" onChange={(event) => setName(event.target.value)} />
      </label>
    </QuickModal>
  );
}

/** Atributo com seus valores (ex.: Cor → Preto, Azul). Já vale no estoque, totem, PDV e venda externa. */
export function QuickCreateAttribute({ onClose, onCreated }: { onClose: () => void; onCreated: (attribute: ProductAttribute) => void }) {
  const [name, setName] = useState('');
  const [values, setValues] = useState('');
  const [filterOnTotem, setFilterOnTotem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const list = [...new Set(values.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean))];
    if (!name.trim()) return setError('Informe o nome do atributo.');
    if (!list.length) return setError('Informe pelo menos um valor, separados por vírgula.');
    setBusy(true);
    setError('');
    try {
      const all = await createAttribute({
        name: name.trim(),
        values: list,
        priceDeltas: {},
        useOnTotem: true,
        filterOnTotem,
        useOnStock: true,
        useOnPdv: true,
        useOnExternalSale: true,
        sort: 0,
        active: true,
      });
      const created = all.find((item) => item.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (created) onCreated(created);
      onClose();
    } catch (err) {
      setError(message(err, 'Não foi possível salvar o atributo.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <QuickModal title="Novo atributo" subtitle="Ex.: Cor, Capacidade, Tamanho, Sabor." busy={busy} error={error} onClose={onClose} onSubmit={save} submitLabel="Salvar atributo">
      <label>
        Nome do atributo *
        <input value={name} maxLength={60} placeholder="Ex.: Cor" onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Valores *
        <textarea rows={3} value={values} placeholder="Ex.: Preto, Branco, Azul" onChange={(event) => setValues(event.target.value)} />
        <small>Separe os valores por vírgula. Dá para acrescentar outros depois em Atributos.</small>
      </label>
      <label className="quick-modal__check">
        <input type="checkbox" checked={filterOnTotem} onChange={(event) => setFilterOnTotem(event.target.checked)} />
        Usar como filtro na vitrine do totem
      </label>
    </QuickModal>
  );
}

/** Cliente direto da venda, OS ou financeiro: a mesma ficha em todas as telas (nome é o único obrigatório). */
export function QuickCreateCustomer({
  initial,
  onClose,
  onCreated,
}: {
  /** O que já foi digitado na tela (nome, telefone, CPF) entra preenchido. */
  initial?: { name?: string; phone?: string; document?: string; email?: string };
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}) {
  const [draft, setDraft] = useState<CustomerDraft>(() => emptyCustomerDraft(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    try {
      onCreated(await saveCustomerDraft(draft));
      onClose();
    } catch (err) {
      setError(message(err, 'Não foi possível salvar o cliente.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <QuickModal title="Novo cliente" subtitle="Cadastro rápido com os dados da ficha de venda. Digite o CEP para preencher o endereço." className="customer-quick-modal" busy={busy} error={error} onClose={onClose} onSubmit={save} submitLabel="Salvar cliente">
      <CustomerQuickFields value={draft} onChange={setDraft} />
    </QuickModal>
  );
}

/** Vendedor direto da venda: nome é o único obrigatório; o cadastro completo fica em Pessoas › Vendedores. */
export function QuickCreateSeller({ onClose, onCreated }: { onClose: () => void; onCreated: (seller: ApiSeller) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [commission, setCommission] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!name.trim()) return setError('Informe o nome do vendedor.');
    const commissionPercent = Number(commission.replace(',', '.')) || 0;
    if (commissionPercent < 0 || commissionPercent > 100) return setError('Comissão deve ficar entre 0 e 100%.');
    setBusy(true);
    setError('');
    try {
      const seller = await apiCreateSeller({ name: name.trim(), phone: phone.trim(), email: '', document: '', commissionPercent, active: true });
      onCreated(seller);
      onClose();
    } catch (err) {
      setError(message(err, 'Não foi possível salvar o vendedor.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <QuickModal title="Novo vendedor" subtitle="Cadastro rápido. Os demais dados podem ser completados em Pessoas › Vendedores." busy={busy} error={error} onClose={onClose} onSubmit={save} submitLabel="Salvar vendedor">
      <label>
        Nome do vendedor *
        <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="quick-modal__row">
        <label>
          Telefone / WhatsApp
          <input value={phone} maxLength={30} inputMode="tel" onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label>
          Comissão (%)
          <input value={commission} maxLength={6} inputMode="decimal" placeholder="0" onChange={(event) => setCommission(event.target.value)} />
        </label>
      </div>
    </QuickModal>
  );
}
