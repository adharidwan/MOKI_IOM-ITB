export const CSV_CONTACT_TEMPLATE_FILE_NAME = 'template-kontak.csv';

const CSV_CONTACT_TEMPLATE_CONTENT = [
  'nomor,nama',
  '6281234567890,Budi Santoso',
  '6289876543210,Siti Aminah',
  '',
].join('\n');

export function downloadCsvContactTemplate(fileName = CSV_CONTACT_TEMPLATE_FILE_NAME) {
  const blob = new Blob([CSV_CONTACT_TEMPLATE_CONTENT], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
