import { describe, expect, it } from 'vitest';

import { renderBlastMessageTemplate } from '../app/lib/blast-variables';

describe('blast variables', () => {
  it('renders supported variables from recipient data', () => {
    expect(
      renderBlastMessageTemplate('Halo {{name}} dari {{group_name}} di {{phone_number}}', {
        no_telp: '6281234567890',
        nama: 'Ibu Rina',
        group_names: ['VIP', 'Orang Tua A'],
      }),
    ).toBe('Halo Ibu Rina dari VIP, Orang Tua A di 6281234567890');
  });

  it('falls back to empty strings for missing values', () => {
    expect(
      renderBlastMessageTemplate('Halo {{name}} {{group_name}} {{phone_number}}', {
        no_telp: '6281234567890',
      }),
    ).toBe('Halo   6281234567890');
  });
});
