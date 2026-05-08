import AdminFeatureShell from '../components/AdminFeatureShell';
import { FEATURE_DEFINITIONS, listManagedAccessUsers, requireAdminAccess } from '../lib/access-control';

import AccessControlWorkspace from './AccessControlWorkspace';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AccessControlPage() {
  await requireAdminAccess();
  const users = await listManagedAccessUsers();

  return (
    <AdminFeatureShell
      currentPath="/access-control"
      badge="Admin"
      title="Access Control"
      description="Atur fitur yang bisa dibuka oleh setiap akun SSO non-admin."
    >
      <AccessControlWorkspace initialUsers={users} features={FEATURE_DEFINITIONS} />
    </AdminFeatureShell>
  );
}
