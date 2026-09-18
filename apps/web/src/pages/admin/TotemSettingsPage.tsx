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
  const [mode, setMode] = useState<TotemMode>(() => getTotemSettings().mode);
  const [saved, setSaved] = useState(false);

  function save() {
    saveTotemSettings({ mode });
    setSaved(true);
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>Modo do totem</h2>
        <p>
          Vale para a tela pública em /totem. Quiosque envia proposta ao representante; catálogo
          só exibe o mix da loja.
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
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.text}</span>
            </button>
          ))}
        </div>
        <div className="admin-toolbar admin-toolbar--stack">
          <button type="button" className="btn btn--primary" onClick={save}>
            Salvar modo do totem
          </button>
          {saved ? <span className="empty">Totem atualizado. Abra /totem para ver o modo.</span> : null}
        </div>
      </article>

      <article className="admin-card">
        <h2>Atributos no totem</h2>
        <p>
          Cor, capacidade, tamanho ou armação nascem no ERP (até 5 atributos). O preço no totem
          acompanha a variação de estoque e o ajuste de valores como retirada.
        </p>
        <div className="admin-toolbar admin-toolbar--stack">
          <Link to="/painel/atributos" className="btn btn--ghost">
            Cadastrar atributos
          </Link>
        </div>
      </article>
    </section>
  );
}
