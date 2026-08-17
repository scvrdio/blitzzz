'use client';

import { useEffect, useState } from 'react';

const cells = (className: string, count: number) => (
  <div className={`game-preview ${className}`} aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <i key={index} />)}
  </div>
);

export default function Home() {
  const [notice, setNotice] = useState(false);
  const [profile, setProfile] = useState<{ name: string; photoUrl?: string } | null>(null);
  const [gameUrl, setGameUrl] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const startParam = window.Telegram?.WebApp.initDataUnsafe.start_param || params.get('tgWebAppStartParam');
    if (startParam?.startsWith('game_')) {
      setGameUrl(`/four-in-a-row/index.html?room=${encodeURIComponent(startParam.slice(5))}`);
      window.history.replaceState(null, '', '/');
    }
    const syncProfile = () => {
      const user = window.Telegram?.WebApp.initDataUnsafe.user;
      if (!user) return;
      const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || '';
      if (name) setProfile({ name, photoUrl: user.photo_url });
    };
    syncProfile();
    const timers = [120, 300, 700].map(delay => window.setTimeout(syncProfile, delay));
    const closeGame = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'blitzzz-close-game') setGameUrl(null);
      if (event.data?.type === 'blitzzz-vertical-swipe') {
        const webApp = window.Telegram?.WebApp;
        event.data.disabled ? webApp?.disableVerticalSwipes?.() : webApp?.enableVerticalSwipes?.();
      }
      if (event.data?.type === 'blitzzz-haptic') {
        const feedback = window.Telegram?.WebApp?.HapticFeedback;
        if (event.data.method === 'selectionChanged') feedback?.selectionChanged?.();
        if (event.data.method === 'impactOccurred') feedback?.impactOccurred?.(event.data.style || 'light');
      }
    };
    window.addEventListener('message', closeGame);
    return () => { timers.forEach(window.clearTimeout); window.removeEventListener('message', closeGame); };
  }, []);

  const showSoon = () => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');
    setNotice(true);
    window.setTimeout(() => setNotice(false), 1800);
  };

  const openGame = (room?: string) => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');
    setGameUrl(room ? `/four-in-a-row/index.html?room=${encodeURIComponent(room)}` : '/four-in-a-row/index.html');
  };

  const openTicTacToe = () => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');
    setGameUrl('/tic-tac-toe/index.html');
  };

  const openCheckers = () => {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');
    setGameUrl('/checkers/index.html');
  };

  return <>
    <main className="games-app">
      <header className="games-header">
        <h1>Blitzzz</h1>
        {profile && <p className="profile">{profile.photoUrl && <img src={profile.photoUrl} alt="" />}<span>{profile.name}</span></p>}
      </header>
      <section className="games" aria-label="Игры">
        <a className="game-card connect-card" href="/four-in-a-row/index.html" onClick={event => { event.preventDefault(); openGame(); }}>
          <div className="copy"><h2>Четыре в ряд</h2><p>Собери четыре фишки<br />в линию раньше соперника</p></div>
          {cells('connect', 42)}
        </a>
        <a className="game-card" href="/tic-tac-toe/index.html" onClick={event => { event.preventDefault(); openTicTacToe(); }}>
          <div className="copy"><h2>Крестики-нолики</h2><p>Выстрой три своих знака в ряд</p></div>
        </a>
        <button className="game-card soon" onClick={showSoon}>
          <div className="copy"><h2>Морской бой</h2><p>Найди и потопи корабли соперника</p></div><span className="badge">скоро</span>
        </button>
        <a className="game-card" href="/checkers/index.html" onClick={event => { event.preventDefault(); openCheckers(); }}>
          <div className="copy"><h2>Шашки</h2><p>Забери все шашки соперника<br />или заблокируй его ходы</p></div>
        </a>
        <button className="game-card soon" onClick={showSoon}>
          <div className="copy"><h2>Коридор</h2><p>Дойди до края поля первым,<br />задерживая противника стенами</p></div><span className="badge">скоро</span>
        </button>
        <button className="game-card soon" onClick={showSoon}>
          <div className="copy"><h2>Чапаева</h2><p>Выбей фишки соперника<br />и дойди первым до края поля</p></div><span className="badge">скоро</span>
        </button>
      </section>
      <div className={`notice${notice ? ' visible' : ''}`} role="status">Игра появится скоро</div>
    </main>
    {gameUrl && <div className="game-overlay"><iframe src={gameUrl} title="Четыре в ряд" /></div>}
  </>;
}
