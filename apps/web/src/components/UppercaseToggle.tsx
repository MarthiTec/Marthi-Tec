import { useState } from 'react';
import './uppercaseToggle.css';

/**
 * "Sempre em MAIÚSCULAS" dos cadastros (produto, cliente, fornecedor, atributos, especificações):
 * começa marcado em toda tela e só vale enquanto ela está aberta — nada fica guardado no navegador.
 */
export function useUppercase(initial = true) {
  const [uppercase, setUppercase] = useState(initial);
  const upper = (text: string) => (uppercase ? text.toUpperCase() : text);
  return { uppercase, setUppercase, upper };
}

export function UppercaseToggle({
  checked,
  onChange,
  disabled,
  className = '',
  title = 'Converte o que você digitar para maiúsculas automaticamente',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <label className={`uppercase-toggle ${className}`.trim()} title={title}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      Sempre em MAIÚSCULAS
    </label>
  );
}
