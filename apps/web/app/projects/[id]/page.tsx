import { ProjectDetailClient } from './ProjectDetailClient';

interface Props { params: { id: string } }

export default function ProjectDetailPage({ params }: Props) {
  return <ProjectDetailClient projectId={params.id} />;
}
