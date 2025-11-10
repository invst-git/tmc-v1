import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

export function ShimmeringText({
  text,
  duration = 2,
  delay = 0,
  className,
  spread = 2,
  color,
  shimmerColor,
}) {
  const dynamicSpread = useMemo(() => text.length * spread, [text, spread]);
  const style = {
    '--spread': `${dynamicSpread}px`,
    ...(color && { '--base-color': color }),
    ...(shimmerColor && { '--shimmer-color': shimmerColor }),
    animationDuration: `${duration}s`,
    animationDelay: `${delay}s`,
  };
  return (
    <span
      className={cn(
        'shimmer-text',
        className
      )}
      style={style}
    >
      {text}
    </span>
  );
}
