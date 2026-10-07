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
  showActionButtons = true,
  customGreetingText,
  customSubtitleText,
  content = 'full',
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
  showActionButtons?: boolean;
  customGreetingText?: string;
  customSubtitleText?: string;
  content?:'full'|'text'|'background';
  onStartOrder?: () => void;
  onBrowseCatalog?: () => void;
}) {
  const color = normalizeHexColor(gradientColor);
  const hasPhoto = Boolean(backgroundImage);
  const logoPromo = layout === 'logoPromo';
  const greetingOnly = layout === 'greeting';
  const name = storeName.trim() || 'Sua Loja';
  const effectiveHello = (customGreetingText && customGreetingText.trim()) || greeting || 'Olá';
  const hasCustomText = Boolean(customSubtitleText && customSubtitleText.trim());

  function handleSceneClick() {
    if (preview) return;
    if (!showActionButtons) {
      if (onStartOrder) onStartOrder();
      else if (onBrowseCatalog) onBrowseCatalog();
    }
  }

  return (
    <section
      className={[
        'totem-attract',
        hasPhoto ? 'totem-attract--photo' : '',
        logoPromo ? 'totem-attract--logo-promo' : '',
        greetingOnly ? 'totem-attract--greeting' : '',
        preview ? 'totem-attract--preview' : '',
        !showActionButtons ? 'totem-attract--no-buttons' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        ['--attract-color' as string]: color,
        ['--attract-rgb' as string]: hexToRgbChannel(color),
        ...(backgroundImage ? { ['--attract-photo' as string]: `url("${backgroundImage}")` } : {}),
        cursor: !showActionButtons && !preview ? 'pointer' : undefined,
      }}
      onClick={handleSceneClick}
    >
      <div className="totem-attract__photo" aria-hidden />
      <div className="totem-attract__wash" aria-hidden />
      {!logoPromo && !greetingOnly ? (
        <>
          <div className="totem-attract__glow" aria-hidden />
          <div className="totem-attract__glow totem-attract__glow--two" aria-hidden />
        </>
      ) : null}
      <div className="totem-attract__grain" aria-hidden />

      {/* Só a saudação: sem logo e sem nome da loja, a arte de fundo fica em destaque. */}
      {content !== 'background' && greetingOnly ? (
        <div className="totem-attract__brand">
          <h1 className="totem-attract__greeting">{effectiveHello}</h1>
          {hasCustomText ? <p className="totem-attract__custom-text">{customSubtitleText!.trim()}</p> : null}
          <p className="totem-attract__hint">
            Toque para começar
            <span className="totem-attract__pulse" aria-hidden />
          </p>
        </div>
      ) : null}

      {content !== 'background' && !greetingOnly && <div className="totem-attract__brand">
        {content === 'full' && <div className="totem-attract__mark">
          {storeLogo ? (
            <img src={storeLogo} alt={name} className="totem-attract__logo" />
          ) : (
            <BrandLogo variant="mark" className="totem-attract__logo totem-attract__logo--mark" />
          )}
        </div>}
        {!logoPromo ? <p className="totem-attract__hello">{effectiveHello}</p> : null}
        {logoPromo && storeLogo && content === 'full' ? (
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

        {hasCustomText ? (
          <p className="totem-attract__custom-text">
            {customSubtitleText!.trim()}
          </p>
        ) : null}
      </div>}

      {showActionButtons ? (
        <div className="totem-attract__actions" onClick={(e) => e.stopPropagation()}>
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
      ) : null}
    </section>
  );
}
