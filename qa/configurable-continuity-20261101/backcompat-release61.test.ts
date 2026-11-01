import {describe,it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
// Load the exact released contract, not the concurrently edited worktree.
const releasedSource=execFileSync('git',['show','61ab2c8:supabase/functions/_shared/company-product-settings.ts'],{encoding:'utf8'});
const js=ts.transpileModule(releasedSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exportsObject:Record<string,any>={};
vm.runInNewContext(js,{exports:exportsObject,Intl,Date,JSON,console},{timeout:1000});
const old=exportsObject as {normalizeCompanyProductSettings:(value:unknown)=>any;parseSettingsRecord:(value:unknown)=>any;readCompanyProductSettings:(client:any,id:string)=>Promise<any>};
describe('QA deployment compatibility: exact 61ab2c8 rejects the new persisted key',()=>{
 it('still reads a legacy settings row without the new property',()=>{expect(old.parseSettingsRecord({version:1,settings:{prescription:{default_cadence:'2020'}}}).settings.prescription.default_cadence).toBe('2020');});
 it.each(['keep_until_replaced','hide_on_expiry'])('old parser rejects persisted %s even when its caller only needs brand/business',async mode=>{
  const settings={prescription:{expired_workout_behavior:mode}};
  expect(()=>old.normalizeCompanyProductSettings(settings)).toThrow(/prescription.expired_workout_behavior/);
  expect(()=>old.parseSettingsRecord({settings,version:2})).toThrow(/prescription.expired_workout_behavior/);
  const client={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{settings,version:2},error:null})})})})};
  await expect(old.readCompanyProductSettings(client,'company-a')).rejects.toThrow(/prescription.expired_workout_behavior/);
 });
 it('the incompatibility also applies to old browser readers sharing this contract',()=>{
  const payload=old.normalizeCompanyProductSettings({});payload.prescription.expired_workout_behavior='keep_until_replaced';
  expect(()=>old.parseSettingsRecord({settings:payload,version:1})).toThrow(/prescription.expired_workout_behavior/);
 });
});

describe('QA dedicated-column storage contract remains readable by released 61ab2c8',()=>{
 it.each(['keep_until_replaced','hide_on_expiry'])('old parser accepts REST settings/column envelope with %s',mode=>{
  const settings=old.normalizeCompanyProductSettings({prescription:{default_cadence:'3010'}});
  const before=JSON.stringify(settings);const row={settings,version:8,expired_workout_behavior:mode};
  const parsed=old.parseSettingsRecord(row);expect(parsed.version).toBe(8);expect(parsed.settings.prescription.default_cadence).toBe('3010');expect(parsed.settings.prescription).not.toHaveProperty('expired_workout_behavior');expect(JSON.stringify(settings)).toBe(before);
 });
});
