import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import { loadWorkspace } from '@/lib/workspace';
import { Dashboard } from '@/components/dashboard';
export const dynamic = 'force-dynamic';
export default async function Workspace({
  params,
}: {
  params: Promise<{ locale: string; view?: string[] }>;
}) {
  const { locale, view } = await params;
  const section = view?.[0] || 'overview';
  if (
    (view?.length ?? 0) > 1 ||
    ![
      'overview',
      'campaigns',
      'customers',
      'inbox',
      'agencies',
      'team',
      'connections',
      'settings',
    ].includes(section)
  )
    notFound();
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect(`/${locale}`);
  if (section === 'customers' && session.user.platformRole !== 'admin') notFound();
  return <Dashboard data={await loadWorkspace(session.user)} section={section} />;
}
