import Image from 'next/image';

type AvatarProps = { name: string; src?: string; size?: number };

export function Avatar({ name, src, size = 20 }: AvatarProps) {
  if (!src) return <span className="avatar avatar--fallback" style={{ width: size, height: size }} aria-hidden="true">{name.trim().charAt(0)}</span>;
  return <Image className="avatar" src={src} alt="" width={size} height={size} sizes={`${size}px`} unoptimized />;
}
