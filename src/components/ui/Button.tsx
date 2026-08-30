import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { classNames } from '../../lib/class-names';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'surface' | 'ghost';
  size?: 'medium' | 'icon';
};

export function Button({ className, variant = 'primary', size = 'medium', type = 'button', onPointerDown, onPointerUp, onPointerCancel, ...props }: ButtonProps) {
  const [pressed, setPressed] = useState(false);
  const releaseTimer = useRef<number | null>(null);

  useEffect(() => () => { if (releaseTimer.current !== null) window.clearTimeout(releaseTimer.current); }, []);

  const holdPressedState = () => {
    if (releaseTimer.current !== null) window.clearTimeout(releaseTimer.current);
    releaseTimer.current = window.setTimeout(() => setPressed(false), 3000);
  };

  return (
    <button
      type={type}
      className={classNames('button', `button--${variant}`, `button--${size}`, pressed && 'is-pressed', className)}
      onPointerDown={(event) => { setPressed(true); onPointerDown?.(event); }}
      onPointerUp={(event) => { holdPressedState(); onPointerUp?.(event); }}
      onPointerCancel={(event) => { holdPressedState(); onPointerCancel?.(event); }}
      {...props}
    />
  );
}
