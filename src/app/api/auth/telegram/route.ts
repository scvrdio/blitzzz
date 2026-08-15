import { NextResponse } from 'next/server';
import { verifyTelegramInitData } from '../../../../lib/server/telegram-auth';

export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: 'Server configuration is incomplete' }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as { initData?: unknown } | null;
  if (!body || typeof body.initData !== 'string') {
    return NextResponse.json({ error: 'initData is required' }, { status: 400 });
  }

  const user = verifyTelegramInitData(body.initData, botToken);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Persist the user and create a signed session here when product data is added.
  return NextResponse.json({ telegramId: String(user.id), firstName: user.first_name });
}
