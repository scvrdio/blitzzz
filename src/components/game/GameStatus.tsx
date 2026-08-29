'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { classNames } from '../../lib/class-names';

const LINEAR_DURATION = 120;
const SETTLE_DURATION = 460;
const STAGGER = 16;

function splitGraphemes(value: string) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(value), ({ segment }) => segment);
  }
  return Array.from(value);
}

function selectorAmount(localTime: number) {
  if (localTime <= 0) return 1;
  if (localTime < LINEAR_DURATION) return 1 - localTime / LINEAR_DURATION;
  const linearPhase = LINEAR_DURATION / 1000;
  const springTime = (localTime - LINEAR_DURATION) / 1000;
  return (-1 / linearPhase) * Math.sin(springTime * Math.PI * 2) / (Math.exp(10 * springTime) * Math.PI * 2);
}

function characterFrames(): Keyframe[] {
  return Array.from({ length: 42 }, (_, index) => {
    const offset = index / 41;
    const amount = index === 41 ? 0 : selectorAmount(SETTLE_DURATION * offset);
    const positiveAmount = Math.max(amount, 0);
    return {
      offset,
      opacity: Math.min(1, Math.max(0, 1 - amount)),
      filter: `blur(${10 * positiveAmount}px)`,
      transform: `translate3d(0, ${20 * amount}px, 0) rotate(${12 * amount}deg) scale(1, ${1 - 0.14 * amount})`,
    };
  });
}

function EmotionalStatusText({ text }: { text: string }) {
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const frames = characterFrames();
    const animations = [...host.querySelectorAll<HTMLElement>('.serega-emotional__unit')].map((unit, index) =>
      unit.animate(frames, {
        delay: (index + 1) * STAGGER,
        duration: SETTLE_DURATION,
        easing: 'linear',
        fill: 'both',
      }),
    );
    return () => animations.forEach((animation) => animation.cancel());
  }, [text]);

  let wordIndex = 0;
  const words = splitGraphemes(text).reduce<string[][]>((result, grapheme) => {
    if (/^\s+$/u.test(grapheme) && result.length) result[result.length - 1].push(grapheme);
    else result.push([grapheme]);
    return result;
  }, []);

  return (
    <span ref={hostRef} className="serega-emotional" aria-label={text}>
      {words.map((word) => (
        <span key={wordIndex++} className="serega-emotional__word" aria-hidden="true">
          {word.map((grapheme, index) => <span key={`${grapheme}-${index}`} className="serega-emotional__unit">{grapheme}</span>)}
        </span>
      ))}
    </span>
  );
}

export function GameStatus({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const label = String(children);
  return (
    <div className={classNames('game-status', muted && 'game-status--muted')} aria-live="polite">
      <EmotionalStatusText key={label} text={label} />
    </div>
  );
}
