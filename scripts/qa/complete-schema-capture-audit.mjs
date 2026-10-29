import {createHash} from 'node:crypto';

export function verifyCaptureManifest(manifest,files){
  if(manifest?.project!=='zshrcgbyhzxpnlccssyz'||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Invalid catalog capture manifest');
  const names=manifest.files.map(f=>f.name);
  if(new Set(names).size!==names.length)throw Error('Duplicate manifest capture');
  for(const item of manifest.files){
    if(!/^commercial-complete-[a-z-]+\.private\.json$/.test(item.name)||!Number.isSafeInteger(item.bytes)||item.bytes<=0||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('Invalid capture identity');
    const bytes=files.get(item.name);
    if(!Buffer.isBuffer(bytes)||bytes.length!==item.bytes||createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('Catalog capture changed or missing');
  }
  if(files.size!==names.length)throw Error('Unexpected capture outside manifest');
  return {verified:true,files:names.length};
}

// Offline capture consistency only. Runtime catalog equality is a separate gate.
export function auditCompleteCapture(c,privileges,sequences,roleDefaults){
  const failures=[];
  const check=(name,ok)=>{if(!ok)failures.push(name);};
  check('canonical project',c?.project==='zshrcgbyhzxpnlccssyz');
  check('timestamp',Number.isFinite(Date.parse(c?.capturedAt)));
  check('no omitted functions',Array.isArray(c?.omittedFunctions)&&c.omittedFunctions.length===0);
  const tables=c?.tables||[],functions=c?.functions||[];
  const key=x=>`${x.schema}.${x.name}`;
  check('nonempty tables/functions',tables.length>0&&functions.length>0);
  check('unique tables',new Set(tables.map(key)).size===tables.length);
  check('unique routine signatures',new Set(functions.map(f=>f.signature)).size===functions.length);
  const fingerprints=privileges?.functionFingerprints||[];
  check('complete routine fingerprints',fingerprints.length===functions.length);
  for(const f of functions){
    const observed=fingerprints.find(x=>x.signature===f.signature);
    check(`routine hash ${f.signature}`,observed?.md5===createHash('md5').update(f.definition||'').digest('hex'));
    check(`routine ACL ${f.signature}`,Array.isArray(f.acl)&&!!f.owner);
  }
  for(const p of c?.policies||[]){
    check(`policy mode ${p.name}`,['PERMISSIVE','RESTRICTIVE'].includes(p.permissive));
    check(`policy relation ${p.name}`,tables.some(t=>t.schema===p.schema&&t.name===p.table));
  }
  for(const a of privileges?.columnAcls||[]){
    check(`column ACL relation ${a.table}.${a.column}`,tables.some(t=>t.schema===a.schema&&t.name===a.table&&t.columns.some(col=>col.name===a.column)));
    check(`column ACL privileges ${a.table}.${a.column}`,a.acl?.every(x=>['SELECT','INSERT','UPDATE','REFERENCES'].includes(x.privilege))===true);
  }
  check('complete precise sequence contracts',Array.isArray(sequences)&&sequences.length===(c?.sequences||[]).length);
  for(const s of sequences||[]){
    for(const field of ['start','increment','min','max','cache']){
      check(`lossless sequence ${s.name}.${field}`,typeof s[field]==='string'&&/^-?\d+$/.test(s[field]));
    }
    check(`sequence ACL ${s.name}`,Array.isArray(s.acl));
  }
  const roles=roleDefaults?.roles||[],memberships=roleDefaults?.roleMemberships||[];
  check('complete role attributes',roles.length===(c?.roles||[]).length&&roles.length>0);
  for(const r of roles)check(`role attributes ${r.name}`,['superuser','inherit','bypassrls','createDb','createRole','replication','login'].every(k=>typeof r[k]==='boolean'));
  check('complete role memberships',memberships.length===(c?.roleMemberships||[]).length);
  check('membership admin options',memberships.every(m=>typeof m.admin==='boolean'&&typeof m.set==='boolean'&&typeof m.inherit==='boolean'));
  check('default privilege catalog',Array.isArray(roleDefaults?.defaultPrivileges));
  return {consistent:failures.length===0,failures,counts:{tables:tables.length,functions:functions.length,
    policies:c?.policies?.length||0,columnAcls:privileges?.columnAcls?.length||0,sequences:sequences?.length||0,
    roles:roles.length,memberships:memberships.length,defaultPrivileges:roleDefaults?.defaultPrivileges?.length||0},
  scope:'offline schema capture integrity; not installed catalog or behavior certification'};
}
