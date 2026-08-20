const telegramBotUsername = 'blitzzzgames_bot';

type Invite = { title: string; text: string; startParam: string };

export async function shareGameInvite({ title, text, startParam }: Invite) {
  const url = `https://t.me/${telegramBotUsername}?startapp=${encodeURIComponent(startParam)}`;
  if (navigator.share) {
    await navigator.share({ title, text, url });
    return 'shared' as const;
  }
  await navigator.clipboard.writeText(url);
  return 'copied' as const;
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
