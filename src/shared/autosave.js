/** Dirty events never serialize data. Flush on a five-minute deadline or lifecycle boundary. */
export function createAutosave({save, onDirty=()=>{}, delay=300000, setTimer=setTimeout, clearTimer=clearTimeout}) {
  let timer=null, suspended=false;
  const cancel=()=>{if(timer!==null)clearTimer(timer);timer=null;};
  const flush=()=>{cancel();return Promise.resolve().then(save).then(result=>{if(timer!==null)onDirty();return result;});};
  const schedule=()=>{if(suspended||timer!==null)return;onDirty();timer=setTimer(()=>{timer=null;flush().catch(()=>schedule());},delay);};
  return {schedule,flush,pause(){suspended=true;return flush();},resume(){suspended=false;},dispose:cancel};
}
