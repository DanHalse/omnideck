import { SERVICE_ICONS, type BuiltInIconKey } from '@omnideck/shared';

interface ServiceIconProps {
  icon: BuiltInIconKey;
  color?: string;
  size?: number;
}

export function ServiceIcon({ icon, color = 'currentColor', size = 16 }: ServiceIconProps) {
  const spec = SERVICE_ICONS[icon] ?? SERVICE_ICONS.globe;
  return (
    <svg
      width={size}
      height={size}
      viewBox={spec.viewBox}
      fill="none"
      style={{ color, flexShrink: 0 }}
      aria-hidden="true"
    >
      {spec.paths.map((p, idx) => (
        <path
          key={idx}
          d={p.d}
          fill={p.fill ?? 'none'}
          stroke={p.stroke}
          strokeWidth={p.strokeWidth}
          fillRule={p.fillRule}
        />
      ))}
      {spec.circles?.map((c, idx) => (
        <circle
          key={idx}
          cx={c.cx}
          cy={c.cy}
          r={c.r}
          fill={c.fill ?? 'none'}
          stroke={c.stroke}
          strokeWidth={c.strokeWidth}
        />
      ))}
    </svg>
  );
}
