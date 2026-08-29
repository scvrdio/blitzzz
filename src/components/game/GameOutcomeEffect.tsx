'use client';

import { useEffect } from 'react';
import confetti from 'canvas-confetti';

export type GameOutcome = 'win' | 'loss' | 'draw';

export function GameOutcomeEffect({ outcome }: { outcome: GameOutcome | null }) {
  useEffect(() => {
    if (outcome !== 'win') return;

    const sound = new Audio('/sounds/success-xaa4b.wav');
    sound.play().catch(() => undefined);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const end = Date.now() + 500;
    let frame = 0;
    const fire = () => {
      if (Date.now() > end) return;
      confetti({ particleCount: 1, angle: 60, spread: 55, startVelocity: 60, origin: { x: 0, y: .5 }, colors: ['#004cff'], disableForReducedMotion: true });
      confetti({ particleCount: 1, angle: 120, spread: 55, startVelocity: 60, origin: { x: 1, y: .5 }, colors: ['#000000'], disableForReducedMotion: true });
      frame = window.requestAnimationFrame(fire);
    };
    fire();
    return () => window.cancelAnimationFrame(frame);
  }, [outcome]);

  return null;
}
