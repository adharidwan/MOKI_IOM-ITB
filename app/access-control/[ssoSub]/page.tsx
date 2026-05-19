import { notFound } from 'next/navigation';

import AdminFeatureShell from '../../components/AdminFeatureShell';
import { FEATURE_DEFINITIONS, getManagedAccessUser, requireAdminAccess } from '../../lib/access-control';
import AccessControlWorkspace from '../AccessControlWorkspace';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AccessControlDetailPage({
  params,
}: {
  params: Promise<{ ssoSub: string }>;
}) {
  await requireAdminAccess();
  const { ssoSub } = await params;
  const user = await getManagedAccessUser(decodeURIComponent(ssoSub));

  if (!user) {
    notFound();
  }

  return (
    <AdminFeatureShell
      currentPath="/access-control"
      badge="Admin"
      title="Access Control"
      description="Atur fitur yang bisa dibuka oleh setiap akun SSO non-admin."
    >
      <AccessControlWorkspace initialUsers={[user]} features={FEATURE_DEFINITIONS} />
    </AdminFeatureShell>
  );
}
