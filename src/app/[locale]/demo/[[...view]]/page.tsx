import { notFound, redirect } from 'next/navigation';
import { Dashboard } from '@/components/dashboard';
import { demoData } from '@/lib/demo';
export default async function Demo({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; view?: string[] }>;
  searchParams: Promise<{ create?: string | string[] }>;
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
  const { create } = await searchParams;
  const request = typeof create === 'string' ? create : undefined;
  return (
    <Dashboard
      key={`${section}:${request ?? ''}`}
      data={demoData}
      section={section}
      demo
      create={request}
    />
  );
}
