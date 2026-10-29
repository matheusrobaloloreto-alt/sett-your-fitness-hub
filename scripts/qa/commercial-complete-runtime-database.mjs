import {readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {output,qi,sha,aclSQL} from './commercial-complete-runtime.mjs';

export function restoreDatabaseContract(rt,roles){
 const filename=path.join(output,'commercial-complete-database.private.json');if((statSync(filename).mode&0o777)!==0o600)throw Error('Database capture privacy mismatch');
 const bytes=readFileSync(filename),d=JSON.parse(bytes);
 if(d.name!=='postgres'||!d.owner||!Array.isArray(d.acl))throw Error('Actual database contract missing');
 rt.sql(aclSQL('database',qi(d.name),d.owner,d.acl,roles),{phase:'actual-database-owner-acl'});
 const actual=JSON.parse(rt.value(`select jsonb_build_object('name',datname,'owner',pg_get_userbyid(datdba),'encoding',pg_encoding_to_char(encoding),'collation',datcollate,'ctype',datctype,'acl',(select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type,'grantable',a.is_grantable)) from aclexplode(coalesce(datacl,acldefault('d',datdba))) a)) from pg_database where datname=current_database()`));
 for(const k of ['name','owner','encoding','collation','ctype'])if(actual[k]!==d[k])throw Error(`Actual database property mismatch: ${k}`);
 const aclSort=rows=>rows.map(x=>`${x.grantee}|${x.privilege}|${x.grantable}`).sort();if(JSON.stringify(aclSort(actual.acl))!==JSON.stringify(aclSort(d.acl)))throw Error('Actual database ACL mismatch');
 const canCreate=rt.value("select has_database_privilege('postgres',current_database(),'CREATE')");if(canCreate!=='t')throw Error('Captured postgres database CREATE mismatch');
 return {hash:sha(bytes),matched:true,owner:d.owner,encoding:d.encoding,collation:d.collation,ctype:d.ctype,postgresCreate:true};
}
