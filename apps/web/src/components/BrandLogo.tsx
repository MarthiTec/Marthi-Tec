type BrandLogoProps = {
  variant?: 'mark' | 'wordmark' | 'full' | 'hero';
  className?: string;
};

const sources = {
  mark: '/brand/logo-mark.png?v=4',
  wordmark: '/brand/wordmark.png',
  full: '/brand/logo-hero.png',
  hero: '/brand/logo-hero.png',
} as const;

export function BrandLogo({ variant = 'hero', className }: BrandLogoProps) {
  return (
    <img
      className={className}
      src={sources[variant]}
      alt="Marthi Tecnologia"
      decoding="async"
    />
  );
}
