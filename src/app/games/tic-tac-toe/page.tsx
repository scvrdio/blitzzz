import { TicTacToeGame } from '../../../features/tic-tac-toe/TicTacToeGame';

type TicTacToePageProps = { searchParams: Promise<{ room?: string }> };

export default async function TicTacToePage({ searchParams }: TicTacToePageProps) {
  const { room } = await searchParams;
  return <TicTacToeGame initialRoomId={room} />;
}
