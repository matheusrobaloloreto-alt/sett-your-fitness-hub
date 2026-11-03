import {describe,it,expect} from 'vitest';
import {selectStudentPrescriptionEnrollment} from './studentEnrollmentContinuity';
import {selectStudentDigitalContinuity,selectPrescriptionEnrollment} from './prescriptionSchedule';
const e={id:'e',student_id:'s',company_id:'c',status:'awaiting_renewal',start_date:'2026-03-30',end_date:'2026-09-13'};
const scope={today:'2026-11-03',expectedStudentId:'s',expectedCompanyId:'c'};
describe('student-only expired enrollment continuity',()=>{
 it('recovers the last renewable enrollment without changing commercial selection',()=>{expect(selectStudentPrescriptionEnrollment([e],scope)?.id).toBe('e');expect(selectPrescriptionEnrollment([e],scope)).toBeNull()});
 it('prefers current enrollment',()=>{expect(selectStudentPrescriptionEnrollment([e,{...e,id:'new',status:'active',start_date:'2026-10-01',end_date:'2027-01-01'}],scope)?.id).toBe('new')});
 it.each(['inactive','cancelled','completed'])('does not revive %s enrollment',status=>expect(selectStudentPrescriptionEnrollment([{...e,status}],scope)).toBeNull());
 it('rejects a foreign student and tenant',()=>{expect(selectStudentPrescriptionEnrollment([{...e,student_id:'other'}],scope)).toBeNull();expect(selectStudentPrescriptionEnrollment([{...e,company_id:'other'}],scope)).toBeNull()});
 it('does not cross a newer cancelled enrollment',()=>expect(selectStudentPrescriptionEnrollment([e,{...e,id:'cancelled',status:'cancelled',start_date:'2026-10-01',end_date:'2026-11-01'}],scope)).toBeNull());
 it('does not bypass future start',()=>expect(selectStudentPrescriptionEnrollment([{...e,start_date:'2026-12-01',end_date:'2027-01-01'}],scope)).toBeNull());
 it('allows digital selection after term only for the student continuation reader',()=>{
 const c={id:'cycle',enrollment_id:'e',student_id:'s',company_id:'c',cycle_number:5,start_date:'2026-09-21',end_date:'2026-11-01',status:'completed',has_usable_workouts:true};
 const args={enrollment:e,expectedStudentId:'s',expectedCompanyId:'c',today:new Date(2026,10,3)};
 expect(selectStudentDigitalContinuity([c],args)).toBeNull();
 expect(selectStudentDigitalContinuity([c],{...args,allowExpiredEnrollment:true})?.id).toBe('cycle');
 expect(selectStudentDigitalContinuity([{...c,prescription_cleared_at:'2026-11-02'}],{...args,allowExpiredEnrollment:true})).toBeNull();
 });
});

describe('barriers precede current enrollment selection',()=>{
 const current={...e,id:'current',status:'active',start_date:'2026-01-01',end_date:'2026-12-31'};
 it.each(['cancelled','inactive','completed'])('blocks a newer %s even while the old enrollment is current',status=>{
   expect(selectStudentPrescriptionEnrollment([current,{...e,id:'blocker',status,start_date:'2026-10-01',end_date:'2026-11-01'}],scope)).toBeNull();
 });
 it.each([
   {start_date:null,end_date:null,created_at:'2026-10-01'},
   {start_date:'invalid',end_date:'2026-11-01',created_at:'2026-10-01'},
   {start_date:'2026-10-01',end_date:'invalid'},
   {start_date:null,end_date:null},
 ])('does not discard a malformed/unknown-order blocker: %j',dates=>{
   const blocker={...e,id:'blocker',status:'cancelled',...dates};
   expect(selectStudentPrescriptionEnrollment([current,blocker],scope)).toBeNull();
   expect(selectStudentPrescriptionEnrollment([e,blocker],scope)).toBeNull();
 });
 it('rejects equal-start ambiguity before current return',()=>{
   expect(selectStudentPrescriptionEnrollment([current,{...current,id:'duplicate'}],scope)).toBeNull();
 });
 it('does not let foreign malformed blockers affect the current student',()=>{
   expect(selectStudentPrescriptionEnrollment([current,{...e,id:'foreign',status:'cancelled',company_id:'other',start_date:null,end_date:null}],scope)?.id).toBe('current');
 });
 it('rejects invalid scope and business date',()=>{
   expect(selectStudentPrescriptionEnrollment([current],{...scope,expectedCompanyId:''})).toBeNull();
   expect(selectStudentPrescriptionEnrollment([current],{...scope,today:'invalid'})).toBeNull();
 });
 it('keeps a valid newer enrollment over a dated old cancellation',()=>{
   expect(selectStudentPrescriptionEnrollment([{...e,status:'cancelled',start_date:'2025-01-01',end_date:'2025-12-31'},current],scope)?.id).toBe('current');
 });
});

describe('historical records are not new revocation events',()=>{
 const active={...e,id:'active-july',status:'active',start_date:'2026-07-14',end_date:'2026-12-30'};
 it('keeps the unique operational enrollment beside a completed same-start duplicate',()=>{
  expect(selectStudentPrescriptionEnrollment([{...active,id:'completed-duplicate',status:'completed',end_date:'2026-11-09'},active],scope)?.id).toBe(active.id);
 });
 it('ignores a malformed term only when all its dates prove it predates the selected contract',()=>{
  const old={...e,id:'old-malformed',start_date:'2026-02-10',training_start_date:'2026-04-06',end_date:'2026-03-24'};
  expect(selectStudentPrescriptionEnrollment([old,active],scope)?.id).toBe(active.id);
 });
 it('does not let an explicitly future malformed contract revoke today\'s enrollment',()=>{
  expect(selectStudentPrescriptionEnrollment([active,{...e,id:'future',status:'inactive',start_date:'2026-12-01',end_date:'invalid'}],scope)?.id).toBe(active.id);
 });
 it.each(['cancelled','inactive'])('keeps same-start %s as a barrier, unlike completed history',status=>{
  expect(selectStudentPrescriptionEnrollment([active,{...active,id:'revoked',status}],scope)).toBeNull();
 });
 it('does not treat a completed row with a longer competing term as a repaired duplicate',()=>{
  expect(selectStudentPrescriptionEnrollment([active,{...active,id:'unclear-history',status:'completed',end_date:'2027-01-01'}],scope)).toBeNull();
 });
 it('keeps two operational same-start contracts ambiguous',()=>{
  expect(selectStudentPrescriptionEnrollment([active,{...active,id:'second',status:'awaiting_renewal'}],scope)).toBeNull();
 });
});
