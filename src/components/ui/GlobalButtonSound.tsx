'use client';

import { useEffect } from 'react';
import { playGameSound, preloadGameSounds } from '../../lib/game-sound';

const soundPath = '/sounds/button-tap.wav';
const gameInputSelector = '[data-game-input], .tic-board, .connect-column-buttons, .battle-board, .chapaev-arena';

export function GlobalButtonSound() {
  useEffect(() => {
    preloadGameSounds([soundPath]);
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest('button:not(:disabled), a');
      if (!control || control.closest(gameInputSelector)) return;
      playGameSound(soundPath, 1.05);
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return null;
}
