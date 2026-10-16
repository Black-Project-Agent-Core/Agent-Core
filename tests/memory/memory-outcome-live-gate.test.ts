import {describe,it,expect} from 'vitest';
import {runLiveOutcome,validateLivePair,parseLiveArguments} from '../../scripts/memory/outcome/memory-outcome-live.mjs';
describe('live outcome authorization gate',()=>{
 it('CLI requires bounded inputs and rejects unrecognized flags',()=>{
  expect(()=>parseLiveArguments([])).toThrow(/MISSING_REQUIRED_OPTION/);expect(()=>parseLiveArguments(['--continue','old'])).toThrow(/UNKNOWN_OPTION/);
  expect(parseLiveArguments(['--suite','suite.json','--approval-ref','user-message:exact','--output','new'])).toMatchObject({approvalRef:'user-message:exact'});
 });
 it('no authorization means zero requests',async()=>{
  let calls=0;
  await expect(runLiveOutcome({suitePath:'synthetic',approvalRef:'invented',output:'unused',request:()=>{calls++;}})).rejects.toThrow(/LIVE_AUTHORIZATION_UNVERIFIED/);
  expect(calls).toBe(0);
 });
 it('model drift invalidates the pair',()=>{
  expect(validateLivePair({provider:'p',model:'a',settingsDigest:'same',toolsDigest:'same'},{provider:'p',model:'b',settingsDigest:'same',toolsDigest:'same'})).toEqual(['MODEL_DRIFT']);
  expect(validateLivePair({provider:'p',model:'a',settingsDigest:'same',toolsDigest:'same'},{provider:'p',model:'a',settingsDigest:'same',toolsDigest:'same'})).toEqual([]);
 });
 it('verified-looking local strings cannot enable provider execution',async()=>{
  await expect(runLiveOutcome({suitePath:'synthetic',approvalRef:'user:yes',output:'unused',approval:{provider:'p',currency:'USD',limit:1}})).rejects.toThrow(/LIVE_AUTHORIZATION_UNVERIFIED/);
 });
});
