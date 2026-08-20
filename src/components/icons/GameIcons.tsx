type IconProps = { className?: string };

export function InviteIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15 12a4 4 0 1 0-3.46-6A5 5 0 1 0 8 14h4.1A6.5 6.5 0 0 0 12 15v1H5a3 3 0 0 0-3 3v2h10.8A5.5 5.5 0 1 0 15 12Zm2.5 3v2.5H20v2h-2.5V22h-2v-2.5H13v-2h2.5V15h2Z"/></svg>;
}

export function CloseIcon({ className }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" d="m6 6 12 12M18 6 6 18"/></svg>;
}
