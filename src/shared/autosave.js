/** Dirty events never serialize data. Flush on a five-minute deadline or lifecycle boundary. */
export function createAutosave({save, onDirty=()=>{}, delay=300000, setTimer=setTimeout, clearTimer=clearTimeout}) {
  let timer=null, suspended=false, dirty=false, generation=0;
  const cancel=()=>{if(timer!==null)clearTimer(timer);timer=null;};
  const arm=()=>{if(suspended||!dirty||timer!==null)return;timer=setTimer(()=>{timer=null;flush().catch(()=>arm());},delay);};
  const flush=()=>{cancel();const savingGeneration=generation;return Promise.resolve().then(save).then(result=>{if(generation===savingGeneration)dirty=false;if(dirty){onDirty();arm();}return result;},error=>{dirty=true;arm();throw error;});};
  const schedule=()=>{dirty=true;generation++;if(timer!==null)return;onDirty();arm();};
  return {schedule,flush,pause(){suspended=true;return flush();},resume(){suspended=false;arm();},dispose(){cancel();suspended=true;}};
}
