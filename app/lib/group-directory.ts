import type { CsvContact } from './types';

export interface ContactGroupDirectoryEntry {
  name: string;
  memberCount: number;
  members: CsvContact[];
}

export function buildContactGroupDirectory(
  contacts: CsvContact[],
): ContactGroupDirectoryEntry[] {
  const groups = new Map<string, CsvContact[]>();

  contacts.forEach((contact) => {
    contact.group_names.forEach((groupName) => {
      const normalizedGroupName = String(groupName || '').trim();

      if (!normalizedGroupName) {
        return;
      }

      const members = groups.get(normalizedGroupName) || [];
      members.push(contact);
      groups.set(normalizedGroupName, members);
    });
  });

  return Array.from(groups.entries())
    .map(([name, members]) => ({
      name,
      memberCount: members.length,
      members: [...members].sort((left, right) => left.nama.localeCompare(right.nama)),
    }))
    .sort((left, right) => {
      if (right.memberCount !== left.memberCount) {
        return right.memberCount - left.memberCount;
      }

      return left.name.localeCompare(right.name);
    });
}
