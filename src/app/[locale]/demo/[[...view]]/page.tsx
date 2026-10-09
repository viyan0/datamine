import { notFound, redirect } from 'next/navigation';
import { Dashboard } from '@/components/dashboard';
import { demoData } from '@/lib/demo';
export default async function Demo({
  params,
}: {
  params: Promise<{ locale: string; view?: string[] }>;
}) {
  const { view, locale } = await params,
    section = view?.[0] || 'overview';
  if (section === 'products') redirect(`/${locale}/demo/offers`);
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
  return <Dashboard data={demoData} section={section} demo />;
}
