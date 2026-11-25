import assert from 'node:assert/strict';
import { effectiveBillingCountryCode, supportsAsaasBilling } from '../_shared/fiscal-registration.ts';
const source = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
Deno.test('webhook preserves payment processing while gating only automatic Brazilian invoicing', async () => {
 assert.ok(source.includes('country_code, billing_country_code, company_id'));
 const start=source.indexOf('if (supportsAsaasBilling(effectiveBillingCountryCode(previousStudent)))');
 assert.ok(start>source.indexOf('apply_paid_payment_lifecycle'));
 const end=source.indexOf('\n        if (isFirstActivation',start);
 const block=source.slice(start,end);
 const execute=new (Object.getPrototypeOf(async function(){}).constructor)('previousStudent','supportsAsaasBilling','effectiveBillingCountryCode','createInvoice','asaasPaymentId','asaasConfig',block);
 for(const [student,expected] of [
  [{country_code:'BR'},1], [{country_code:'GB',billing_country_code:'BR'},1],
  [{country_code:'GB'},0], [{country_code:'BR',billing_country_code:'PT'},0],
  [{country_code:'BR',billing_country_code:'invalid'},0]
 ] as const){let writes=0;await execute(student,supportsAsaasBilling,effectiveBillingCountryCode,async()=>{writes++},'pay_fake',{});assert.equal(writes,expected);}
});
