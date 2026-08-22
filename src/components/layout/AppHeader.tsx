import type { ReactNode } from 'react';
import { classNames } from '../../lib/class-names';

type AppHeaderProps = {
  title: string;
  badge: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
};

export function AppHeader({ title, badge, leading = null, trailing = null, className }: AppHeaderProps) {
  return (
    <header className={classNames('app-header', className)}>
      <div className="app-header__side app-header__side--leading">{leading}</div>
      <div className="app-header__center">
        <h1 className="app-header__title">{title}</h1>
        {badge}
      </div>
      <div className="app-header__side app-header__side--trailing">{trailing}</div>
    </header>
  );
}
