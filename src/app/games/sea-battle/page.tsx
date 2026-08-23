import { SeaBattleGame } from '../../../features/sea-battle/SeaBattleGame';

type PageProps = { searchParams: Promise<{ room?: string }> };

export default async function SeaBattlePage({ searchParams }: PageProps) {
  const { room } = await searchParams;
  return <SeaBattleGame initialRoomId={room} />;
}
