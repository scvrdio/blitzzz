import { ConnectFourGame } from '../../../features/connect-four/ConnectFourGame';

type ConnectFourPageProps = { searchParams: Promise<{ room?: string }> };

export default async function ConnectFourPage({ searchParams }: ConnectFourPageProps) {
  const { room } = await searchParams;
  return <ConnectFourGame initialRoomId={room} />;
}
