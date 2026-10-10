import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import { loadWorkspace } from '@/lib/workspace';
import { Dashboard } from '@/components/dashboard';
export const dynamic = 'force-dynamic';
export default async function Workspace({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; view?: string[] }>;
  searchParams: Promise<{ create?: string | string[] }>;
}) {
  const { locale, view } = await params;
  const section = view?.[0] || 'overview';
  if (section === 'products') redirect(`/${locale}/app/offers`);
  if (
    (view?.length ?? 0) > 1 ||
    ![
      'overview',
      'offers',
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
  if (
    (session.user.platformRole === 'admin' && section === 'inbox') ||
    (session.user.platformRole !== 'admin' && section === 'agencies') ||
    section === 'team'
  )
    redirect(`/${locale}/app`);
  const { create } = await searchParams;
  const request = typeof create === 'string' ? create : undefined;
  return (
    <Dashboard
      key={`${section}:${request ?? ''}`}
      data={await loadWorkspace(session.user, section === 'overview')}
      section={section}
      create={request}
    />
  );
}
