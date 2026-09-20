type BarSeries = {
  label: string;
  a: number;
  b?: number;
};

type Slice = {
  label: string;
  value: number;
  tone: string;
};

function moneyShort(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export function DualBarChart({
  series,
  aLabel = 'Entradas',
  bLabel = 'Saídas',
}: {
  series: BarSeries[];
  aLabel?: string;
  bLabel?: string;
}) {
  const max = Math.max(...series.flatMap((item) => [item.a, item.b ?? 0]), 1);
  const width = 520;
  const height = 180;
  const padX = 28;
  const padY = 24;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const groupW = chartW / Math.max(series.length, 1);
  const barW = Math.min(18, groupW * 0.28);

  return (
    <div className="dash-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de barras">
        {[0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padY + chartH * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={padX} x2={width - padX} y1={y} y2={y} className="dash-chart__grid" />
              <text x={4} y={y + 3} className="dash-chart__axis">
                {moneyShort(max * ratio)}
              </text>
            </g>
          );
        })}
        {series.map((item, index) => {
          const x = padX + groupW * index + groupW / 2;
          const hA = (item.a / max) * chartH;
          const hB = ((item.b ?? 0) / max) * chartH;
          return (
            <g key={item.label}>
              <rect
                x={x - barW - 2}
                y={padY + chartH - hA}
                width={barW}
                height={Math.max(hA, item.a > 0 ? 2 : 0)}
                rx={4}
                className="dash-chart__bar dash-chart__bar--in"
              />
              <rect
                x={x + 2}
                y={padY + chartH - hB}
                width={barW}
                height={Math.max(hB, (item.b ?? 0) > 0 ? 2 : 0)}
                rx={4}
                className="dash-chart__bar dash-chart__bar--out"
              />
              <text x={x} y={height - 6} textAnchor="middle" className="dash-chart__label">
                {item.label.replace('.', '')}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="dash-chart__legend">
        <span>
          <i className="dash-chart__swatch dash-chart__swatch--in" /> {aLabel}
        </span>
        <span>
          <i className="dash-chart__swatch dash-chart__swatch--out" /> {bLabel}
        </span>
      </div>
    </div>
  );
}

export function LineAreaChart({
  series,
  label = 'Receita',
}: {
  series: { label: string; value: number }[];
  label?: string;
}) {
  const max = Math.max(...series.map((item) => item.value), 1);
  const width = 520;
  const height = 180;
  const padX = 28;
  const padY = 24;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const step = series.length > 1 ? chartW / (series.length - 1) : 0;
  const points = series.map((item, index) => {
    const x = padX + step * index;
    const y = padY + chartH - (item.value / max) * chartH;
    return { x, y, ...item };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `${padX},${padY + chartH} ${line} ${padX + chartW},${padY + chartH}`;

  return (
    <div className="dash-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <polygon points={area} className="dash-chart__area" />
        <polyline points={line} className="dash-chart__line" fill="none" />
        {points.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r={3.5} className="dash-chart__dot" />
            <text x={point.x} y={height - 6} textAnchor="middle" className="dash-chart__label">
              {point.label.replace('.', '')}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function DonutChart({ slices, center }: { slices: Slice[]; center: string }) {
  const total = slices.reduce((sum, item) => sum + item.value, 0) || 1;
  const radius = 54;
  const stroke = 16;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="dash-donut">
      <svg viewBox="0 0 140 140" role="img" aria-label="Composição">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="#ececf0"
          strokeWidth={stroke}
        />
        {slices.map((slice) => {
          const length = (slice.value / total) * circumference;
          const el = (
            <circle
              key={slice.label}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={slice.tone}
              strokeWidth={stroke}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform="rotate(-90 70 70)"
            />
          );
          offset += length;
          return el;
        })}
        <text x="70" y="68" textAnchor="middle" className="dash-donut__value">
          {center}
        </text>
        <text x="70" y="86" textAnchor="middle" className="dash-donut__caption">
          mix
        </text>
      </svg>
      <ul className="dash-donut__list">
        {slices.length === 0 ? (
          <li className="empty">Sem receitas no período.</li>
        ) : (
          slices.map((slice) => (
            <li key={slice.label}>
              <i style={{ background: slice.tone }} />
              <div className="dash-donut__meta">
                <span className="dash-donut__name">{slice.label}</span>
                <span className="dash-donut__amount">
                  {slice.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
