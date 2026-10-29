import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const directory = path.resolve(process.argv[2] ?? 'output/postgres-diagnosis-core-private');
if (!directory.startsWith(path.resolve('output') + path.sep)) throw new Error('Private output directory required');
const mapping = execFileSync(process.execPath, ['scripts/qa/postgres-core-map.mjs', path.join(directory, 'core')], { encoding: 'utf8' })
  .trim().split('\n').map(line => JSON.parse(line));
const extension = mapping.find(row => row.file.endsWith('/supautils.so') && row.offset === 0);
if (!extension) throw new Error('supautils mapping not found');
const library = path.join(directory, 'supautils.so');
const result = execFileSync('/usr/bin/lldb', ['-b', path.join(directory, 'postgres.elf'), '-c', path.join(directory, 'core'),
  '-o', `target modules search-paths add ${path.dirname(extension.file)} ${directory}`,
  '-o', 'thread backtrace -c 40', '-o', 'register read rdi rip', '-o', 'quit'], { encoding: 'utf8', timeout: 30000 });
writeFileSync(path.join(directory, 'backtrace.txt'), result, { mode: 0o600 });
console.log(result);
