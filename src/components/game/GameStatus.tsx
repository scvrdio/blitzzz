'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { classNames } from '../../lib/class-names';

export function GameStatus({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const label = String(children);
  const previousLabel = useRef(label);
  const [leavingLabel, setLeavingLabel] = useState<string | null>(null);

  useEffect(() => {
    if (previousLabel.current === label) return;
    setLeavingLabel(previousLabel.current);
    previousLabel.current = label;
    const timeout = window.setTimeout(() => setLeavingLabel(null), 750);
    return () => window.clearTimeout(timeout);
  }, [label]);

  const isMorphing = leavingLabel !== null;
  return (
    <div className={classNames('game-status', muted && 'game-status--muted')} aria-live="polite">
      <span className={classNames('game-status__morph', isMorphing && 'is-morphing')}>
        {leavingLabel ? <span key={`out-${leavingLabel}`} className="game-status__label game-status__label--outgoing">{leavingLabel}</span> : null}
        <span key={`in-${label}`} className={classNames('game-status__label', isMorphing && 'game-status__label--incoming')}>{label}</span>
      </span>
      <svg className="game-status__filter" aria-hidden="true" focusable="false"><defs><filter id="game-status-threshold"><feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 255 -140" /></filter></defs></svg>
    </div>
  );
}
