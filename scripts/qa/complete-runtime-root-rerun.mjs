// Root-only error visibility. Preserve all frozen queries, assertions and gates.
import {Runtime,command,privateFile} from './commercial-complete-runtime.mjs';
import {main} from './commercial-complete-runtime-acceptance.mjs';
import {summarizeTransport} from './complete-runtime-transport-diagnostics.mjs';

const originalSql=Runtime.prototype.sql;
Runtime.prototype.sql=function(input,options={}){
  const result=originalSql.call(this,input,{...options,allowError:true});
  if(!options.allowError&&(result.status!==0||result.signal||result.timedOut)){
    // Passive inspection only, while the already-owned container still exists.
    // Never retry SQL: a failed client can leave an uncertain committed result.
    let diagnostic;
    try{
      const container=this.inspect();
      const r=command(['logs','--tail','120',this.name],undefined,10000);
      const logs=r.stdout+'\n'+r.stderr;
      privateFile(this.dir,'root-client-output.private.log',result.stdout);
      privateFile(this.dir,'root-postgres-startup.private.log',logs);
      diagnostic=summarizeTransport({result,state:container.State,logs});
      privateFile(this.dir,'root-transport-summary.private.json',JSON.stringify(diagnostic));
    }catch{
      diagnostic={captureUnavailable:true,cause:'unattributed'};
    }
    throw Error(JSON.stringify({phase:options.phase||'sql',status:result.status,
      signal:result.signal,timedOut:result.timedOut,sqlstates:result.states,
      diagnostic}));
  }
  return result;
};
await main();
