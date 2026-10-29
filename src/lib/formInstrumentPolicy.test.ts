import {describe,expect,it} from 'vitest';
import {intercycleScheduleDate,canIssueManualIntercycle} from './formInstrumentPolicy';
describe('form operational policy',()=>{
  it('uses company day for scheduling but allows manual links on an already started eligible cycle',()=>{
    expect(intercycleScheduleDate('2026-10-01',15)).toBe('2026-10-15');
    expect(canIssueManualIntercycle('2026-10-01','2026-10-02',true)).toBe(true);
    expect(canIssueManualIntercycle('2026-10-03','2026-10-02',true)).toBe(false);
    expect(canIssueManualIntercycle('2026-10-01','2026-10-02',false)).toBe(false);
  });
});
