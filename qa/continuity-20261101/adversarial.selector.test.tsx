import {describe,it,expect} from 'vitest';
import {selectStudentDigitalContinuity} from '@/lib/prescriptionSchedule';
const enrollment={id:'e',student_id:'s',company_id:'c',status:'active',start_date:'2026-01-01',end_date:'2027-01-01'};
const context={enrollment,expectedStudentId:'s',expectedCompanyId:'c',today:new Date(2026,10,1,12)};
const old={id:'old',student_id:'s',company_id:'c',enrollment_id:'e',cycle_number:99,status:'completed',start_date:'2026-09-01',end_date:'2026-10-01',has_usable_workouts:true};
describe('QA independente: datas, tombstones e escopo',()=>{
 it.each([{start_date:'2026-02-30'},{end_date:'2026-02-30'},{start_date:'2026-10-02',end_date:'2026-10-01'},{start_date:''},{end_date:''}])('rejects malformed cycle dates %j',patch=>{expect(selectStudentDigitalContinuity([{...old,...patch}],context)).toBeNull();});
 it.each([{company_id:'foreign'},{student_id:'foreign'},{enrollment_id:'foreign'}])('rejects cross-scope cycle %j',patch=>{expect(selectStudentDigitalContinuity([{...old,...patch}],context)).toBeNull();});
 it('does not mutate dates or enrollment while selecting old content',()=>{const input=structuredClone([old]);const ctx=structuredClone(context);expect(selectStudentDigitalContinuity(input,ctx)?.id).toBe('old');expect(input).toEqual([old]);expect(ctx).toEqual(context);});
 it('ignores a future removal but respects it on its effective day',()=>{const clear={...old,id:'clear',cycle_number:100,start_date:'2026-11-02',end_date:'2026-12-01',prescription_cleared_at:'2026-11-01T10:00:00Z',has_usable_workouts:false};expect(selectStudentDigitalContinuity([old,clear],context)?.id).toBe('old');expect(selectStudentDigitalContinuity([old,clear],{...context,today:new Date(2026,10,2,12)})).toBeNull();});
});
