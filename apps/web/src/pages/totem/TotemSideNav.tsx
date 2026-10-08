export type TotemNavItem = {
  key: string;
  label: string;
  count: number;
  /** Foto do primeiro produto do grupo, usada como ícone. */
  image?: string;
  /** Ícone da marca (Apple, Samsung…): fundo branco para logos escuros aparecerem. */
  logo?: string;
};

/**
 * Navegação lateral da vitrine: marcas (celulares) ou categorias (ex.: tipos de prato).
 * Os grupos vêm do estoque real; nada fixo no código.
 */
export function TotemSideNav({
  title,
  items,
  active,
  total,
  onSelect,
}: {
  title: string;
  items: TotemNavItem[];
  active: string;
  total: number;
  onSelect: (key: string) => void;
}) {
  return (
    <nav className="totem-sidenav" aria-label={title}>
      <button
        type="button"
        className={`totem-sidenav__item${active === 'all' ? ' is-active' : ''}`}
        aria-pressed={active === 'all'}
        onClick={() => onSelect('all')}
      >
        <span className="totem-sidenav__icon totem-sidenav__icon--all" aria-hidden>
          ✦
        </span>
        <span className="totem-sidenav__label">Todos</span>
        <span className="totem-sidenav__count">{total}</span>
      </button>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`totem-sidenav__item${active === item.key ? ' is-active' : ''}`}
          aria-pressed={active === item.key}
          onClick={() => onSelect(item.key)}
        >
          <span className={`totem-sidenav__icon${item.logo ? ' is-logo' : ''}`} aria-hidden>
            {item.image ? <img src={item.image} alt="" draggable={false} /> : item.label.slice(0, 1)}
          </span>
          <span className="totem-sidenav__label">{item.label}</span>
          <span className="totem-sidenav__count">{item.count}</span>
        </button>
      ))}
    </nav>
  );
}
