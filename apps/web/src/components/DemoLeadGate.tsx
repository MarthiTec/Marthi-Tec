import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DEMO_PRODUCT_LABEL,
  saveDemoLead,
  type DemoProduct,
} from '../data/demoLeadStore';
import './demo-lead-gate.css';

type DemoLeadGateProps = {
  product: DemoProduct;
  open: boolean;
  onClose: () => void;
  /** Rota após capturar o lead (ex.: /caixa, /totem). */
  to: string;
};

export function DemoLeadGate({ product, open, onClose, to }: DemoLeadGateProps) {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = saveDemoLead({
      product,
      firstName,
      lastName,
      email,
      whatsapp,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
    navigate(to);
  }

  return (
    <div className="demo-gate" role="dialog" aria-modal="true" aria-labelledby="demo-gate-title">
      <button type="button" className="demo-gate__backdrop" aria-label="Fechar" onClick={onClose} />
      <form className="demo-gate__card" onSubmit={submit}>
        <p className="demo-gate__kicker">Demo · {DEMO_PRODUCT_LABEL[product]}</p>
        <h2 id="demo-gate-title">Antes de experimentar</h2>
        <p>
          Preencha seus dados para liberar a demo. Isso vira um lead no CRM da Marthi — sem
          compromisso de contratação.
        </p>
        {error ? <p className="demo-gate__error">{error}</p> : null}
        <div className="demo-gate__grid">
          <label>
            Nome
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoFocus />
          </label>
          <label>
            Sobrenome
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </label>
          <label className="demo-gate__full">
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="demo-gate__full">
            WhatsApp
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="(24) 98124-4253"
              required
              inputMode="tel"
            />
          </label>
        </div>
        <div className="demo-gate__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary">
            Abrir demo
          </button>
        </div>
      </form>
    </div>
  );
}
