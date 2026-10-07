import type { FocusEvent } from 'react';

/**
 * Seleciona todo o conteúdo do campo ao focar. Usar em campos numéricos (preço, custo,
 * taxa) para que digitar substitua o "0" exibido, em vez de exigir apagá-lo primeiro.
 */
export function selectAllOnFocus(event: FocusEvent<HTMLInputElement>) {
  event.target.select();
}
