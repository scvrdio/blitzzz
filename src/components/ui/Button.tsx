import type { ButtonHTMLAttributes } from 'react';
import { classNames } from '../../lib/class-names';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'surface' | 'ghost';
  size?: 'medium' | 'icon';
};

export function Button({ className, variant = 'primary', size = 'medium', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={classNames('button', `button--${variant}`, `button--${size}`, className)} {...props} />;
}
