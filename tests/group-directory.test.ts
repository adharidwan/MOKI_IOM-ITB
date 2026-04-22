import { describe, expect, it } from 'vitest';

import { buildContactGroupDirectory } from '../app/lib/group-directory';

describe('group directory helper', () => {
  it('builds sorted groups with member lists from contact group_names', () => {
    const groups = buildContactGroupDirectory([
      {
        id: '1',
        no_telp: '628111111111',
        nama: 'Budi',
        jenis_kelamin: 'Laki-laki',
        jabatan: 'Staff',
        group_names: ['VIP', 'Tim A'],
        source_file: null,
        imported_at: '2026-04-21T00:00:00.000Z',
        created_at: '2026-04-21T00:00:00.000Z',
      },
      {
        id: '2',
        no_telp: '628222222222',
        nama: 'Citra',
        jenis_kelamin: 'Perempuan',
        jabatan: null,
        group_names: ['VIP'],
        source_file: null,
        imported_at: '2026-04-21T00:00:00.000Z',
        created_at: '2026-04-21T00:00:00.000Z',
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      name: 'VIP',
      memberCount: 2,
    });
    expect(groups[1]).toMatchObject({
      name: 'Tim A',
      memberCount: 1,
    });
    expect(groups[0]?.members.map((member) => member.nama)).toEqual(['Budi', 'Citra']);
  });
});
