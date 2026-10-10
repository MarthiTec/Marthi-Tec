import { useEffect, useState } from 'react';
import { apiGetStockMode, apiSaveStockMode, type StockMode } from '../services/productCatalogApi';

const OPTIONS: Array<{ value: StockMode; title: string; text: string }> = [
  {
    value: 'simple',
    title: 'Simplificado',
    text: 'Cadastro rápido: Marca → Tipo → Modelo montam a descrição; foto e grade de variações. Grupo, fornecedor e datas ficam na aba Especificações.',
  },
  {
    value: 'standard',
    title: 'Padrão',
    text: 'Cadastro completo com todas as abas (configurações, ofertas, fiscal), grupos, sugestões de preço e ajuda de cadastro.',
  },
];

/** Modo do cadastro de produtos e estoque da loja (gravado na loja, via API). */
export function StockModeSettings() {
  const [mode, setMode] = useState<StockMode | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiGetStockMode()
      .then((data) => alive && setMode(data.mode))
      .catch((error) => alive && setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o modo do estoque.'));
    return () => {
      alive = false;
    };
  }, []);

  async function choose(next: StockMode) {
    if (next === mode || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await apiSaveStockMode(next);
      setMode(saved.mode);
      setMessage(saved.mode === 'simple' ? 'Estoque simplificado ativado.' : 'Estoque padrão ativado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar o modo do estoque.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="admin-card stock-mode-settings">
      <header className="stock-mode-settings__head">
        <h2>Produtos &amp; Estoque</h2>
        <p>Escolha como a loja cadastra produtos e dá entrada no estoque.</p>
      </header>
      <div className="stock-mode-settings__options" role="radiogroup" aria-label="Modo do estoque">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={mode === option.value}
            disabled={mode === null || saving}
            className={`stock-mode-settings__option ${mode === option.value ? 'is-active' : ''}`}
            onClick={() => choose(option.value)}
          >
            <strong>{option.title}</strong>
            <span>{option.text}</span>
          </button>
        ))}
      </div>
      {message ? <p className="stock-mode-settings__message">{message}</p> : null}
    </article>
  );
}
