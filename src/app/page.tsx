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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const startParam = window.Telegram?.WebApp.initDataUnsafe.start_param || params.get('tgWebAppStartParam');
    if (params.get('leave') === '1') {
      if (startParam) window.sessionStorage.setItem('dismissed-game-start-param', startParam);
      window.history.replaceState(null, '', '/');
      return;
    }
    if (startParam?.startsWith('game_')) {
      if (window.sessionStorage.getItem('dismissed-game-start-param') === startParam) return;
      window.location.replace(`/four-in-a-row/index.html?room=${encodeURIComponent(startParam.slice(5))}`);
      return;
    }
    const user = window.Telegram?.WebApp.initDataUnsafe.user;
    if (!user) return;
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || '';
    if (name) setProfile({ name, photoUrl: user.photo_url });
  }, []);

  const showSoon = () => {
    setNotice(true);
    window.setTimeout(() => setNotice(false), 1800);
  };

  return (
    <main className="games-app">
      <header className="games-header">
        <h1>Blitzzz</h1>
        {profile && <p className="profile">{profile.photoUrl && <img src={profile.photoUrl} alt="" />}<span>{profile.name}</span></p>}
      </header>
      <section className="games" aria-label="Игры">
        <a className="game-card" href="/four-in-a-row/index.html">
          <div className="copy"><h2>Четыре в ряд</h2><p>Собери четыре фишки в линию раньше соперника</p></div>
          {cells('connect', 42)}
        </a>
        <button className="game-card soon" onClick={showSoon}>
          <div className="copy"><h2>Крестики-нолики</h2><p>Выстрой три своих знака в ряд</p></div>{cells('tic', 9)}<span className="badge">Скоро</span>
        </button>
        <button className="game-card soon" onClick={showSoon}>
          <div className="copy"><h2>Морской бой</h2><p>Найди и потопи корабли соперника</p></div>{cells('sea', 100)}<span className="badge">Скоро</span>
        </button>
        <button className="game-card soon" onClick={showSoon}>
          <div className="copy"><h2>Коридор</h2><p>Дойди до края поля первым, задерживая противника стенами</p></div>{cells('hall', 100)}<span className="badge">Скоро</span>
        </button>
      </section>
      <div className={`notice${notice ? ' visible' : ''}`} role="status">Игра появится скоро</div>
    </main>
  );
}
