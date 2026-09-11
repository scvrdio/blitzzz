import { QuoridorGame } from '../../../features/quoridor/QuoridorGame';

type QuoridorPageProps = {
  searchParams: Promise<{ room?: string }>;
};

export default async function QuoridorPage({ searchParams }: QuoridorPageProps) {
  const { room } = await searchParams;
  return <QuoridorGame initialRoomId={room} />;
}
