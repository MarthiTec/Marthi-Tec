
type PatternLockGridProps = {
  size?: number;
  className?: string;
  label?: string;
};

export function PatternLockGrid({
  size = 110,
  className = '',
  label = 'Desenhe o padrão aqui',
}: PatternLockGridProps) {
  // 9 dots: (0,0), (0,1), (0,2), (1,0), (1,1), (1,2), (2,0), (2,1), (2,2)
  const dots = [
    { id: 1, r: 0, c: 0 },
    { id: 2, r: 0, c: 1 },
    { id: 3, r: 0, c: 2 },
    { id: 4, r: 1, c: 0 },
    { id: 5, r: 1, c: 1 },
    { id: 6, r: 1, c: 2 },
    { id: 7, r: 2, c: 0 },
    { id: 8, r: 2, c: 1 },
    { id: 9, r: 2, c: 2 },
  ];

  return (
    <div
      className={`os-pattern-box ${className}`}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 10px',
        border: '1.5px dashed #475569',
        borderRadius: 6,
        background: '#ffffff',
      }}
    >
      <div
        className="os-pattern-grid"
        style={{
          width: size,
          height: size,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
          alignItems: 'center',
          justifyItems: 'center',
          position: 'relative',
        }}
        aria-label="Padrão de desbloqueio com 9 pontos"
      >
        {dots.map((d) => (
          <div
            key={d.id}
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              backgroundColor: '#1e293b',
              boxShadow: '0 0 0 4px #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                backgroundColor: '#ffffff',
              }}
            />
          </div>
        ))}
      </div>
      {label ? (
        <span
          style={{
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#475569',
            marginTop: 4,
            fontWeight: 600,
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
