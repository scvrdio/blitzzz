import { createHmac, timingSafeEqual } from 'node:crypto';

type TelegramUser = { id: number; first_name: string; username?: string };

export type VerifiedTelegramUser = Pick<TelegramUser, 'id' | 'first_name' | 'username'>;

export function verifyTelegramInitData(initData: string, botToken: string): VerifiedTelegramUser | null {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!receivedHash || !Number.isFinite(authDate)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (authDate > now + 300 || now - authDate > 86_400) return null;

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const expected = Buffer.from(expectedHash, 'hex');
  const received = Buffer.from(receivedHash, 'hex');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const user = JSON.parse(params.get('user') ?? '') as TelegramUser;
    return Number.isSafeInteger(user.id) && user.id > 0 && user.first_name ? user : null;
  } catch {
    return null;
  }
}
