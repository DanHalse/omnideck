import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { SERVICE_ICONS, type BuiltInIconKey } from '@omnideck/shared';

interface ServiceSvgIconProps {
  icon: BuiltInIconKey;
  color: string;
  size?: number;
}

export function ServiceSvgIcon({ icon, color, size = 20 }: ServiceSvgIconProps) {
  const spec = SERVICE_ICONS[icon] ?? SERVICE_ICONS.globe;
  return (
    <Svg width={size} height={size} viewBox={spec.viewBox} fill="none">
      {spec.paths.map((p, idx) => (
        <Path
          key={idx}
          d={p.d}
          fill={p.fill === 'currentColor' ? color : (p.fill ?? 'none')}
          stroke={p.stroke === 'currentColor' ? color : p.stroke}
          strokeWidth={p.strokeWidth}
          fillRule={p.fillRule}
        />
      ))}
      {spec.circles?.map((c, idx) => (
        <Circle
          key={idx}
          cx={c.cx}
          cy={c.cy}
          r={c.r}
          fill={c.fill === 'currentColor' ? color : (c.fill ?? 'none')}
          stroke={c.stroke === 'currentColor' ? color : c.stroke}
          strokeWidth={c.strokeWidth}
        />
      ))}
    </Svg>
  );
}
