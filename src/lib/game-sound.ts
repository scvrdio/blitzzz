const soundBuffers = new Map<string, AudioBuffer>();
const loadingSounds = new Map<string, Promise<AudioBuffer | null>>();
const activeSources = new Set<AudioBufferSourceNode>();
const MAX_ACTIVE_SOURCES = 8;
let context: AudioContext | null = null;
let unlockListenerInstalled = false;

function audioContext() {
  if (typeof window === 'undefined') return null;
  if (context) return context;
  const Context = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  context = new Context({ latencyHint: 'interactive' });
  return context;
}

function unlockAudio() {
  const current = audioContext();
  if (!current || current.state === 'running') return;
  void current.resume().catch(() => undefined);
}

function installUnlockListener() {
  if (unlockListenerInstalled || typeof window === 'undefined') return;
  unlockListenerInstalled = true;
  window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
  window.addEventListener('touchend', unlockAudio, { capture: true, passive: true });
}

async function loadSound(path: string) {
  const cached = soundBuffers.get(path);
  if (cached) return cached;
  const pending = loadingSounds.get(path);
  if (pending) return pending;

  const request = (async () => {
    const current = audioContext();
    if (!current) return null;
    try {
      const response = await fetch(path);
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      const decoded = await current.decodeAudioData(bytes);
      soundBuffers.set(path, decoded);
      return decoded;
    } catch {
      return null;
    } finally {
      loadingSounds.delete(path);
    }
  })();
  loadingSounds.set(path, request);
  return request;
}

export function preloadGameSounds(paths: readonly string[]) {
  installUnlockListener();
  paths.forEach((path) => { void loadSound(path); });
}

export function playGameSound(path: string) {
  const current = audioContext();
  const buffer = soundBuffers.get(path);
  if (!current || !buffer) {
    void loadSound(path);
    return;
  }

  unlockAudio();
  if (activeSources.size >= MAX_ACTIVE_SOURCES) activeSources.values().next().value?.stop();
  const source = current.createBufferSource();
  source.buffer = buffer;
  source.connect(current.destination);
  activeSources.add(source);
  source.onended = () => activeSources.delete(source);
  source.start();
}
