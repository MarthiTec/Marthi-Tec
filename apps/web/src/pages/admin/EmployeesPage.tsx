import { useMemo, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { useAuth } from '../../contexts/AuthContext';
import { logAction } from '../../data/auditLog';
import {
  ACCESS_AREA_LABEL,
  ALL_ACCESS_AREAS,
  EMPLOYEE_ROLE_LABEL,
  listEmployees,
  listSellers,
  upsertEmployee,
  type AccessArea,
  type Employee,
  type EmployeeRole,
} from '../../data/erpRegistry';

const EMPTY = {
  name: '',
  phone: '',
  email: '',
  document: '',
  role: 'operator' as EmployeeRole,
  isSystemUser: false,
  userEmail: '',
  accessAreas: ['os', 'pdv'] as AccessArea[],
  active: true,
  sellerId: '',
};

export function EmployeesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState(() => listEmployees());
  const [sellers] = useState(() => listSellers(true));
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) =>
      `${item.name} ${item.email} ${item.userEmail} ${item.role}`.toLowerCase().includes(needle),
    );
  }, [items, query]);

  function toggleArea(area: AccessArea) {
    setForm((current) => {
      const has = current.accessAreas.includes(area);
      return {
        ...current,
        accessAreas: has
          ? current.accessAreas.filter((item) => item !== area)
          : [...current.accessAreas, area],
      };
    });
  }

  function submit() {
    setError('');
    const result = upsertEmployee({
      ...form,
      id: editingId,
      sellerId: form.sellerId || undefined,
      userEmail: form.isSystemUser ? form.userEmail || form.email : '',
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems(result.state.employees);
    logAction({
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
      action: editingId ? 'funcionario.atualizar' : 'funcionario.criar',
      detail: `${form.name} · usuário=${form.isSystemUser ? 'sim' : 'não'}`,
    });
    setForm(EMPTY);
    setEditingId(undefined);
  }

  function edit(item: Employee) {
    setEditingId(item.id);
    setError('');
    setForm({
      name: item.name,
      phone: item.phone,
      email: item.email,
      document: item.document,
      role: item.role,
      isSystemUser: item.isSystemUser,
      userEmail: item.userEmail,
      accessAreas: item.accessAreas,
      active: item.active,
      sellerId: item.sellerId ?? '',
    });
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>{editingId ? 'Editar funcionário' : 'Novo funcionário'}</h2>
        <p>
          Marque <strong>É usuário do sistema</strong> para liberar login. O e-mail de login precisa
          ser o mesmo do Google/senha. Áreas abaixo travam módulos do painel.
        </p>
        <div className="admin-form">
          <label>
            Nome
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Telefone
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label>
            E-mail de contato
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            CPF
            <input
              value={form.document}
              onChange={(e) => setForm({ ...form, document: e.target.value })}
            />
          </label>
          <AdminPicker
            label="Cargo"
            value={form.role}
            options={(Object.keys(EMPLOYEE_ROLE_LABEL) as EmployeeRole[]).map((role) => ({
              value: role,
              label: EMPLOYEE_ROLE_LABEL[role],
            }))}
            onChange={(value) => setForm({ ...form, role: value as EmployeeRole })}
          />
          <AdminPicker
            label="Vendedor vinculado"
            value={form.sellerId}
            placeholder="Nenhum"
            options={sellers.map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) => setForm({ ...form, sellerId: value })}
          />
          <AdminPicker
            label="É usuário do sistema?"
            value={form.isSystemUser ? '1' : '0'}
            options={[
              { value: '1', label: 'Sim — pode entrar no painel' },
              { value: '0', label: 'Não — só cadastro RH' },
            ]}
            onChange={(value) =>
              setForm({
                ...form,
                isSystemUser: value === '1',
                userEmail: value === '1' ? form.userEmail || form.email : '',
              })
            }
          />
          <AdminPicker
            label="Situação"
            value={form.active ? '1' : '0'}
            options={[
              { value: '1', label: 'Ativo' },
              { value: '0', label: 'Inativo' },
            ]}
            onChange={(value) => setForm({ ...form, active: value === '1' })}
          />
          {form.isSystemUser ? (
            <label className="span-2">
              E-mail de login (deve bater com o usuário)
              <input
                value={form.userEmail}
                onChange={(e) => setForm({ ...form, userEmail: e.target.value })}
                placeholder={user?.email ? `ex.: ${user.email}` : 'email@loja.com'}
              />
            </label>
          ) : null}
        </div>

        {form.isSystemUser && form.role !== 'admin' ? (
          <div className="erp-access" style={{ marginTop: 16 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '0.82rem', color: 'var(--mute)' }}>
              Áreas liberadas
            </h3>
            <div className="erp-access__grid">
              {ALL_ACCESS_AREAS.map((area) => (
                <label key={area} className="erp-access__item">
                  <input
                    type="checkbox"
                    checked={form.accessAreas.includes(area)}
                    onChange={() => toggleArea(area)}
                  />
                  {ACCESS_AREA_LABEL[area]}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {form.role === 'admin' ? (
          <p className="empty" style={{ marginTop: 12 }}>
            Administrador tem acesso a todas as áreas.
          </p>
        ) : null}

        {error ? <p className="qty-low">{error}</p> : null}
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={submit}>
            {editingId ? 'Salvar' : 'Cadastrar'}
          </button>
        </div>
      </article>

      <article className="admin-card">
        <div className="admin-toolbar">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar funcionário…"
          />
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Cargo</th>
              <th>Usuário?</th>
              <th>Login</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{EMPLOYEE_ROLE_LABEL[item.role]}</td>
                <td>{item.isSystemUser ? 'Sim' : 'Não'}</td>
                <td>{item.isSystemUser ? item.userEmail || item.email || '—' : '—'}</td>
                <td>{item.active ? 'Ativo' : 'Inativo'}</td>
                <td>
                  <button type="button" className="btn btn--ghost" onClick={() => edit(item)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
