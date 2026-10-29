import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
// Structural tripwires only. A pass does not prove runtime delivery or tenant authorization.
describe('independent consumer inventory tripwires', () => {
  it.each([
    'supabase/functions/_shared/sales-funnel.ts',
    'supabase/functions/process-automation-sessions/index.ts',
    'supabase/functions/whatsapp-webhook/index.ts',
  ])('%s reaches the durable sequence dispatcher', file => {
    expect(source(file)).toMatch(/dispatchConfiguredMessageSequence\s*\(/);
    expect(source(file)).toMatch(/eventMessageSequence\s*\(/);
  });
  it.each([
    'src/pages/admin/RegistrationManager.tsx',
    'src/pages/admin/AnamnesisManager.tsx',
  ])('%s does not retain the lossy string draft API', file => {
    expect(source(file)).not.toMatch(/\bdraftCompanyEventMessage\b/);
  });
  it('keeps the four push fields on the string consumer', () => {
    const push = source('supabase/functions/push-send/index.ts');
    for (const event of ['daily_reminder_title', 'daily_reminder_body', 'new_workout_push_title', 'new_workout_push_body']) {
      expect(push).toMatch(new RegExp(`eventMessage\\([^;]*['"]${event}['"]`));
    }
    expect(push).not.toMatch(/dispatchConfiguredMessageSequence\s*\(/);
  });
});
