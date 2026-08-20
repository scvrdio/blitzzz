# blitzzz

Telegram Mini App с тремя играми на Next.js 16, React 19 и TypeScript.

## Запуск

```bash
pnpm install
pnpm dev
```

Для авторизации внутри Telegram добавьте `TELEGRAM_BOT_TOKEN` в `.env.local`. Для multiplayer в Supabase должна быть включена анонимная авторизация и применены SQL-миграции из корня репозитория.

## Архитектура

- `src/app` — App Router, игровые маршруты, API и общие CSS-токены.
- `src/components/ui` — небольшие доступные UI-примитивы.
- `src/components/game` — общий игровой каркас: шапка, соперник, статус и рестарт.
- `src/components/home` — каталог игр.
- `src/features/*` — UI и игровая логика конкретной игры.
- `src/features/*/engine.ts` — чистые, не зависящие от React игровые алгоритмы.
- `src/hooks` — lifecycle-утилиты для таймеров, уведомлений и Telegram-профиля.
- `src/lib/supabase` — единая точка создания клиента и анонимной сессии.
- `src/lib/telegram` — типизированная граница Telegram WebApp API.

Игры являются обычными React-маршрутами и больше не загружаются через iframe. Старые адреса `*/index.html` перенаправляются на новые маршруты в `next.config.ts`.

## Проверки

```bash
pnpm lint
pnpm build
```

TypeScript проверяется в составе production-сборки; отдельно можно выполнить `pnpm exec tsc --noEmit`.
