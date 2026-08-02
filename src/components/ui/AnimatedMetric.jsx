import React, { useEffect, useRef, useState } from 'react';
import { animate } from 'animejs';

export default function AnimatedMetric({ value, className = '', format = 'fixed' }) {
  const numericValue = parseFloat(value);
  const current = useRef(Number.isFinite(numericValue) ? numericValue : 0);
  const [display, setDisplay] = useState(Number.isFinite(numericValue) ? formatValue(numericValue, format) : '--');

  useEffect(() => {
    if (!Number.isFinite(numericValue)) {
      current.current = 0;
      setDisplay('--');
      return undefined;
    }

    const animation = animate(current, {
      current: numericValue,
      duration: 420,
      ease: 'outExpo',
      onUpdate: () => setDisplay(formatValue(current.current, format)),
    });

    return () => {
      animation?.cancel?.();
      animation?.revert?.();
    };
  }, [numericValue, format]);

  return <span className={className}>{display}</span>;
}

function formatValue(value, format) {
  if (format === 'exponential') return value.toExponential(3);
  return value.toFixed(3);
}
