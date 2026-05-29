import 'server-only';

import fs from 'fs';
import { stat } from 'fs/promises';

export interface ZipFileEntry {
  name: string;
  data: Uint8Array;
}

export interface ZipFilePathEntry {
  name: string;
  path: string;
}

interface CentralDirectoryEntry {
  nameBytes: Uint8Array;
  crc: number;
  size: number;
  offset: number;
}

const textEncoder = new TextEncoder();
const CRC_TABLE = new Uint32Array(256);

for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  CRC_TABLE[index] = value >>> 0;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  data.forEach((byte) => {
    crc = updateCrc32(crc, byte);
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function updateCrc32(crc: number, byte: number): number {
  return CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
}

function writeUInt16(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
}

function writeUInt32(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
}

function assertZip32Size(value: number) {
  if (value > 0xffffffff) {
    throw new Error('Total ukuran ZIP terlalu besar untuk dibuat.');
  }
}

function concatChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const output = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });

  return output;
}

function createLocalHeader(entry: CentralDirectoryEntry): Uint8Array {
  const header = new Uint8Array(30 + entry.nameBytes.length);

  writeUInt32(header, 0, 0x04034b50);
  writeUInt16(header, 4, 20);
  writeUInt16(header, 6, 0x0800);
  writeUInt16(header, 8, 0);
  writeUInt16(header, 10, 0);
  writeUInt16(header, 12, 0);
  writeUInt32(header, 14, entry.crc);
  writeUInt32(header, 18, entry.size);
  writeUInt32(header, 22, entry.size);
  writeUInt16(header, 26, entry.nameBytes.length);
  writeUInt16(header, 28, 0);
  header.set(entry.nameBytes, 30);

  return header;
}

function createCentralDirectoryHeader(entry: CentralDirectoryEntry): Uint8Array {
  const header = new Uint8Array(46 + entry.nameBytes.length);

  writeUInt32(header, 0, 0x02014b50);
  writeUInt16(header, 4, 20);
  writeUInt16(header, 6, 20);
  writeUInt16(header, 8, 0x0800);
  writeUInt16(header, 10, 0);
  writeUInt16(header, 12, 0);
  writeUInt16(header, 14, 0);
  writeUInt32(header, 16, entry.crc);
  writeUInt32(header, 20, entry.size);
  writeUInt32(header, 24, entry.size);
  writeUInt16(header, 28, entry.nameBytes.length);
  writeUInt16(header, 30, 0);
  writeUInt16(header, 32, 0);
  writeUInt16(header, 34, 0);
  writeUInt16(header, 36, 0);
  writeUInt32(header, 38, 0);
  writeUInt32(header, 42, entry.offset);
  header.set(entry.nameBytes, 46);

  return header;
}

function createEndRecord(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number): Uint8Array {
  const endRecord = new Uint8Array(22);

  if (entryCount > 0xffff) {
    throw new Error('Jumlah file ZIP terlalu banyak.');
  }

  writeUInt32(endRecord, 0, 0x06054b50);
  writeUInt16(endRecord, 4, 0);
  writeUInt16(endRecord, 6, 0);
  writeUInt16(endRecord, 8, entryCount);
  writeUInt16(endRecord, 10, entryCount);
  writeUInt32(endRecord, 12, centralDirectorySize);
  writeUInt32(endRecord, 16, centralDirectoryOffset);
  writeUInt16(endRecord, 20, 0);

  return endRecord;
}

async function getFileCrc32(filePath: string): Promise<number> {
  let crc = 0xffffffff;

  for await (const chunk of fs.createReadStream(filePath)) {
    const bytes = chunk instanceof Uint8Array ? chunk : Buffer.from(chunk);
    bytes.forEach((byte) => {
      crc = updateCrc32(crc, byte);
    });
  }

  return (crc ^ 0xffffffff) >>> 0;
}

