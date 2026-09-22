type BrandLogoProps = {
  variant?: 'mark' | 'wordmark' | 'full' | 'hero' | 'lockup';
  className?: string;
};

const sources = {
  mark: '/brand/logo-mark.png?v=5',
  wordmark: '/brand/wordmark.png',
  /** Lockup completo transparente (MT + Marthi Tecnologia). */
  full: '/brand/logo-lockup.png?v=2',
  hero: '/brand/logo-lockup.png?v=2',
  lockup: '/brand/logo-lockup.png?v=2',
} as const;

export function BrandLogo({ variant = 'mark', className }: BrandLogoProps) {
  const mark = variant === 'mark';
  return (
    <img
      className={className}
      src={sources[variant]}
      alt="Marthi Tecnologia"
      decoding="async"
      width={mark ? 28 : undefined}
      height={mark ? 28 : undefined}
    />
  );
}
