import type { TotemKeyboardPlacement } from '../../data/totemSettings';

function KeyboardStrip({ x, y, w }: { x: number; y: number; w: number }) {
  const keys = 7;
  const gap = 2;
  const keyW = (w - gap * (keys - 1)) / keys;
  return (
    <>
      <rect x={x - 3} y={y - 3} width={w + 6} height={18} rx={4} fill="#0f766e" />
      {Array.from({ length: keys }, (_, i) => (
        <rect
          key={i}
          x={x + i * (keyW + gap)}
          y={y}
          width={keyW}
          height={12}
          rx={2}
          fill="#f5f5f7"
        />
      ))}
    </>
  );
}

export function TotemRigPreview({
  placement,
  active,
}: {
  placement: TotemKeyboardPlacement;
  active: boolean;
}) {
  const standing = placement === 'top';
  return (
    <svg
      className={`totem-rig ${active ? 'is-active' : ''}`}
      viewBox="0 0 220 200"
      role="img"
      aria-hidden
    >
      <title>
        {standing
          ? 'Totem de pé, teclado no topo da tela'
          : 'Totem de cintura no balcão, teclado embaixo da tela'}
      </title>
      {standing ? (
        <>
          <rect x="0" y="186" width="220" height="14" fill="#e8e8ed" />
          <rect x="98" y="176" width="52" height="12" rx="2" fill="#c5c5c7" />
          <rect x="116" y="88" width="16" height="90" rx="4" fill="#d2d2d7" />
          <rect x="82" y="10" width="84" height="82" rx="10" fill="#1d1d1f" />
          <rect x="88" y="16" width="72" height="70" rx="5" fill="#f5f5f7" />
          <KeyboardStrip x={92} y={20} w={64} />
          <rect x="94" y="40" width="28" height="8" rx="2" fill="#d2d2d7" />
          <rect x="126" y="40" width="28" height="8" rx="2" fill="#d2d2d7" />
          <rect x="94" y="52" width="60" height="28" rx="4" fill="#e8e8ed" />
          <circle cx="52" cy="58" r="12" fill="#ffd7b5" />
          <rect x="40" y="70" width="24" height="48" rx="10" fill="#3a3a3c" />
          <rect x="36" y="92" width="14" height="22" rx="6" fill="#ffd7b5" />
        </>
      ) : (
        <>
          <rect x="0" y="186" width="220" height="14" fill="#e8e8ed" />
          <rect x="28" y="148" width="164" height="42" rx="4" fill="#aeaeb2" />
          <rect x="24" y="142" width="172" height="12" rx="3" fill="#c5c5c7" />
          <rect x="72" y="46" width="84" height="100" rx="10" fill="#1d1d1f" />
          <rect x="78" y="52" width="72" height="88" rx="5" fill="#f5f5f7" />
          <rect x="84" y="58" width="28" height="8" rx="2" fill="#d2d2d7" />
          <rect x="116" y="58" width="28" height="8" rx="2" fill="#d2d2d7" />
          <rect x="84" y="70" width="60" height="36" rx="4" fill="#e8e8ed" />
          <KeyboardStrip x={82} y={116} w={64} />
          <circle cx="44" cy="92" r="12" fill="#ffd7b5" />
          <rect x="32" y="104" width="24" height="40" rx="10" fill="#3a3a3c" />
          <rect x="28" y="122" width="14" height="20" rx="6" fill="#ffd7b5" />
        </>
      )}
    </svg>
  );
}
