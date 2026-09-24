import { useEffect, useMemo, useState } from 'react';

import { AdminPicker } from '../../components/AdminPicker';

import {

  confirmDelete,

  CrudListBar,

  CrudNameButton,

  CrudRowActions,

  crudFormTitle,

  matchesQuery,

  matchesStatus,

  type CrudStatusFilter,

} from '../../components/CrudKit';

import {

  HeadingCancelButton,

  HeadingEditButton,

  HeadingNewButton,

  HeadingSaveButton,

  PageHeadingActions,

} from '../../components/PageHeadingActions';

import { useAuth } from '../../contexts/AuthContext';

import { logAction } from '../../data/auditLog';

import { ERP_BOOTSTRAP_EVENT } from '../../data/erpBootstrap';

import {

  listSellers,

  removeSeller,

  upsertSeller,

  type Seller,

} from '../../data/erpRegistry';



const EMPTY = {

  name: '',

  phone: '',

  email: '',

  document: '',

  commissionPercent: 0,

  active: true,

};



type Mode = 'new' | 'edit' | 'view';



export function SellersPage() {

  const { user } = useAuth();

  const [items, setItems] = useState(() => listSellers());

  const [query, setQuery] = useState('');

  const [status, setStatus] = useState<CrudStatusFilter>('all');

  const [form, setForm] = useState(EMPTY);

  const [mode, setMode] = useState<Mode>('new');

  const [formVisible, setFormVisible] = useState(false);

  const [selectedId, setSelectedId] = useState<string | undefined>();

  useEffect(() => {
    function refresh() {
      setItems(listSellers());
    }
    window.addEventListener(ERP_BOOTSTRAP_EVENT, refresh);
    window.addEventListener('marthi-erp-registry-updated', refresh);
    return () => {
      window.removeEventListener(ERP_BOOTSTRAP_EVENT, refresh);
      window.removeEventListener('marthi-erp-registry-updated', refresh);
    };
  }, []);

  const filtered = useMemo(

    () =>

      items.filter(

        (item) =>

          matchesStatus(item.active, status) &&

          matchesQuery(`${item.name} ${item.phone} ${item.email} ${item.document}`, query),

      ),

    [items, query, status],

  );



  const readOnly = mode === 'view';



  function resetForm() {

    setForm(EMPTY);

    setSelectedId(undefined);

    setMode('new');

  }



  function closeForm() {

    resetForm();

    setFormVisible(false);

  }



  function startNew() {

    resetForm();

    setFormVisible(true);

  }



  function loadItem(item: Seller, nextMode: Mode) {

    setSelectedId(item.id);

    setMode(nextMode);

    setFormVisible(true);

    setForm({

      name: item.name,

      phone: item.phone,

      email: item.email,

      document: item.document,

      commissionPercent: item.commissionPercent,

      active: item.active,

    });

  }



  async function submit() {

    if (readOnly || !form.name.trim()) return;

    const next = await upsertSeller({ ...form, id: mode === 'edit' ? selectedId : undefined });

    setItems(next.sellers);

    logAction({

      actorName: user?.name ?? 'Operador',

      actorEmail: user?.email ?? '',

      action: mode === 'edit' ? 'vendedor.atualizar' : 'vendedor.criar',

      detail: form.name,

    });

    resetForm();

    setFormVisible(false);

  }



  async function remove(item: Seller) {

    if (!confirmDelete(`o vendedor ${item.name}`)) return;

    const next = await removeSeller(item.id);

    setItems(next.sellers);

    logAction({

      actorName: user?.name ?? 'Operador',

      actorEmail: user?.email ?? '',

      action: 'vendedor.excluir',

      detail: item.name,

    });

    if (selectedId === item.id) closeForm();

  }



  useEffect(() => {

    if (!formVisible || readOnly) return;

    function onKey(event: KeyboardEvent) {

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {

        event.preventDefault();

        submit();

      }

    }

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);

  }, [formVisible, readOnly, mode, form, selectedId]);



  const headingActions = (

    <PageHeadingActions>

      {!formVisible ? (

        <HeadingNewButton onClick={startNew} label="Novo vendedor" />

      ) : readOnly ? (

        <>

          <HeadingCancelButton onClick={closeForm} label="Fechar" />

          <HeadingEditButton onClick={() => setMode('edit')} />

        </>

      ) : (

        <>

          <HeadingCancelButton onClick={closeForm} />

          <HeadingSaveButton onClick={() => submit()} />

        </>

      )}

    </PageHeadingActions>

  );



  return (

    <section className="admin-page">

      {headingActions}

      {!formVisible ? (

        <article className="admin-card">

          <CrudListBar

            query={query}

            onQueryChange={setQuery}

            placeholder="Buscar vendedor…"

            status={status}

            onStatusChange={setStatus}

          />

          <table className="admin-table">

            <thead>

              <tr>

                <th>Nome</th>

                <th>Telefone</th>

                <th>Comissão</th>

                <th>Status</th>

                <th></th>

              </tr>

            </thead>

            <tbody>

              {filtered.length === 0 ? (

                <tr>

                  <td colSpan={5} className="empty">

                    Nenhum vendedor encontrado.

                  </td>

                </tr>

              ) : (

                filtered.map((item) => (

                  <tr key={item.id}>

                    <td>

                      <CrudNameButton onClick={() => loadItem(item, 'view')}>{item.name}</CrudNameButton>

                    </td>

                    <td>{item.phone || '—'}</td>

                    <td>{item.commissionPercent}%</td>

                    <td>{item.active ? 'Ativo' : 'Inativo'}</td>

                    <td className="admin-table__actions">

                      <CrudRowActions

                        onView={() => loadItem(item, 'view')}

                        onEdit={() => loadItem(item, 'edit')}

                        onDelete={() => remove(item)}

                      />

                    </td>

                  </tr>

                ))

              )}

            </tbody>

          </table>

        </article>

      ) : null}



      {formVisible ? (

        <article className="admin-card">

          <h2>{crudFormTitle(mode, 'vendedor')}</h2>

          <p>Usado na OS e no PDV para comissão e rastreio de venda.</p>

          <div className={`admin-form ${readOnly ? 'is-readonly' : ''}`}>

            <label>

              Nome

              <input

                value={form.name}

                disabled={readOnly}

                onChange={(e) => setForm({ ...form, name: e.target.value })}

              />

            </label>

            <label>

              Telefone

              <input

                value={form.phone}

                disabled={readOnly}

                onChange={(e) => setForm({ ...form, phone: e.target.value })}

              />

            </label>

            <label>

              E-mail

              <input

                value={form.email}

                disabled={readOnly}

                onChange={(e) => setForm({ ...form, email: e.target.value })}

              />

            </label>

            <label>

              CPF / documento

              <input

                value={form.document}

                disabled={readOnly}

                onChange={(e) => setForm({ ...form, document: e.target.value })}

              />

            </label>

            <label>

              Comissão (%)

              <input

                type="number"

                min={0}

                step={0.1}

                value={form.commissionPercent}

                disabled={readOnly}

                onChange={(e) =>

                  setForm({ ...form, commissionPercent: Number(e.target.value) || 0 })

                }

              />

            </label>

            <AdminPicker

              label="Situação"

              value={form.active ? '1' : '0'}

              disabled={readOnly}

              options={[

                { value: '1', label: 'Ativo' },

                { value: '0', label: 'Inativo' },

              ]}

              onChange={(value) => setForm({ ...form, active: value === '1' })}

            />

          </div>

        </article>

      ) : null}

    </section>

  );

}


