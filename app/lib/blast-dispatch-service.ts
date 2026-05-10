import 'server-only';

import { renderBlastMessageTemplate } from '@/app/lib/blast-variables';
import { syncCsvContactsToGroups, type CsvContactInput } from '@/app/lib/api';
import { resolveAllGroupRecipients } from '@/app/lib/group-directory-server';
import {
  createDirectBlastOutboundMessages,
  createPersonalizedBlastOutboundMessages,
  type BlastDispatchResult,
} from '@/app/lib/whatsapp-notification-repository';
import { normalizePhoneNumber } from '@/app/lib/whatsapp-notification-utils';

export type BlastSource = 'manual' | 'csv' | 'group' | 'contact';

export interface BlastRecipientInput {
  no_telp?: string;
  nama?: string;
  jenis_kelamin?: string;
  jabatan?: string;
  group_names?: string[];
}

export interface DispatchBlastMessageInput {
  message: string;
  source: BlastSource;
  recipients?: BlastRecipientInput[];
  groupNames?: string[];
  saveToGroup?: boolean;
  groupName?: string;
  sourceFile?: string;
}

export interface DispatchBlastMessageResult extends BlastDispatchResult {
  success: true;
  source: BlastSource;
  personalized?: boolean;
  savedToGroup?: boolean;
  groupName?: string | null;
}

export class BlastDispatchError extends Error {
  status: number;
  result?: Partial<BlastDispatchResult>;

  constructor(message: string, status = 400, result?: Partial<BlastDispatchResult>) {
    super(message);
    this.name = 'BlastDispatchError';
    this.status = status;
    this.result = result;
  }
}

export function normalizeGroupNames(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter((value) => value.length > 0),
    ),
  );
}

export function normalizeBlastRecipients(recipients: BlastRecipientInput[]): CsvContactInput[] {
  const dedupedByPhone = new Map<string, CsvContactInput>();

  recipients.forEach((recipient) => {
    const rawPhoneNumber = String(recipient.no_telp || '');
    const phoneNumber = normalizePhoneNumber(rawPhoneNumber);

    if (!phoneNumber) {
      return;
    }

    const name = String(recipient.nama || '').trim() || `Kontak ${phoneNumber}`;
    const gender = String(recipient.jenis_kelamin || '').trim() || 'Tidak diketahui';
    const title = String(recipient.jabatan || '').trim() || undefined;
    const groupNames = normalizeGroupNames(
      Array.isArray(recipient.group_names) ? recipient.group_names : [],
    );

    dedupedByPhone.set(phoneNumber, {
      no_telp: phoneNumber,
      nama: name,
      jenis_kelamin: gender,
      jabatan: title,
      group_names: groupNames,
    });
  });

  return Array.from(dedupedByPhone.values());
}

function assertAcceptedBlastResult(blastResult: BlastDispatchResult): void {
  if (blastResult.acceptedCount === 0) {
    throw new BlastDispatchError('Semua pesan blast gagal masuk ke antrian.', 500, blastResult);
  }
}

export async function dispatchBlastMessage(input: DispatchBlastMessageInput): Promise<DispatchBlastMessageResult> {
  const message = String(input.message || '').trim();
  const saveToGroup = Boolean(input.saveToGroup);
  const groupName = String(input.groupName || '').trim();

  if (!message) {
    throw new BlastDispatchError('Pesan blast wajib diisi.', 400);
  }

  const source = input.source || 'manual';
  const groupNames = normalizeGroupNames(Array.isArray(input.groupNames) ? input.groupNames : []);
  const recipientRows = normalizeBlastRecipients(Array.isArray(input.recipients) ? input.recipients : []);

  if (source === 'group') {
    if (!groupNames.length) {
      throw new BlastDispatchError('Pilih minimal satu grup penerima.', 400);
    }

    const resolvedGroupRecipients = await resolveAllGroupRecipients(groupNames);

    if (!resolvedGroupRecipients.length) {
      throw new BlastDispatchError('Grup terpilih belum memiliki kontak.', 400);
    }

    const shouldPersonalize = message.includes('{{');
    const blastResult = shouldPersonalize
      ? await createPersonalizedBlastOutboundMessages({
          recipients: resolvedGroupRecipients.map((recipient) => ({
            recipientPhoneNumber: recipient.no_telp,
            content: renderBlastMessageTemplate(message, recipient),
          })),
        })
      : await createDirectBlastOutboundMessages({
          recipientPhoneNumbers: resolvedGroupRecipients.map((recipient) => recipient.no_telp),
          content: message,
        });

    if (blastResult.totalRecipients === 0) {
      throw new BlastDispatchError('Grup terpilih belum memiliki kontak.', 400, blastResult);
    }

    assertAcceptedBlastResult(blastResult);

    return {
      success: true,
      source,
      personalized: shouldPersonalize || undefined,
      ...blastResult,
    };
  }

  if (!recipientRows.length) {
    throw new BlastDispatchError('Tidak ada nomor tujuan valid.', 400);
  }

  if (saveToGroup && !groupName) {
    throw new BlastDispatchError('Nama group wajib diisi saat save ke group.', 400);
  }

  if (saveToGroup) {
    await syncCsvContactsToGroups({
      contacts: recipientRows,
      groupNames: [groupName],
      sourceFile: String(input.sourceFile || source || 'blast-manual'),
    });
  }

  const blastResult = message.includes('{{')
    ? await createPersonalizedBlastOutboundMessages({
        recipients: recipientRows.map((recipient) => ({
          recipientPhoneNumber: recipient.no_telp,
          content: renderBlastMessageTemplate(message, recipient),
        })),
      })
    : await createDirectBlastOutboundMessages({
        recipientPhoneNumbers: recipientRows.map((row) => row.no_telp),
        content: message,
      });

  assertAcceptedBlastResult(blastResult);

  return {
    success: true,
    source,
    savedToGroup: saveToGroup,
    groupName: saveToGroup ? groupName : null,
    ...blastResult,
  };
}
