import { Button } from '../ui/Button';

export function RestartButton({ onClick }: { onClick: () => void | Promise<void> }) {
  return <Button className="game-restart" onClick={() => void onClick()}>Сыграть ещё</Button>;
}
