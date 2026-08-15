import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");
const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"))
  .sort();
const knownTables = new Set();
const failures = [];

for (const file of files) {
  const lines = readFileSync(resolve(migrationsDir, file), "utf8").split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const create = line.match(/^\s*create table(?: if not exists)? public\.(wearable_[a-z_]+)/i);
    if (create) knownTables.add(create[1].toLowerCase());
    const policy = line.match(/^\s*create policy .* on public\.(wearable_[a-z_]+)/i);
    if (policy && !knownTables.has(policy[1].toLowerCase())) {
      failures.push(`${file}:${index + 1} references ${policy[1]} before CREATE TABLE`);
    }
  }
}

if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("wearables migration ordering: ok\n");
}
