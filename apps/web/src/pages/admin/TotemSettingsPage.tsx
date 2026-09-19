import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getTotemSettings, saveTotemSettings, type TotemMode } from '../../data/totemSettings';

const MODES: { id: TotemMode; title: string; text: string }[] = [
  {
    id: 'kiosk',
    title: 'Quiosque de venda',
    text: 'O cliente escolhe o aparelho, confirma a proposta e o pedido cai na fila do PDV para o representante da loja.',
  },
  {
    id: 'catalog',
    title: 'Catálogo',
    text: 'O totem vira vitrine: o cliente só navega pelos produtos, sem enviar proposta nem abrir pedido.',
  },
];

export function TotemSettingsPage() {
  const initial = getTotemSettings();
  const [mode, setMode] = useState<TotemMode>(() => initial.mode);
  const [exitPassword, setExitPassword] = useState(() => initial.exitPassword);
  const [confirmPassword, setConfirmPassword] = useState(() => initial.exitPassword);
  const [shareStockWithErp, setShareStockWithErp] = useState(() => initial.shareStockWithErp);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    const next = exitPassword.trim();
    if (next.length < 4) {
      setError('A senha precisa ter pelo menos 4 caracteres.');
      setSaved(false);
      return;
    }
    if (next !== confirmPassword.trim()) {
      setError('A confirmação não confere com a senha.');
      setSaved(false);
      return;
    }
    saveTotemSettings({ mode, exitPassword: next, shareStockWithErp });
    setError(null);
    setSaved(true);
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>Modo do totem</h2>
        <p>
          Vale para a tela pública em /totem. Quiosque envia proposta ao representante; catálogo
          só exibe o mix da loja. Após 2 minutos sem toque, o totem volta à tela inicial e limpa
          os filtros.
        </p>
        <div className="plan-picker">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`plan-picker__card ${mode === item.id ? 'is-active' : ''}`}
              onClick={() => {
                setMode(item.id);
                setSaved(false);
                setError(null);
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.text}</span>
            </button>
          ))}
        </div>
      </article>

      <article className="admin-card">
        <h2>Estoque do totem</h2>
        <p>
          Escolha se o catálogo do totem usa o estoque do ERP (itens marcados para exibir) ou um
          catálogo demo separado.
        </p>
        <div className="plan-picker">
          <button
            type="button"
            className={`plan-picker__card ${!shareStockWithErp ? 'is-active' : ''}`}
            onClick={() => {
              setShareStockWithErp(false);
              setSaved(false);
            }}
          >
            <strong>Catálogo isolado</strong>
            <span>Demo / vitrine própria, sem puxar o estoque do ERP.</span>
          </button>
          <button
            type="button"
            className={`plan-picker__card ${shareStockWithErp ? 'is-active' : ''}`}
            onClick={() => {
              setShareStockWithErp(true);
              setSaved(false);
            }}
          >
            <strong>Compartilhar com o ERP</strong>
            <span>Usa o estoque: só itens com “Exibir no totem” e quantidade &gt; 0.</span>
          </button>
        </div>
      </article>

      <article className="admin-card admin-card--form">
        <h2>Senha para sair do totem</h2>
        <p>
          Protege a saída da tela /totem. Só quem souber a senha consegue fechar o quiosque e voltar
          para a home.
        </p>
        <div className="admin-form">
          <label>
            Nova senha
            <input
              type="password"
              value={exitPassword}
              autoComplete="new-password"
              minLength={4}
              onChange={(event) => {
                setExitPassword(event.target.value);
                setSaved(false);
                setError(null);
              }}
              placeholder="Mínimo 4 caracteres"
            />
          </label>
          <label>
            Confirmar senha
            <input
              type="password"
              value={confirmPassword}
              autoComplete="new-password"
              minLength={4}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setSaved(false);
                setError(null);
              }}
              placeholder="Repita a senha"
            />
          </label>
        </div>
        {error ? <p className="qty-low">{error}</p> : null}
        <div className="admin-toolbar admin-toolbar--stack" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={save}>
            Salvar configurações do totem
          </button>
          {saved ? <span className="empty">Configurações do totem salvas.</span> : null}
        </div>
      </article>

      <article className="admin-card">
        <h2>Atributos no totem</h2>
        <p>
          Cor, capacidade e demais atributos nascem no ERP. Imagens do estoque são compartilhadas
          entre totem, PDV e OS.
        </p>
        <div className="admin-toolbar admin-toolbar--stack">
          <Link to="/painel/atributos" className="btn btn--ghost">
            Cadastrar atributos
          </Link>
          <Link to="/painel/estoque" className="btn btn--ghost">
            Estoque e imagens
          </Link>
        </div>
      </article>
    </section>
  );
}
