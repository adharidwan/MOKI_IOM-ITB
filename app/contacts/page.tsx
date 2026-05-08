import AdminFeatureShell from '../components/AdminFeatureShell';
import PhoneListToast from '../components/PhoneListToast';
import { getCsvContactsOverview, getPaginatedCsvContacts } from '../lib/api';
import { requireFeatureAccess } from '../lib/access-control';
import { getPaginatedContactGroups } from '../lib/group-directory-server';
import ContactsWorkspace from './ContactsWorkspace';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireFeatureAccess('contacts');
  const resolvedSearchParams = await searchParams;
  const page = Number(resolvedSearchParams.page) || 1;
  const search = String(resolvedSearchParams.search || '');
  const groupName = String(resolvedSearchParams.groupName || '');
  const rawSortBy = String(resolvedSearchParams.sortBy || 'imported_at');
  const rawSortDir = String(resolvedSearchParams.sortDir || 'desc');
  const sortBy = rawSortBy === 'nama' || rawSortBy === 'no_telp' || rawSortBy === 'status' ? rawSortBy : 'imported_at';
  const sortDir = rawSortDir === 'asc' ? 'asc' : 'desc';
  const [contactsPage, overview, groupsPage] = await Promise.all([
    getPaginatedCsvContacts({ page, pageSize: 20, search, groupName, sortBy, sortDir }),
    getCsvContactsOverview(),
    getPaginatedContactGroups({ page: 1, pageSize: 100, search: '' }),
  ]);

  return (
    <AdminFeatureShell
      currentPath="/contacts"
      badge="Contacts"
      title="Recipient directory"
      description="Cari, filter, dan rapikan penerima dari satu tabel kerja yang cepat dipindai."
    >
      <PhoneListToast />

      <ContactsWorkspace
        overview={overview}
        groupsTotal={groupsPage.total}
        groupOptions={groupsPage.items.map((group) => group.name)}
        contacts={contactsPage.items}
        totalCount={contactsPage.total}
        currentPage={contactsPage.page}
        totalPages={contactsPage.totalPages}
        currentSearch={search}
        currentGroupName={groupName}
        currentSortBy={sortBy}
        currentSortDir={sortDir}
      />
    </AdminFeatureShell>
  );
}
