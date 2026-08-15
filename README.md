# blitzzz

Clean Next.js + React foundation for a Telegram Mini App, aligned with the architecture of [`look`](https://github.com/scvrdio/look).

## Start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Add `TELEGRAM_BOT_TOKEN` to `.env.local` before testing inside Telegram.

## Structure

- `src/app` — App Router pages and route handlers.
- `src/components/telegram` — Telegram startup and authentication bridge.
- `src/lib/telegram` — isolated WebApp API client and types.
- `src/lib/server` — server-only validation of Telegram `initData`.

The client never treats `initDataUnsafe` as trusted. The `/api/auth/telegram` endpoint validates `initData` using the bot token and rejects expired or forged requests.
