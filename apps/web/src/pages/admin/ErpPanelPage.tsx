import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { AdminPicker } from '../../components/AdminPicker';
import { getAdminState, savePriceTables, saveStock } from '../../data/adminStore';
import { boletoSnapshot } from '../../data/boletoStore';
import {
  clearErpUserPassword,
  getErpUserPasswordHint,
  setErpUserPassword,
} from '../../data/erpUserPasswords';
import { EMPLOYEE_ROLE_LABEL, listEmployees } from '../../data/erpRegistry';
import { money, payablesOpenTotal, receivablesOpenTotal } from '../../data/financeBook';

/** Visão administrativa do ERP — operação completa em /erp. */
export function ErpPanelPage() {
  const [tick, setTick] = useState(0);
  const [pricePercent, setPricePercent] = useState('5');
  const [tableId, setTableId] = useState('');
  const [tablePercent, setTablePercent] = useState('0');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const state = useMemo(() => getAdminState(), [tick]);
  const users = useMemo(
    () => listEmployees(true).filter((item) => item.isSystemUser),
    [tick],
  );
  const boletos = useMemo(() => boletoSnapshot(), [tick]);
  const lowStock = state.stock.filter((item) => item.qty <= item.minQty).length;

  function refresh(msg: string) {
    setMessage(msg);
    setError('');
    setTick((value) => value + 1);
  }

  function adjustCatalogPrices(event: FormEvent) {
    event.preventDefault();
    const percent = Number(pricePercent.replace(',', '.'));
    if (!Number.isFinite(percent)) {
      setError('Percentual inválido.');
      return;
    }
    const factor = 1 + percent / 100;
    const next = state.stock.map((item) => ({
      ...item,
      price: Math.max(0, Math.round(item.price * factor * 100) / 100),
    }));
    saveStock(next);
    refresh(`Preços de estoque ajustados em ${percent > 0 ? '+' : ''}${percent}%.`);
  }

  function adjustPriceTable(event: FormEvent) {
    event.preventDefault();
    if (!tableId) {
      setError('Selecione a tabela.');
      return;
    }
    const percent = Number(tablePercent.replace(',', '.'));
    if (!Number.isFinite(percent)) {
      setError('Percentual inválido.');
      return;
    }
    const next = state.priceTables.map((item) =>
      item.id === tableId ? { ...item, percent } : item,
    );
    savePriceTables(next);
    const name = next.find((item) => item.id === tableId)?.name ?? tableId;
    refresh(`Tabela ${name} atualizada para ${percent}%.`);
  }

  function savePassword(event: FormEvent) {
    event.preventDefault();
    try {
      setErpUserPassword(userEmail, userPassword);
      setUserPassword('');
      refresh(`Senha local definida para ${userEmail.trim().toLowerCase()}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar senha.');
    }
  }

  function clearPassword() {
    if (!userEmail.trim()) {
      setError('Selecione o usuário.');
      return;
    }
    clearErpUserPassword(userEmail);
    refresh(`Senha local removida de ${userEmail.trim().toLowerCase()}.`);
  }

  return (
    <section className="admin-page">
      <div className="admin-toolbar admin-toolbar--lead" style={{ marginBottom: 12 }}>
        <p className="empty" style={{ margin: 0, flex: '1 1 240px', minWidth: 0 }}>
          Ajustes rápidos para dono/gerente. Cadastros completos, boletos e retaguarda ficam no app
          ERP.
        </p>
        <Link to="/erp" className="btn btn--primary">
          <AdminIcon name="ops" />
          Abrir ERP
        </Link>
      </div>

      <div className="admin-grid">
        <article className="admin-card">
          <h2>Produtos</h2>
          <strong>{state.stock.length}</strong>
          <p>
            {lowStock ? (
              <span className="qty-low">{lowStock} abaixo do mínimo</span>
            ) : (
              'Estoque ok'
            )}
          </p>
        </article>
        <article className="admin-card">
          <h2>A receber</h2>
          <strong>{money(receivablesOpenTotal())}</strong>
          <p>Títulos em aberto.</p>
        </article>
        <article className="admin-card">
          <h2>A pagar</h2>
          <strong>{money(payablesOpenTotal())}</strong>
          <p>Títulos em aberto.</p>
        </article>
        <article className="admin-card">
          <h2>Boletos</h2>
          <strong>{boletos.open}</strong>
          <p>{money(boletos.openAmount)} em aberto</p>
        </article>
      </div>

      {message ? <p className="empty">{message}</p> : null}
      {error ? <p className="qty-low">{error}</p> : null}

      <div className="admin-grid admin-grid--2" style={{ marginTop: 12 }}>
        <article className="admin-card">
          <h2>Ajuste rápido de preço</h2>
          <p className="empty">Aplica percentual em todos os preços de estoque.</p>

          <form onSubmit={adjustCatalogPrices}>
            <div className="admin-form">
              <label className="span-2">
                Percentual (%)
                <input
                  value={pricePercent}
                  onChange={(e) => setPricePercent(e.target.value)}
                  inputMode="decimal"
                  placeholder="Ex.: 5 ou -3"
                />
              </label>
            </div>
            <div className="admin-toolbar" style={{ marginTop: 12 }}>
              <button type="submit" className="btn btn--primary">
                Aplicar no catálogo
              </button>
            </div>
          </form>

          <hr className="admin-divider" />

          <form onSubmit={adjustPriceTable}>
            <div className="admin-form">
              <AdminPicker
                label="Tabela"
                value={tableId}
                placeholder="Selecionar tabela"
                options={[
                  { value: '', label: 'Selecionar tabela' },
                  ...state.priceTables.map((item) => ({
                    value: item.id,
                    label: `${item.name} (${item.percent}%)`,
                  })),
                ]}
                onChange={(value) => {
                  setTableId(value);
                  const table = state.priceTables.find((item) => item.id === value);
                  if (table) setTablePercent(String(table.percent));
                }}
              />
              <label>
                Novo percentual (%)
                <input
                  value={tablePercent}
                  onChange={(e) => setTablePercent(e.target.value)}
                  inputMode="decimal"
                />
              </label>
            </div>
            <div className="admin-toolbar" style={{ marginTop: 12 }}>
              <button type="submit" className="btn btn--ghost">
                Atualizar tabela
              </button>
              <Link to="/erp/tabelas" className="btn btn--ghost">
                Abrir tabelas no ERP
              </Link>
            </div>
          </form>
        </article>

        <article className="admin-card">
          <h2>Senhas de usuário</h2>
          <p className="empty">
            Senha local de retaguarda (demo). Também pode definir no cadastro de{' '}
            <Link to="/erp/funcionarios">Funcionários</Link> ou em{' '}
            <Link to="/erp/permissoes">Permissões</Link>.
          </p>
          <form onSubmit={savePassword}>
            <div className="admin-form">
              <AdminPicker
                label="Usuário"
                value={userEmail}
                placeholder="Selecionar usuário"
                options={[
                  { value: '', label: 'Selecionar usuário' },
                  ...users.map((item) => ({
                    value: item.userEmail || item.email,
                    label: `${item.name} · ${item.userEmail || item.email}`,
                  })),
                ]}
                onChange={setUserEmail}
              />
              <label>
                Nova senha
                <input
                  type="password"
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Mínimo 4 caracteres"
                />
              </label>
            </div>
            {userEmail ? (
              <p className="empty" style={{ marginTop: 10 }}>
                Status: {getErpUserPasswordHint(userEmail)}
              </p>
            ) : null}
            <div className="admin-toolbar" style={{ marginTop: 12 }}>
              <button type="submit" className="btn btn--primary">
                Salvar senha
              </button>
              <button type="button" className="btn btn--ghost" onClick={clearPassword}>
                Remover
              </button>
              <Link to="/erp/permissoes" className="btn btn--ghost">
                Permissões no ERP
              </Link>
            </div>
          </form>
        </article>
      </div>

      <article className="admin-card" style={{ marginTop: 12 }}>
        <div className="admin-toolbar">
          <h2 style={{ margin: 0 }}>Usuários com acesso</h2>
          <Link to="/erp/funcionarios" className="btn btn--ghost">
            Funcionários
          </Link>
        </div>
        {users.length === 0 ? (
          <p className="empty">Nenhum usuário do sistema cadastrado.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Login</th>
                  <th>Perfil</th>
                  <th>Senha local</th>
                </tr>
              </thead>
              <tbody>
                {users.map((item) => {
                  const email = item.userEmail || item.email;
                  return (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{email}</td>
                      <td>{EMPLOYEE_ROLE_LABEL[item.role]}</td>
                      <td>{getErpUserPasswordHint(email)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <div className="admin-toolbar" style={{ marginTop: 12 }}>
        <Link to="/erp/produtos" className="btn btn--ghost">
          Produtos
        </Link>
        <Link to="/erp/financeiro" className="btn btn--ghost">
          Financeiro
        </Link>
        <Link to="/erp/boletos" className="btn btn--ghost">
          Boletos
        </Link>
        <Link to="/erp/relatorios" className="btn btn--ghost">
          Relatórios
        </Link>
      </div>
    </section>
  );
}
