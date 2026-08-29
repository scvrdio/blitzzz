const soundPools = new Map<string, HTMLAudioElement[]>();

function poolFor(path: string) {
  const existing = soundPools.get(path);
  if (existing) return existing;
  const pool = Array.from({ length: 4 }, () => {
    const sound = new Audio(path);
    sound.preload = 'auto';
    return sound;
  });
  soundPools.set(path, pool);
  return pool;
}

export function preloadGameSounds(paths: readonly string[]) {
  paths.forEach(poolFor);
}

export function playGameSound(path: string) {
  const pool = poolFor(path);
  const sound = pool.find((candidate) => candidate.paused || candidate.ended) ?? pool[0];
  sound.currentTime = 0;
  sound.play().catch(() => undefined);
}
