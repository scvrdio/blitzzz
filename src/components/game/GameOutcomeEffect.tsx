'use client';

import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { playGameSound, preloadGameSounds } from '../../lib/game-sound';

export type GameOutcome = 'win' | 'loss' | 'draw';

export function GameOutcomeEffect({ outcome }: { outcome: GameOutcome | null }) {
  useEffect(() => { preloadGameSounds(['/sounds/success-xaa4b.wav', '/sounds/error-e6svd.wav', '/sounds/tap-eq303.wav']); }, []);

  useEffect(() => {
    if (outcome === 'loss') {
      playGameSound('/sounds/error-e6svd.wav');
      return;
    }
    if (outcome !== 'win') return;

    playGameSound('/sounds/success-xaa4b.wav');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = [getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(), getComputedStyle(document.documentElement).getPropertyValue('--color-foreground').trim()];
    const end = Date.now() + 500;
    let frame = 0;
    const fire = () => {
      if (Date.now() > end) return;
      confetti({ particleCount: 1, angle: 60, spread: 55, startVelocity: 60, gravity: 1.8, origin: { x: 0, y: 1 }, colors: [colors[0]], disableForReducedMotion: true });
      confetti({ particleCount: 1, angle: 120, spread: 55, startVelocity: 60, gravity: 1.8, origin: { x: 1, y: 1 }, colors: [colors[1]], disableForReducedMotion: true });
      frame = window.requestAnimationFrame(fire);
    };
    fire();
    return () => window.cancelAnimationFrame(frame);
  }, [outcome]);

  return null;
}
