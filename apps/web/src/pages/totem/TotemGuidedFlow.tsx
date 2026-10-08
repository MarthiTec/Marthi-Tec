import { useState } from 'react';
import { assistantText, type TotemAssistantSettings } from '../../data/totemAssistant';
import { TotemKeyboard } from './TotemKeyboard';

export function TotemGuidedFlow({
  settings,
  brands,
  hasOffers,
  onComplete,
  onCancel,
}: {
  settings: TotemAssistantSettings;
  brands: { id: string; label: string; logo?: string }[];
  hasOffers: boolean;
  onComplete: (name: string, intent: string, brand: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [intent, setIntent] = useState('all');
  const [stage, setStage] = useState<'name' | 'intent' | 'brand'>('name');

  function afterIntent(value: string) {
    setIntent(value);
    if (settings.askBrand && brands.length) setStage('brand');
    else onComplete(name.trim(), value, 'all');
  }
  function afterName() {
    if (!name.trim()) return;
    if (settings.askIntent) setStage('intent');
    else afterIntent('all');
  }

  const prompt = stage === 'name' ? settings.namePrompt : stage === 'intent' ? settings.intentPrompt : settings.brandPrompt;

  return (
    <section className="totem-guided">
      <div className="totem-guided__avatar">
        {settings.avatar ? <img src={settings.avatar} alt={settings.name} /> : <span aria-hidden="true">{settings.name.slice(0, 1)}</span>}
      </div>
      <p className="totem-guided__seller">{settings.name} · Assistente da loja</p>

      {/* key={stage} reinicia a animação de entrada a cada pergunta, para parecer uma
          mensagem nova chegando em vez de um texto estático trocando de lugar. */}
      <div className="totem-guided__bubble" key={stage}>
        <h1>{assistantText(prompt, name, settings.name)}</h1>
      </div>

      {stage === 'name' ? (
        <form
          className="totem-guided__stage"
          onSubmit={(e) => {
            e.preventDefault();
            afterName();
          }}
        >
          <label>
            Como você prefere ser chamado?
            <input autoComplete="nickname" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <TotemKeyboard
            mode="letters"
            onKey={(key) => setName((current) => (current + key).slice(0, 100))}
            onBackspace={() => setName((current) => current.slice(0, -1))}
            onSpace={() => setName((current) => (current + ' ').slice(0, 100))}
            onClear={() => setName('')}
            onClose={afterName}
          />
          <button className="totem-btn totem-btn--primary" disabled={!name.trim()}>
            Continuar
          </button>
        </form>
      ) : stage === 'intent' ? (
        <div className="totem-guided__choices">
          {[
            { id: 'low', label: 'Preço baixo' },
            { id: 'offers', label: 'Ofertas do dia' },
            { id: 'new', label: 'Novidades' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className="totem-btn totem-btn--primary"
              disabled={item.id === 'offers' && !hasOffers}
              onClick={() => afterIntent(item.id)}
            >
              {item.label}
            </button>
          ))}
          {!hasOffers && <p>Não há ofertas ativas neste momento.</p>}
        </div>
      ) : (
        <div className="totem-guided__choices">
          {brands.map((brand) => (
            <button key={brand.id} className={`totem-btn totem-btn--primary${brand.logo ? ' totem-guided__brand' : ''}`} onClick={() => onComplete(name.trim(), intent, brand.id)}>
              {brand.logo ? <span className="totem-guided__brand-logo" aria-hidden="true"><img src={brand.logo} alt="" /></span> : null}
              {brand.label}
            </button>
          ))}
          <button className="totem-btn totem-btn--ghost" onClick={() => onComplete(name.trim(), intent, 'all')}>
            Ver todas as marcas
          </button>
        </div>
      )}
      <button className="totem-link" onClick={onCancel}>
        Voltar
      </button>
    </section>
  );
}
