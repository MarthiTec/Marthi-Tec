import type { PickedAttribute } from '../../data/attributeStore';
import { formatPicked } from '../../data/attributeStore';
import { formatBRL, type TotemProduct } from './totemData';

export type TotemCartLine = {
  /** Mesmo produto + mesmas escolhas + mesma retirada = mesma linha (soma a quantidade). */
  key: string;
  product: TotemProduct;
  stockId: string;
  pickupMethodId: string;
  pickupName: string;
  picked: PickedAttribute[];
  unitPrice: number;
  qty: number;
};

/** Lista do carrinho na finalização: o cliente ajusta quantidades ou remove itens. */
export function TotemCartReview({
  lines,
  disabled,
  onQty,
  onRemove,
}: {
  lines: TotemCartLine[];
  disabled?: boolean;
  onQty: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <ul className="totem-cart" aria-label="Itens do pedido">
      {lines.map((line) => (
        <li key={line.key} className="totem-cart__line">
          <span className="totem-cart__thumb" aria-hidden>
            {line.product.images[0] ? <img src={line.product.images[0]} alt="" draggable={false} /> : line.product.name.slice(0, 1)}
          </span>
          <span className="totem-cart__info">
            <strong>{line.product.name}</strong>
            <small>{[formatPicked(line.picked), line.pickupName].filter(Boolean).join(' · ')}</small>
            <em>{formatBRL(line.unitPrice * line.qty)}</em>
          </span>
          <span className="totem-cart__qty">
            <button
              type="button"
              aria-label={`Diminuir ${line.product.name}`}
              disabled={disabled}
              onClick={() => (line.qty > 1 ? onQty(line.key, line.qty - 1) : onRemove(line.key))}
            >
              {line.qty > 1 ? '−' : '🗑'}
            </button>
            <output aria-live="polite">{line.qty}</output>
            <button
              type="button"
              aria-label={`Aumentar ${line.product.name}`}
              disabled={disabled || line.qty >= 99}
              onClick={() => onQty(line.key, line.qty + 1)}
            >
              +
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