export function createZip(entries: ZipFileEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const centralDirectory: CentralDirectoryEntry[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = textEncoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);

    assertZip32Size(offset);
    assertZip32Size(data.length);

    writeUInt32(localHeader, 0, 0x04034b50);
    writeUInt16(localHeader, 4, 20);
    writeUInt16(localHeader, 6, 0x0800);
    writeUInt16(localHeader, 8, 0);
    writeUInt16(localHeader, 10, 0);
    writeUInt16(localHeader, 12, 0);
    writeUInt32(localHeader, 14, crc);
    writeUInt32(localHeader, 18, data.length);
    writeUInt32(localHeader, 22, data.length);
    writeUInt16(localHeader, 26, nameBytes.length);
    writeUInt16(localHeader, 28, 0);
    localHeader.set(nameBytes, 30);

    chunks.push(localHeader, data);
    centralDirectory.push({ nameBytes, crc, size: data.length, offset });
    offset += localHeader.length + data.length;
    assertZip32Size(offset);
  });

  const centralDirectoryOffset = offset;

  centralDirectory.forEach((entry) => {
    const header = new Uint8Array(46 + entry.nameBytes.length);

    writeUInt32(header, 0, 0x02014b50);
    writeUInt16(header, 4, 20);
    writeUInt16(header, 6, 20);
    writeUInt16(header, 8, 0x0800);
    writeUInt16(header, 10, 0);
    writeUInt16(header, 12, 0);
    writeUInt16(header, 14, 0);
    writeUInt32(header, 16, entry.crc);
    writeUInt32(header, 20, entry.size);
    writeUInt32(header, 24, entry.size);
    writeUInt16(header, 28, entry.nameBytes.length);
    writeUInt16(header, 30, 0);
    writeUInt16(header, 32, 0);
    writeUInt16(header, 34, 0);
    writeUInt16(header, 36, 0);
    writeUInt32(header, 38, 0);
    writeUInt32(header, 42, entry.offset);
    header.set(entry.nameBytes, 46);

    chunks.push(header);
    offset += header.length;
    assertZip32Size(offset);
  });

  const centralDirectorySize = offset - centralDirectoryOffset;
  const endRecord = new Uint8Array(22);

  if (centralDirectory.length > 0xffff) {
    throw new Error('Jumlah file ZIP terlalu banyak.');
  }

  writeUInt32(endRecord, 0, 0x06054b50);
  writeUInt16(endRecord, 4, 0);
  writeUInt16(endRecord, 6, 0);
  writeUInt16(endRecord, 8, centralDirectory.length);
  writeUInt16(endRecord, 10, centralDirectory.length);
  writeUInt32(endRecord, 12, centralDirectorySize);
  writeUInt32(endRecord, 16, centralDirectoryOffset);
  writeUInt16(endRecord, 20, 0);
  chunks.push(endRecord);
  offset += endRecord.length;

  return concatChunks(chunks, offset);
}

export async function createZipFileStream(entries: ZipFilePathEntry[]): Promise<{ stream: ReadableStream<Uint8Array>; size: number }> {
  const centralDirectory: CentralDirectoryEntry[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileStats = await stat(entry.path);
    const nameBytes = textEncoder.encode(entry.name);
    const size = fileStats.size;
    const crc = await getFileCrc32(entry.path);

    assertZip32Size(offset);
    assertZip32Size(size);

    centralDirectory.push({ nameBytes, crc, size, offset });
    offset += 30 + nameBytes.length + size;
    assertZip32Size(offset);
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralDirectory.reduce((total, entry) => total + 46 + entry.nameBytes.length, 0);
  const endRecord = createEndRecord(centralDirectory.length, centralDirectorySize, centralDirectoryOffset);
  const totalSize = centralDirectoryOffset + centralDirectorySize + endRecord.length;

  assertZip32Size(totalSize);

  async function* streamZip() {
    for (let index = 0; index < entries.length; index += 1) {
      yield createLocalHeader(centralDirectory[index]);

      for await (const chunk of fs.createReadStream(entries[index].path)) {
        yield chunk instanceof Uint8Array ? chunk : Buffer.from(chunk);
      }
    }

    for (const entry of centralDirectory) {
      yield createCentralDirectoryHeader(entry);
    }

    yield endRecord;
  }

  const iterator = streamZip();

  return {
    stream: new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await iterator.next();
          if (done) {
            controller.close();
            return;
          }

          controller.enqueue(value);
        } catch (error) {
          controller.error(error);
        }
      },
      async cancel() {
        await iterator.return?.();
      },
    }),
    size: totalSize,
  };
}
