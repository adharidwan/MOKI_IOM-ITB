import { NextResponse } from 'next/server';

import { renderBlastMessageTemplate } from '@/app/lib/blast-variables';
import { syncCsvContactsToGroups, type CsvContactInput } from '@/app/lib/api';
import {
  createDirectBlastOutboundMessages,
  createGroupBlastOutboundMessages,
  createPersonalizedBlastOutboundMessages,
} from '@/app/lib/whatsapp-notification-repository';
import { normalizePhoneNumber } from '@/app/lib/whatsapp-notification-utils';

interface BlastRecipientInput {
  no_telp?: string;
  nama?: string;
  jenis_kelamin?: string;
  jabatan?: string;
  group_names?: string[];
}

interface BlastRequestBody {
  message?: string;
  source?: 'manual' | 'csv' | 'group';
  recipients?: BlastRecipientInput[];
  groupNames?: string[];
  saveToGroup?: boolean;
  groupName?: string;
  sourceFile?: string;
}

function normalizeGroupNames(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function normalizeRecipients(recipients: BlastRecipientInput[]): CsvContactInput[] {
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BlastRequestBody;
    const message = String(body.message || '').trim();
    const saveToGroup = Boolean(body.saveToGroup);
    const groupName = String(body.groupName || '').trim();

    if (!message) {
      return NextResponse.json({ error: 'Pesan blast wajib diisi.' }, { status: 400 });
    }

    const source = body.source || 'manual';
    const groupNames = normalizeGroupNames(Array.isArray(body.groupNames) ? body.groupNames : []);
    const recipientRows = normalizeRecipients(Array.isArray(body.recipients) ? body.recipients : []);

    if (source === 'group') {
      if (!groupNames.length) {
        return NextResponse.json({ error: 'Pilih minimal satu grup penerima.' }, { status: 400 });
      }

      if (recipientRows.length > 0) {
        const blastResult = await createPersonalizedBlastOutboundMessages({
          recipients: recipientRows.map((recipient) => ({
            recipientPhoneNumber: recipient.no_telp,
            content: renderBlastMessageTemplate(message, recipient),
          })),
        });

        if (blastResult.totalRecipients === 0) {
          return NextResponse.json({ error: 'Grup terpilih belum memiliki kontak.' }, { status: 400 });
        }

        if (blastResult.acceptedCount === 0) {
          return NextResponse.json(
            {
              error: 'Semua pesan blast gagal masuk ke antrian.',
              ...blastResult,
            },
            { status: 500 },
          );
        }

        return NextResponse.json(
          {
            success: true,
            source,
            personalized: true,
            ...blastResult,
          },
          { status: blastResult.failedCount > 0 ? 207 : 200 },
        );
      }

      const blastResult = await createGroupBlastOutboundMessages({
        groupNames,
        content: message,
      });

      if (blastResult.totalRecipients === 0) {
        return NextResponse.json({ error: 'Grup terpilih belum memiliki kontak.' }, { status: 400 });
      }

      if (blastResult.acceptedCount === 0) {
        return NextResponse.json(
          {
            error: 'Semua pesan blast gagal masuk ke antrian.',
            ...blastResult,
          },
          { status: 500 },
        );
      }

      return NextResponse.json(
        {
          success: true,
          source,
          ...blastResult,
        },
        { status: blastResult.failedCount > 0 ? 207 : 200 },
      );
    }

    if (!recipientRows.length) {
      return NextResponse.json({ error: 'Tidak ada nomor tujuan valid.' }, { status: 400 });
    }

    if (saveToGroup && !groupName) {
      return NextResponse.json({ error: 'Nama group wajib diisi saat save ke group.' }, { status: 400 });
    }

    if (saveToGroup) {
      await syncCsvContactsToGroups({
        contacts: recipientRows,
        groupNames: [groupName],
        sourceFile: String(body.sourceFile || body.source || 'blast-manual'),
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

    if (blastResult.acceptedCount === 0) {
      return NextResponse.json(
        {
          error: 'Semua pesan blast gagal masuk ke antrian.',
          ...blastResult,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        savedToGroup: saveToGroup,
        groupName: saveToGroup ? groupName : null,
        ...blastResult,
      },
      { status: blastResult.failedCount > 0 ? 207 : 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Gagal memproses blast message.',
      },
      { status: 500 },
    );
  }
}
