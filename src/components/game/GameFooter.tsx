import Image from 'next/image';
import type { ReactNode } from 'react';
import { classNames } from '../../lib/class-names';
import { Button } from '../ui/Button';

type SharedFooterProps = {
  className?: string;
};

type EmptyFooterProps = SharedFooterProps & {
  variant: 'empty';
};

type ButtonFooterProps = SharedFooterProps & {
  variant: 'button';
  label?: string;
  onPlayAgain: () => void | Promise<void>;
};

export type GameFooterTab = 'mine' | 'opponent';

type TabbarFooterProps = SharedFooterProps & {
  variant: 'tabbar';
  value: GameFooterTab;
  onChange: (value: GameFooterTab) => void;
  mineLabel?: string;
  opponentLabel?: string;
};

export type GameFooterSliderValue = 0 | 1 | 2 | 3 | 4;

type SliderFooterProps = SharedFooterProps & {
  variant: 'slider';
  value: GameFooterSliderValue;
  onChange: (value: GameFooterSliderValue) => void;
  label?: string;
};

type CustomFooterProps = SharedFooterProps & {
  variant: 'custom';
  children: ReactNode;
};

export type GameFooterShip = { size: 1 | 2 | 3 | 4; count: number };

type ShipsFooterProps = SharedFooterProps & {
  variant: 'ships';
  label: string;
  ships: readonly GameFooterShip[];
};

export type GameFooterProps = EmptyFooterProps | ButtonFooterProps | TabbarFooterProps | SliderFooterProps | ShipsFooterProps | CustomFooterProps;

const sliderValues: GameFooterSliderValue[] = [0, 1, 2, 3, 4];

export function GameFooter(props: GameFooterProps) {
  if (props.variant === 'empty') {
    return <footer className={classNames('game-footer', 'game-footer--empty', props.className)} aria-hidden="true" data-node-id="78:2557" />;
  }

  if (props.variant === 'button') {
    return (
      <footer className={classNames('game-footer', 'game-footer--button', props.className)} data-node-id="78:2557">
        <Button className="game-footer__button" onClick={() => void props.onPlayAgain()}>{props.label ?? 'Сыграть ещё'}</Button>
      </footer>
    );
  }

  if (props.variant === 'tabbar') {
    const tabs: Array<{ label: string; value: GameFooterTab }> = [
      { label: props.mineLabel ?? 'Моё поле', value: 'mine' },
      { label: props.opponentLabel ?? 'Поле соперника', value: 'opponent' },
    ];
    return (
      <footer className={classNames('game-footer', 'game-footer--tabbar', props.className)} data-node-id="78:2557">
        <div className="game-footer__tabbar" role="tablist" aria-label="Выбор игрового поля">
          {tabs.map((tab) => {
            const selected = props.value === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={selected}
                className={classNames('game-footer__tab', selected && 'is-selected')}
                onClick={() => props.onChange(tab.value)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </footer>
    );
  }

  if (props.variant === 'custom') {
    return <footer className={classNames('game-footer', 'game-footer--custom', props.className)} data-node-id="78:2557">{props.children}</footer>;
  }

  if (props.variant === 'ships') {
    return (
      <footer className={classNames('game-footer', 'game-footer--ships', props.className)} data-node-id="91:8995">
        <span className="game-footer__ships-label">{props.label}</span>
        <span className="game-footer__ships-list" aria-label={props.label}>
          {props.ships.map(({ size, count }) => (
            <span key={size} className={classNames('game-footer__ship', count === 0 && 'is-empty')}>
              <strong>{count} ×</strong>
              <i style={{ width: `${size * 16}px` }} aria-hidden="true" />
            </span>
          ))}
        </span>
      </footer>
    );
  }

  return (
    <footer className={classNames('game-footer', 'game-footer--slider', props.className)} data-node-id="78:2557">
      <span className="game-footer__slider-label">{props.label ?? 'Сложность'}</span>
      <span className="game-footer__slider-track" aria-hidden="true">
        {sliderValues.map((value) => {
          const selected = value === props.value;
          return (
            <span key={value} className="game-footer__slider-step">
              <Image
                src={selected ? '/icons/footer-thumb.svg' : '/icons/footer-dot.svg'}
                alt=""
                width={selected ? 24 : 4}
                height={selected ? 24 : 4}
                unoptimized
              />
            </span>
          );
        })}
      </span>
      <input
        className="game-footer__slider-input"
        type="range"
        min="0"
        max="4"
        step="1"
        value={props.value}
        aria-label={props.label ?? 'Сложность'}
        onChange={(event) => props.onChange(Number(event.target.value) as GameFooterSliderValue)}
      />
    </footer>
  );
}
