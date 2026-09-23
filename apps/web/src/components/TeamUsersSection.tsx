import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from './AdminPicker';
import { useAuth } from '../contexts/AuthContext';
import { logAction } from '../data/auditLog';
import { ERP_BOOTSTRAP_EVENT } from '../data/erpBootstrap';
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
} from '../data/erpRegistry';
import { hasModule } from '../data/storePlan';

const EMPTY = {
  name: '',
  phone: '',
  email: '',
  document: '',
  role: 'operator' as EmployeeRole,
  isSystemUser: true,
  userEmail: '',
  accessAreas: ['os', 'pdv'] as AccessArea[],
  active: true,
  sellerId: '',
};

export function areasAvailableOnPlan(): AccessArea[] {
  return ALL_ACCESS_AREAS.filter((area) => {
    switch (area) {
      case 'totem':
        return hasModule('totem');
      case 'os':
        return hasModule('os');
      case 'ecommerce':
        return hasModule('ecommerce');
      case 'erp_fiscal':
      case 'erp_invoices':
        return hasModule('fiscal');
      case 'pdv':
      case 'erp_customers':
      case 'erp_stock':
      case 'erp_attrs':
      case 'erp_prices':
      case 'erp_payments':
      case 'erp_finance':
      case 'erp_sellers':
      case 'erp_suppliers':
      case 'erp_employees':
      case 'erp_audit':
        return hasModule('erp');
      case 'erp_plan':
        return true;
      default:
        return true;
    }
  });
}

function defaultAccessForPlan(): AccessArea[] {
  const available = areasAvailableOnPlan();
  const preferred: AccessArea[] = [];
  if (available.includes('totem')) preferred.push('totem');
  if (available.includes('os')) preferred.push('os');
  if (available.includes('pdv')) preferred.push('pdv');
  return preferred.length ? preferred : available.filter((a) => a !== 'erp_plan').slice(0, 2);
}

type Props = {
  variant: 'operations' | 'full';
  id?: string;
};

/** Cadastro de funcionários / usuários do sistema (compartilhado entre Operações e ERP). */
export function TeamUsersSection({ variant, id }: Props) {
  const { user } = useAuth();
  const planAreas = useMemo(() => areasAvailableOnPlan(), []);
  const showSellerLink = variant === 'full' && hasModule('erp');
  const [items, setItems] = useState(() => listEmployees());
  const [sellers] = useState(() => (showSellerLink ? listSellers(true) : []));
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ ...EMPTY, accessAreas: defaultAccessForPlan() });
  const [editingId, setEditingId] = useState<string | undefined>();
  const [error, setError] = useState('');

  useEffect(() => {
    function refresh() {
      setItems(listEmployees());
    }
    window.addEventListener(ERP_BOOTSTRAP_EVENT, refresh);
    window.addEventListener('marthi-erp-registry-updated', refresh);
    return () => {
      window.removeEventListener(ERP_BOOTSTRAP_EVENT, refresh);
      window.removeEventListener('marthi-erp-registry-updated', refresh);
    };
  }, []);

  const areaOptions = variant === 'operations' ? planAreas : ALL_ACCESS_AREAS;

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

  async function submit() {
    setError('');
    const accessAreas = form.accessAreas.filter((area) => areaOptions.includes(area));
    const result = await upsertEmployee({
      ...form,
      id: editingId,
      sellerId: form.sellerId || undefined,
      userEmail: form.isSystemUser ? form.userEmail || form.email : '',
      accessAreas,
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
    setForm({ ...EMPTY, accessAreas: defaultAccessForPlan() });
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
      accessAreas: item.accessAreas.filter((a) => areaOptions.includes(a)),
      active: item.active,
      sellerId: item.sellerId ?? '',
    });
  }

  return (
    <div className={`ops-users ${variant === 'operations' ? 'ops-users--ops' : ''}`} id={id}>
      <article className="admin-card">
        <h2>{variant === 'operations' ? 'Usuários da loja' : 'Funcionários e acesso ao sistema'}</h2>
        {variant === 'operations' ? (
          <p>
            Cadastre quem pode entrar no sistema <strong>sem depender do ERP</strong>. Ideal para
            lojas com Totem, OS ou outros módulos: defina e-mail de login, função e áreas liberadas
            conforme o plano contratado.
          </p>
        ) : (
          <p>
            O <strong>gestor da loja</strong> (admin) cadastra cada operador aqui: e-mail, função e
            áreas liberadas. Marque “Usuário do sistema” para a pessoa entrar em{' '}
            <code>/login</code> com esse e-mail — o app certo abre conforme as permissões (caixa,
            OS, fiscal, painel…).
          </p>
        )}
        <p className="empty" style={{ marginTop: 8 }}>
          Ainda não há convite automático por e-mail. A conta (senha/Google) precisa existir no
          backend Marthi; depois vincule o mesmo e-mail aqui.{' '}
          {variant === 'operations' && hasModule('erp') ? (
            <>
              Cadastro completo de RH também em{' '}
              <Link to="/erp/funcionarios">ERP → Funcionários</Link>.
            </>
          ) : null}
        </p>
      </article>

      <article className="admin-card">
        <h2>{editingId ? 'Editar cadastro' : 'Novo usuário'}</h2>
        <p>
          Marque <strong>É usuário do sistema</strong> para liberar login. O e-mail de login precisa
          ser o mesmo do Google/senha.
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
          {variant === 'full' ? (
            <label>
              CPF
              <input
                value={form.document}
                onChange={(e) => setForm({ ...form, document: e.target.value })}
              />
            </label>
          ) : null}
          <AdminPicker
            label="Cargo"
            value={form.role}
            options={(Object.keys(EMPLOYEE_ROLE_LABEL) as EmployeeRole[]).map((role) => ({
              value: role,
              label: EMPLOYEE_ROLE_LABEL[role],
            }))}
            onChange={(value) => setForm({ ...form, role: value as EmployeeRole })}
          />
          {showSellerLink ? (
            <AdminPicker
              label="Vendedor vinculado"
              value={form.sellerId}
              placeholder="Nenhum"
              options={sellers.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(value) => setForm({ ...form, sellerId: value })}
            />
          ) : null}
          <AdminPicker
            label="É usuário do sistema?"
            value={form.isSystemUser ? '1' : '0'}
            options={[
              { value: '1', label: 'Sim — pode entrar no painel / apps' },
              { value: '0', label: 'Não — só registro interno' },
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
              {variant === 'operations' ? ' (conforme seu plano)' : null}
            </h3>
            <div className="erp-access__grid">
              {areaOptions.map((area) => (
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
            Administrador tem acesso a todas as áreas do plano.
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
            placeholder="Buscar por nome ou e-mail…"
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
                <td>
                  <button
                    type="button"
                    className="admin-table__name-btn"
                    onClick={() => edit(item)}
                    title="Clique para editar"
                  >
                    {item.name}
                  </button>
                </td>
                <td>{EMPLOYEE_ROLE_LABEL[item.role]}</td>
                <td>{item.isSystemUser ? 'Sim' : 'Não'}</td>
                <td>{item.isSystemUser ? item.userEmail || item.email || '—' : '—'}</td>
                <td>{item.active ? 'Ativo' : 'Inativo'}</td>
                <td className="admin-table__actions">
                  <button type="button" className="btn btn--ghost" onClick={() => edit(item)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </div>
  );
}
