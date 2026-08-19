import { TeamSpaceClient } from './TeamSpaceClient';

interface Props { params: { id: string } }

export default function TeamSpacePage({ params }: Props) {
  return <TeamSpaceClient teamId={params.id} />;
}
