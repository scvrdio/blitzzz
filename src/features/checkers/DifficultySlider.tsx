import { telegram } from '../../lib/telegram/client';

export const difficultyLabels = ['Очень легко', 'Легко', 'Нормально', 'Сложно', 'Очень сложно'] as const;

export function DifficultySlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <label className="difficulty-slider">
      <span className="difficulty-slider__label">{difficultyLabels[value]}</span>
      <span className="difficulty-slider__dots" aria-hidden="true">{difficultyLabels.map((label, index) => <i key={label} className={index === value ? 'is-selected' : ''} />)}</span>
      <span className="difficulty-slider__thumb" style={{ left: `calc(${value * 20 + 10}% - 12px)` }} aria-hidden="true" />
      <input type="range" min="0" max="4" step="1" value={value} aria-label="Сложность соперника" aria-valuetext={difficultyLabels[value]} onChange={(event) => { const next = Number(event.target.value); if (next !== value) telegram.selectionChanged(); onChange(next); }} />
    </label>
  );
}
