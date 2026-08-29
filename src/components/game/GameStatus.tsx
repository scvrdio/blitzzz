'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { classNames } from '../../lib/class-names';

const MORPH_DURATION = 750;

/** The Magic UI text-morph technique, adapted to run once for each turn change. */
function MorphingText({ from, to }: { from: string; to: string }) {
  const fromRef = useRef<HTMLSpanElement>(null);
  const toRef = useRef<HTMLSpanElement>(null);
  const rawId = useId();
  const filterId = `game-status-threshold-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useEffect(() => {
    const fromNode = fromRef.current;
    const toNode = toRef.current;
    if (!fromNode || !toNode) return;

    let frame = 0;
    const startedAt = performance.now();

    const paint = (progress: number) => {
      const incomingBlur = Math.min(8 / Math.max(progress, 0.001) - 8, 100);
      const outgoingProgress = 1 - progress;
      const outgoingBlur = Math.min(8 / Math.max(outgoingProgress, 0.001) - 8, 100);
      toNode.style.filter = `blur(${incomingBlur}px)`;
      toNode.style.opacity = `${Math.pow(progress, 0.4)}`;
      fromNode.style.filter = `blur(${outgoingBlur}px)`;
      fromNode.style.opacity = `${Math.pow(outgoingProgress, 0.4)}`;
    };

    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / MORPH_DURATION);
      paint(progress);
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };

    paint(0);
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [from, to]);

  return (
    <span className="game-status__magic-morph" style={{ filter: `url(#${filterId}) blur(0.6px)` }} aria-hidden="true">
      <span ref={fromRef} className="game-status__magic-label">{from}</span>
      <span ref={toRef} className="game-status__magic-label">{to}</span>
      <svg className="game-status__filters" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id={filterId}>
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 255 -140"
            />
          </filter>
        </defs>
      </svg>
    </span>
  );
}

export function GameStatus({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const label = String(children);
  const previousLabel = useRef(label);
  const [leavingLabel, setLeavingLabel] = useState<string | null>(null);

  useEffect(() => {
    if (previousLabel.current === label) return;
    setLeavingLabel(previousLabel.current);
    previousLabel.current = label;
    const timeout = window.setTimeout(() => setLeavingLabel(null), MORPH_DURATION);
    return () => window.clearTimeout(timeout);
  }, [label]);

  const isMorphing = leavingLabel !== null;
  return (
    <div className={classNames('game-status', muted && 'game-status--muted')} aria-live="polite">
      <span className={classNames('game-status__morph', isMorphing && 'is-morphing')}>
        <span className="game-status__label">{label}</span>
        {leavingLabel ? <MorphingText from={leavingLabel} to={label} /> : null}
      </span>
    </div>
  );
}
