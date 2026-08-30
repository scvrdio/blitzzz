const soundBytes = new Map<string, ArrayBuffer>();
const soundBuffers = new Map<string, AudioBuffer>();
const loadingSounds = new Map<string, Promise<void>>();
const queuedSounds = new Set<string>();
const activeSources = new Set<AudioBufferSourceNode>();
const MAX_ACTIVE_SOURCES = 4;
let context: AudioContext | null = null;
let unlockListenerInstalled = false;

function createAudioContext() {
  if (typeof window === 'undefined') return null;
  if (context) return context;
  const Context = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  context = new Context({ latencyHint: 'interactive' });
  return context;
}

function startBuffer(path: string) {
  const current = context;
  const buffer = soundBuffers.get(path);
  if (!current || current.state !== 'running' || !buffer) return;
  if (activeSources.size >= MAX_ACTIVE_SOURCES) activeSources.values().next().value?.stop();
  const source = current.createBufferSource();
  source.buffer = buffer;
  source.connect(current.destination);
  activeSources.add(source);
  source.onended = () => activeSources.delete(source);
  source.start();
}

async function decodeSound(path: string) {
  const current = context;
  const bytes = soundBytes.get(path);
  if (!current || !bytes) return;
  if (soundBuffers.has(path)) {
    if (queuedSounds.delete(path)) startBuffer(path);
    return;
  }
  try {
    const buffer = await current.decodeAudioData(bytes.slice(0));
    soundBuffers.set(path, buffer);
    if (queuedSounds.delete(path)) startBuffer(path);
  } catch {
    queuedSounds.delete(path);
  }
}

async function fetchSound(path: string) {
  if (soundBytes.has(path) || loadingSounds.has(path)) return loadingSounds.get(path);
  const request = (async () => {
    try {
      const response = await fetch(path);
      if (!response.ok) return;
      soundBytes.set(path, await response.arrayBuffer());
      void decodeSound(path);
    } catch {
      // Sound effects must never affect gameplay when an asset is unavailable.
    } finally {
      loadingSounds.delete(path);
    }
  })();
  loadingSounds.set(path, request);
  return request;
}

function unlockAudio() {
  const current = createAudioContext();
  if (!current || current.state === 'running') return;
  void current.resume().then(() => {
    soundBytes.forEach((_, path) => { void decodeSound(path); });
    queuedSounds.forEach((path) => {
      if (soundBuffers.has(path)) {
        queuedSounds.delete(path);
        startBuffer(path);
      }
    });
  }).catch(() => undefined);
}

function installUnlockListener() {
  if (unlockListenerInstalled || typeof window === 'undefined') return;
  unlockListenerInstalled = true;
  window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
  window.addEventListener('touchend', unlockAudio, { capture: true, passive: true });
}

export function preloadGameSounds(paths: readonly string[]) {
  installUnlockListener();
  paths.forEach((path) => { void fetchSound(path); });
}

export function playGameSound(path: string) {
  unlockAudio();
  if (soundBuffers.has(path) && context?.state === 'running') {
    startBuffer(path);
    return;
  }
  queuedSounds.add(path);
  void fetchSound(path);
  void decodeSound(path);
}
