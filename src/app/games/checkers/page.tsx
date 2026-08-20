import { CheckersGame } from '../../../features/checkers/CheckersGame';

type CheckersPageProps = { searchParams: Promise<{ room?: string }> };

export default async function CheckersPage({ searchParams }: CheckersPageProps) {
  const { room } = await searchParams;
  return <CheckersGame initialRoomId={room} />;
}
