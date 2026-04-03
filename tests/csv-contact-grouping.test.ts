import { beforeEach, describe, expect, it, vi } from 'vitest';

let fakeSupabase: any;

const createdContacts: Array<Record<string, unknown>> = [];
const updatedContacts: Array<Record<string, unknown>> = [];

vi.mock('server-only', () => ({}));

vi.mock('../app/lib/supabase-server', () => ({
  getSupabaseServerClient: vi.fn(),
  getSupabaseAdminClient: vi.fn(() => fakeSupabase),
}));

beforeEach(() => {
  createdContacts.length = 0;
  updatedContacts.length = 0;

  fakeSupabase = {
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

  it('adds selected group names without removing existing ones', async () => {
    const { addCsvContactsGroups } = await import('../app/lib/api');

    fakeSupabase = {
      from(tableName: string) {
        if (tableName !== 'csv_contacts') {
          throw new Error(`Unexpected table access: ${tableName}`);
        }

        return {
          select() {
            return {
              in(_column: string, ids: string[]) {
                return Promise.resolve({
                  data: ids.map((id, index) => ({
                    id,
                    group_names: index === 0 ? ['Existing'] : ['VIP'],
                  })),
                  error: null,
                });
              },
            };
          },
          update(payload: Record<string, unknown>) {
            return {
              eq(_column: string, value: string) {
                updatedContacts.push({ payload, id: value });

                return {
                  async select() {
                    return { data: { id: value, ...payload }, error: null };
                  },
                };
              },
            };
          },
        };
      },
    };

    const updatedCount = await addCsvContactsGroups(['contact-1', 'contact-2'], ['Tim Sales', 'VIP']);

    expect(updatedCount).toBe(2);
    expect(updatedContacts).toHaveLength(2);
    expect(updatedContacts[0]).toMatchObject({
      id: 'contact-1',
      payload: { group_names: ['Existing', 'Tim Sales', 'VIP'] },
    });
  });
});