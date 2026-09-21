import { BrandLogo } from '../../components/BrandLogo';
import { hexToRgbChannel, normalizeHexColor } from '../../data/totemSettings';
import './totem.css';

export function TotemAttractScene({
  storeName,
  storeLogo,
  greeting,
  gradientColor,
  backgroundImage,
  preview = false,
  onStartOrder,
  onBrowseCatalog,
}: {
  storeName: string;
  storeLogo: string | null;
  greeting: string;
  gradientColor: string;
  backgroundImage: string | null;
  preview?: boolean;
  onStartOrder?: () => void;
  onBrowseCatalog?: () => void;
}) {
  const color = normalizeHexColor(gradientColor);
  const hasPhoto = Boolean(backgroundImage);
  const name = storeName.trim() || 'Sua Loja';

  return (
    <section
      className={`totem-attract ${hasPhoto ? 'totem-attract--photo' : ''} ${preview ? 'totem-attract--preview' : ''}`}
      style={{
        ['--attract-color' as string]: color,
        ['--attract-rgb' as string]: hexToRgbChannel(color),
        ...(backgroundImage ? { ['--attract-photo' as string]: `url("${backgroundImage}")` } : {}),
      }}
    >
      <div className="totem-attract__photo" aria-hidden />
      <div className="totem-attract__wash" aria-hidden />
      <div className="totem-attract__glow" aria-hidden />
      <div className="totem-attract__glow totem-attract__glow--two" aria-hidden />
      <div className="totem-attract__grain" aria-hidden />

      <div className="totem-attract__brand">
        <div className="totem-attract__mark">
          {storeLogo ? (
            <img src={storeLogo} alt="" className="totem-attract__logo" />
          ) : (
            <BrandLogo variant="hero" className="totem-attract__logo totem-attract__logo--brand" />
          )}
        </div>
        <p className="totem-attract__hello">{greeting}</p>
        <h1>{name}</h1>
        <p className="totem-attract__hint">
          Toque para começar
          <span className="totem-attract__pulse" aria-hidden />
        </p>
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
