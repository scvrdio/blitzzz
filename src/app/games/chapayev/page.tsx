import { ChapaevGame } from '../../../features/chapayev/ChapaevGame';

type ChapaevPageProps = { searchParams: Promise<{ room?: string; side?: string }> };

export default async function ChapaevPage({ searchParams }: ChapaevPageProps) {
  const { room, side } = await searchParams;
  return <ChapaevGame initialRoomId={room} playerSide={side === 'black' ? 'black' : 'blue'} />;
}
