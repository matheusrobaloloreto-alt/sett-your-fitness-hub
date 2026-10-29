import { readFileSync } from 'node:fs';

// Read only ELF NT_FILE mappings, never memory contents or process environment.
const core = readFileSync(process.argv[2]);
if (core.subarray(0, 4).toString('hex') !== '7f454c46' || core[4] !== 2 || core[5] !== 1) {
  throw new Error('Expected little-endian ELF64 core');
}
const u64 = offset => Number(core.readBigUInt64LE(offset));
const phoff = u64(32), size = core.readUInt16LE(54), count = core.readUInt16LE(56);
for (let index = 0; index < count; index++) {
  const header = phoff + index * size;
  if (core.readUInt32LE(header) !== 4) continue;
  let offset = u64(header + 8);
  const end = offset + u64(header + 32);
  while (offset < end) {
    const namesz = core.readUInt32LE(offset), descsz = core.readUInt32LE(offset + 4);
    const type = core.readUInt32LE(offset + 8);
    const desc = offset + 12 + Math.ceil(namesz / 4) * 4;
    if (type === 0x46494c45) {
      const entries = u64(desc), page = u64(desc + 8);
      const names = core.subarray(desc + 16 + entries * 24, desc + descsz).toString().split('\0');
      for (let i = 0; i < entries; i++) {
        if (!/supautils|plpgsql|postgres-wrapped|libc\.so/.test(names[i] ?? '')) continue;
        const position = desc + 16 + i * 24;
        console.log(JSON.stringify({ file: names[i], start: `0x${u64(position).toString(16)}`,
          end: `0x${u64(position + 8).toString(16)}`, offset: u64(position + 16) * page }));
      }
    }
    offset = desc + Math.ceil(descsz / 4) * 4;
  }
}
