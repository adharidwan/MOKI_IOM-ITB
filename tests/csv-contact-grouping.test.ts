import { beforeEach, describe, expect, it, vi } from 'vitest';

let fakeSupabase: any;

const createdContacts: Array<Record<string, unknown>> = [];
const updatedContacts: Array<Record<string, unknown>> = [];
const rpcCalls: Array<Record<string, unknown>> = [];

vi.mock('server-only', () => ({}));

vi.mock('../app/lib/supabase-server', () => ({
  getSupabaseServerClient: vi.fn(),
  getSupabaseAdminClient: vi.fn(() => fakeSupabase),
}));

beforeEach(() => {
  createdContacts.length = 0;
  updatedContacts.length = 0;
  rpcCalls.length = 0;

  fakeSupabase = {
    rpc(fnName: string, params: Record<string, unknown>) {
      rpcCalls.push({ fnName, params });
      return Promise.resolve({ data: Array.isArray(params.p_contact_ids) ? params.p_contact_ids.length : 0, error: null });
    },
    from(tableName: string) {
      if (tableName !== 'csv_contacts') {
        throw new Error(`Unexpected table access: ${tableName}`);
      }

      return {
        upsert(payload: Record<string, unknown>) {
          createdContacts.push(payload);

          return {
            error: null,
            select() {
              return {
                async single() {
                  return {
                    data: {
                      id: 'contact-1',
                      ...payload,
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          return {
            select(_columns?: string) {
              return {
                in(_column: string, ids: string[]) {
                  updatedContacts.push({ payload, ids });

                  return Promise.resolve({
                    data: ids.map((id) => ({ id, ...payload })),
                    error: null,
                  });
                },
              };
            },
            in(_column: string, ids: string[]) {
              updatedContacts.push({ payload, ids });

              return {
                async select() {
                  return {
                    data: ids.map((id) => ({ id })),
                    error: null,
                  };
                },
              };
            },
            eq(_column: string, value: string) {
              updatedContacts.push({ payload, id: value });

              return {
                select() {
                  return {
                    async single() {
                      return {
                        data: {
                          id: value,
                          ...payload,
                        },
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
});

describe('csv contact grouping helpers', () => {
  it('persists multiple group_names on create and update', async () => {
    const { createCsvContact, updateCsvContact } = await import('../app/lib/api');

    const created = await createCsvContact({
      no_telp: '628111111111',
      nama: 'Sinta',
      jenis_kelamin: 'Perempuan',
      jabatan: 'Staff',
      group_names: ['Tim A', 'VIP'],
    });

    expect(createdContacts[0]?.group_names).toEqual(['Tim A', 'VIP']);
    expect(created.group_names).toEqual(['Tim A', 'VIP']);

    const updated = await updateCsvContact('contact-1', {
      no_telp: '628111111111',
      nama: 'Sinta',
      jenis_kelamin: 'Perempuan',
      jabatan: 'Lead',
      group_names: ['Tim B', 'VIP'],
    });

    expect(updatedContacts[0]).toMatchObject({
      id: 'contact-1',
      payload: {
        no_telp: '628111111111',
        nama: 'Sinta',
        jenis_kelamin: 'Perempuan',
        jabatan: 'Lead',
        group_names: ['Tim B', 'VIP'],
      },
    });
    expect(updated.group_names).toEqual(['Tim B', 'VIP']);
  });

  it('adds selected group names through the atomic rpc helper', async () => {
    const { addCsvContactsGroups } = await import('../app/lib/api');

    const updatedCount = await addCsvContactsGroups(['contact-1', 'contact-2'], ['Tim Sales', 'VIP']);

    expect(updatedCount).toBe(2);
    expect(rpcCalls[0]).toEqual({
      fnName: 'add_csv_contact_groups',
      params: {
        p_contact_ids: ['contact-1', 'contact-2'],
        p_group_names: ['Tim Sales', 'VIP'],
      },
    });
  });

  it('syncs save-to-group without overwriting existing contact fields', async () => {
    const { syncCsvContactsToGroups } = await import('../app/lib/api');

    fakeSupabase = {
      rpc(fnName: string, params: Record<string, unknown>) {
        rpcCalls.push({ fnName, params });
        return Promise.resolve({ data: 1, error: null });
      },
      from(tableName: string) {
        if (tableName !== 'csv_contacts') {
          throw new Error(`Unexpected table access: ${tableName}`);
        }

        return {
          select() {
            return {
              in(_column: string, phoneNumbers: string[]) {
                return Promise.resolve({
                  data: phoneNumbers.includes('628111111111')
                    ? [
                        {
                          id: 'contact-existing',
                          no_telp: '628111111111',
                          nama: 'Sinta Asli',
                          jenis_kelamin: 'Perempuan',
                          jabatan: 'Supervisor',
                          group_names: ['Existing'],
                          source_file: null,
                          imported_at: '2026-04-04T00:00:00.000Z',
                          created_at: '2026-04-04T00:00:00.000Z',
                        },
                      ]
                    : [],
                  error: null,
                });
              },
            };
          },
          upsert(payload: Record<string, unknown>[]) {
            createdContacts.push(...payload);

            return {
              error: null,
            };
          },
        };
      },
    };

    const result = await syncCsvContactsToGroups({
      contacts: [
        {
          no_telp: '628111111111',
          nama: 'Kontak 628111111111',
          jenis_kelamin: 'Tidak diketahui',
        },
        {
          no_telp: '628222222222',
          nama: 'Budi',
          jenis_kelamin: 'Laki-laki',
          jabatan: 'Sales',
        },
      ],
      groupNames: ['VIP'],
      sourceFile: 'manual-input',
    });

    expect(result).toEqual({ createdCount: 1, updatedCount: 1 });
    expect(createdContacts).toEqual([
      {
        no_telp: '628222222222',
        nama: 'Budi',
        jenis_kelamin: 'Laki-laki',
        jabatan: 'Sales',
        group_names: ['VIP'],
        source_file: 'manual-input',
        imported_at: expect.any(String),
      },
    ]);
    expect(rpcCalls[0]).toEqual({
      fnName: 'add_csv_contact_groups',
      params: {
        p_contact_ids: ['contact-existing'],
        p_group_names: ['VIP'],
      },
    });
  });
});
