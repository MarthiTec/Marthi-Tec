import { BrandLogo } from '../../components/BrandLogo';
import {
  hexToRgbChannel,
  normalizeHexColor,
  type TotemAttractLayout,
} from '../../data/totemSettings';
import './totem.css';

export function TotemAttractScene({
  storeName,
  storeLogo,
  greeting,
  gradientColor,
  backgroundImage,
  layout = 'standard',
  preview = false,
  onStartOrder,
  onBrowseCatalog,
}: {
  storeName: string;
  storeLogo: string | null;
  greeting: string;
  gradientColor: string;
  backgroundImage: string | null;
  layout?: TotemAttractLayout;
  preview?: boolean;
  onStartOrder?: () => void;
  onBrowseCatalog?: () => void;
}) {
  const color = normalizeHexColor(gradientColor);
  const hasPhoto = Boolean(backgroundImage);
  const logoPromo = layout === 'logoPromo';
  const name = storeName.trim() || 'Sua Loja';

  return (
    <section
      className={[
        'totem-attract',
        hasPhoto ? 'totem-attract--photo' : '',
        logoPromo ? 'totem-attract--logo-promo' : '',
        preview ? 'totem-attract--preview' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        ['--attract-color' as string]: color,
        ['--attract-rgb' as string]: hexToRgbChannel(color),
        ...(backgroundImage ? { ['--attract-photo' as string]: `url("${backgroundImage}")` } : {}),
      }}
    >
      <div className="totem-attract__photo" aria-hidden />
      <div className="totem-attract__wash" aria-hidden />
      {!logoPromo ? (
        <>
          <div className="totem-attract__glow" aria-hidden />
          <div className="totem-attract__glow totem-attract__glow--two" aria-hidden />
        </>
      ) : null}
      <div className="totem-attract__grain" aria-hidden />

      <div className="totem-attract__brand">
        <div className="totem-attract__mark">
          {storeLogo ? (
            <img src={storeLogo} alt={name} className="totem-attract__logo" />
          ) : (
            <BrandLogo variant="mark" className="totem-attract__logo totem-attract__logo--mark" />
          )}
        </div>
        {!logoPromo ? <p className="totem-attract__hello">{greeting}</p> : null}
        {logoPromo && storeLogo ? (
          <p className="totem-attract__hint totem-attract__hint--soft">
            Toque para começar
            <span className="totem-attract__pulse" aria-hidden />
          </p>
        ) : (
          <>
            <h1>{name}</h1>
            <p className="totem-attract__hint">
              Toque para começar
              <span className="totem-attract__pulse" aria-hidden />
            </p>
          </>
        )}
      </div>

      <div className="totem-attract__actions">
        {preview ? (
          <>
            <div className="totem-attract__cta totem-attract__cta--primary">Iniciar um novo pedido</div>
            <div className="totem-attract__cta totem-attract__cta--ghost">Ver catálogo de produtos</div>
          </>
        ) : (
          <>
            <button type="button" className="totem-attract__cta totem-attract__cta--primary" onClick={onStartOrder}>
              Iniciar um novo pedido
            </button>
            <button type="button" className="totem-attract__cta totem-attract__cta--ghost" onClick={onBrowseCatalog}>
              Ver catálogo de produtos
            </button>
          </>
        )}
      </div>
    </section>
  );
}
