import { notFound } from 'next/navigation';
import { MOCK_PROJECTS } from '@/lib/mock-data';
import { ProjectDetailClient } from './ProjectDetailClient';

interface Props { params: { id: string } }

export default function ProjectDetailPage({ params }: Props) {
  const project = MOCK_PROJECTS.find(p => p.id === params.id);
  if (!project) notFound();
  return <ProjectDetailClient project={project} />;
}
