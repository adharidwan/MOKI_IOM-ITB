export interface BlastTemplateRecipient {
  no_telp: string;
  nama?: string;
  group_names?: string[];
}

export const BLAST_VARIABLES = [
  { token: '{{name}}', label: 'Nama penerima' },
  { token: '{{phone_number}}', label: 'Nomor WhatsApp' },
  { token: '{{group_name}}', label: 'Nama grup' },
] as const;

function normalizeGroupNames(groupNames: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  (groupNames || []).forEach((groupName) => {
    const trimmedGroupName = String(groupName || '').trim();

    if (!trimmedGroupName) {
      return;
    }

    const dedupeKey = trimmedGroupName.toLowerCase();
    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    normalized.push(trimmedGroupName);
  });

  return normalized;
}

export function renderBlastMessageTemplate(
  template: string,
  recipient: BlastTemplateRecipient,
): string {
  const renderedValues = {
    name: String(recipient.nama || '').trim(),
    phone_number: String(recipient.no_telp || '').trim(),
    group_name: normalizeGroupNames(recipient.group_names).join(', '),
  };

  return template.replace(/\{\{\s*(name|phone_number|group_name)\s*\}\}/g, (_match, variableName) => {
    const replacement = renderedValues[variableName as keyof typeof renderedValues];
    return replacement || '';
  });
}
