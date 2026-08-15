'use client';

import { useTelegramAuth } from '../components/telegram/TelegramAuthProvider';

export default function Home() {
  const auth = useTelegramAuth();

  return (
    <main className="app-shell">
      <section className="welcome-card">
        <p className="eyebrow">TELEGRAM MINI APP</p>
        <h1>blitzzz</h1>
        <p className="subtitle">
          {auth.status === 'authenticated'
            ? 'Telegram подключён. Начинайте первый пользовательский сценарий.'
            : 'Чистая основа для первого пользовательского сценария.'}
        </p>
        {auth.status === 'browser' && <p className="notice">Откройте приложение внутри Telegram для полной проверки.</p>}
        {auth.status === 'error' && <p className="notice">Не удалось подтвердить сессию Telegram. Проверьте переменные окружения.</p>}
      </section>
    </main>
  );
}
