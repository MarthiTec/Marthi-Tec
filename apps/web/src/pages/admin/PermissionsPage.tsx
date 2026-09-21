import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { useAuth } from '../../contexts/AuthContext';
import { logAction } from '../../data/auditLog';
import {
  ACCESS_AREA_LABEL,
  ALL_ACCESS_AREAS,
  EMPLOYEE_ROLE_LABEL,
  findEmployeeByUserEmail,
  listEmployees,
  upsertEmployee,
  userIsStoreAdmin,
  type AccessArea,
  type Employee,
  type EmployeeRole,
} from '../../data/erpRegistry';

export function PermissionsPage() {
  const { user } = useAuth();
  const isAdmin = userIsStoreAdmin(user?.email);
  const [items, setItems] = useState(() => listEmployees().filter((item) => item.isSystemUser));
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );
  const me = findEmployeeByUserEmail(user?.email);

  if (!isAdmin) {
    return <Navigate to="/painel" replace />;
  }

  function toggleArea(area: AccessArea) {
    if (!selected || selected.role === 'admin') return;
    const has = selected.accessAreas.includes(area);
    const accessAreas = has
      ? selected.accessAreas.filter((item) => item !== area)
      : [...selected.accessAreas, area];
    saveEmployee({ ...selected, accessAreas });
  }

  function saveEmployee(next: Employee) {
    const result = upsertEmployee({
      id: next.id,
      name: next.name,
      phone: next.phone,
      email: next.email,
      document: next.document,
      role: next.role,
      isSystemUser: next.isSystemUser,
      userEmail: next.userEmail,
      accessAreas: next.accessAreas,
      active: next.active,
      sellerId: next.sellerId,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const users = result.state.employees.filter((item) => item.isSystemUser);
    setItems(users);
    setSelectedId(next.id);
    setError('');
    setMessage('Permissões atualizadas.');
    logAction({
      actorName: user?.name ?? 'Admin',
      actorEmail: user?.email ?? '',
      action: 'permissoes.atualizar',
      detail: `${next.name} · ${next.userEmail || next.email}`,
    });
  }

  function setRole(role: EmployeeRole) {
    if (!selected) return;
    saveEmployee({
      ...selected,
      role,
      accessAreas: role === 'admin' ? [...ALL_ACCESS_AREAS] : selected.accessAreas,
    });
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>Permissões de acesso</h2>
        <p>
          Cadastre quem é usuário do sistema em{' '}
          <Link to="/erp/funcionarios">Funcionários</Link> (marque “É usuário do sistema”) e
          ajuste aqui as áreas liberadas. Apenas administradores gerenciam permissões e o plano da
          loja.
        </p>
        {me ? (
          <p className="empty">
            Seu vínculo: {me.name} · {EMPLOYEE_ROLE_LABEL[me.role]} · {me.userEmail || me.email}
          </p>
        ) : (
          <p className="empty">
            Nenhum funcionário vinculado ao seu login ainda — vincule o e-mail em Funcionários para
            travar o ACL.
          </p>
        )}
      </article>

      {message ? <p className="empty">{message}</p> : null}
      {error ? <p className="qty-low">{error}</p> : null}

      <div className="admin-ops">
        <article className="admin-card">
          <h2>Usuários do sistema</h2>
          {items.length === 0 ? (
            <p className="empty">Nenhum usuário do sistema cadastrado.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Login</th>
                  <th>Cargo</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={item.id === selectedId ? 'is-selected' : ''}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedId(item.id);
                      setMessage('');
                    }}
                  >
                    <td>{item.name}</td>
                    <td>{item.userEmail || item.email || '—'}</td>
                    <td>{EMPLOYEE_ROLE_LABEL[item.role]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>

        <article className="admin-card">
          <h2>Áreas liberadas</h2>
          {!selected ? (
            <p className="empty">Selecione um usuário.</p>
          ) : (
            <>
              <AdminPicker
                label="Cargo"
                value={selected.role}
                options={(Object.keys(EMPLOYEE_ROLE_LABEL) as EmployeeRole[]).map((role) => ({
                  value: role,
                  label: EMPLOYEE_ROLE_LABEL[role],
                }))}
                onChange={(value) => setRole(value as EmployeeRole)}
              />
              {selected.role === 'admin' ? (
                <p className="empty" style={{ marginTop: 12 }}>
                  Administrador tem acesso total, incluindo plano da loja.
                </p>
              ) : (
                <div className="erp-access__grid" style={{ marginTop: 12 }}>
                  {ALL_ACCESS_AREAS.map((area) => (
                    <label key={area} className="erp-access__item">
                      <input
                        type="checkbox"
                        checked={selected.accessAreas.includes(area)}
                        onChange={() => toggleArea(area)}
                      />
                      {ACCESS_AREA_LABEL[area]}
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </article>
      </div>
    </section>
  );
}
