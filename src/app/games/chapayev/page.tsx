import { ChapaevGame } from '../../../features/chapayev/ChapaevGame';

type ChapaevPageProps = { searchParams: Promise<{ side?: string }> };

export default async function ChapaevPage({ searchParams }: ChapaevPageProps) {
  const { side } = await searchParams;
  return <ChapaevGame playerSide={side === 'black' ? 'black' : 'blue'} />;
}
