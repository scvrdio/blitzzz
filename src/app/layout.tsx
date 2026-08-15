import type { Metadata } from 'next';
import Script from 'next/script';
import { TelegramBoot } from '../components/telegram/TelegramBoot';
import { TelegramAuthProvider } from '../components/telegram/TelegramAuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'blitzzz',
  description: 'Telegram Mini App',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <TelegramBoot />
        <TelegramAuthProvider>{children}</TelegramAuthProvider>
      </body>
    </html>
  );
}
