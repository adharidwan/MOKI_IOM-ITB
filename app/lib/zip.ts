import 'server-only';

export interface ZipFileEntry {
  name: string;
  data: Uint8Array;
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
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });
  return (crc ^ 0xffffffff) >>> 0;
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
