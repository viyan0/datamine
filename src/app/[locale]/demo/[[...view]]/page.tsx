import { notFound } from 'next/navigation';
import { Dashboard } from '@/components/dashboard';
import { demoData } from '@/lib/demo';
export default async function Demo({ params }: { params: Promise<{ view?: string[] }> }) {
  const { view } = await params,
    section = view?.[0] || 'overview';
  if (
    (view?.length ?? 0) > 1 ||
    !['overview', 'inbox', 'agencies', 'team', 'connections', 'settings'].includes(section)
  )
    notFound();
  return <Dashboard data={demoData} section={section} demo />;
}
