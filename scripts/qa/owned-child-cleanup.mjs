/** Stop only the exact ChildProcess handles created by this preview. */
export async function stopOwnedChildren(children, timeoutMs = 1500) {
 return Promise.all(children.map(async child => {
  if (!child.pid || child.exitCode !== null || child.signalCode != null) return {pid:child.pid,stopped:true};
  let timer;
  const exited = new Promise(resolve => {
   child.once('exit', () => resolve(true));
   child.once('error', () => resolve(child.exitCode !== null || child.signalCode != null));
  });
  const wait = async () => {
   const result=await Promise.race([exited,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);})]);
   clearTimeout(timer);return result;
  };
  child.kill('SIGTERM');
  if(await wait())return {pid:child.pid,stopped:true};
  child.kill('SIGKILL');
  return {pid:child.pid,stopped:await wait(),escalated:true};
 }));
}
