import {describe,it,expect} from 'vitest';
import {normalizeCompanyProductSettings as normalize, DEFAULT_COMPANY_PRODUCT_SETTINGS as defaults} from '../../supabase/functions/_shared/company-product-settings';
const modes=['keep_until_replaced','hide_on_expiry'] as const;
describe('QA cfgcontinuity: contrato estrito e legado',()=>{
 it('normalizes an absent settings record to the existing keep behavior',()=>{expect(normalize({}).prescription.expired_workout_behavior).toBe('keep_until_replaced');});
 it('normalizes a legacy prescription without the new property',()=>{expect(normalize({prescription:{default_cadence:'3010'}}).prescription).toMatchObject({default_cadence:'3010',expired_workout_behavior:'keep_until_replaced'});});
 it.each(modes)('accepts exactly the supported mode %s',mode=>{expect(normalize({prescription:{expired_workout_behavior:mode}}).prescription.expired_workout_behavior).toBe(mode);});
 it.each(['','KEEP_UNTIL_REPLACED','hide','unknown',null,true,1,[],{}])('rejects invalid explicit enum %j instead of silently granting keep',mode=>{expect(()=>normalize({prescription:{expired_workout_behavior:mode}})).toThrow();});
 it('does not mutate the caller or the defaults',()=>{const before=structuredClone(defaults);const input={prescription:{expired_workout_behavior:'hide_on_expiry'}};normalize(input);expect(input).toEqual({prescription:{expired_workout_behavior:'hide_on_expiry'}});expect(defaults).toEqual(before);});
});
