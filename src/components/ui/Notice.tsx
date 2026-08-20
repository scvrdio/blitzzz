export function Notice({ message }: { message: string | null }) {
  return <div className={`notice${message ? ' notice--visible' : ''}`} role="status" aria-live="polite">{message}</div>;
}
