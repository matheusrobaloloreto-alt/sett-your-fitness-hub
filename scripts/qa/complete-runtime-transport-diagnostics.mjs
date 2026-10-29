// Pure summaries only. Raw connection/startup output remains in private files.
export function summarizeTransport({result={},state={},logs=''}){
 const text=String(result.stdout||'')+'\n'+String(logs||'');
 return {
  client:{status:result.status??null,signal:result.signal??null,
   timedOut:result.timedOut===true,sqlstates:result.states||[],
   stdoutBytes:Buffer.byteLength(String(result.stdout||''))},
  server:{running:state.Running===true,oomKilled:state.OOMKilled===true,
   exitCode:state.ExitCode??null,
   readyMessage:/database system is ready to accept connections/i.test(String(logs||''))},
  connectionClosedMessage:/server closed the connection unexpectedly|connection (?:to server .* )?was lost|connection refused|no such file or directory/i.test(text),
  startupLogBytes:Buffer.byteLength(String(logs||'')),
  cause:'unattributed',
 };
}
