// Editing metadata stays separate from immutable source PLY records.
export const GS_SELECTED=1, GS_HIDDEN=2, GS_DELETED=4;
export class GaussianEdits {
  constructor(onChange=()=>{}) { this.undoStack=[];this.redoStack=[];this.onChange=onChange;this.bytes=0;this.budget=64*1024*1024; }
  attach(model) { if (!model.editFlags) model.editFlags=new Uint8Array(model.count); return model; }
  apply(models, operation) {
    const changes=[];
    for(const model of models) {
      this.attach(model);const ids=[],before=[],after=[];
      for(let i=0;i<model.count;i++) {const a=model.editFlags[i],b=operation(a,i,model);if(a!==b){ids.push(i);before.push(a);after.push(b);}}
      if(ids.length) changes.push({model,ids:Uint32Array.from(ids),before:Uint8Array.from(before),after:Uint8Array.from(after)});
    }
    if(!changes.length)return false;
    const bytes=changes.reduce((n,c)=>n+c.ids.byteLength+c.before.byteLength+c.after.byteLength,0);
    // Never silently perform an irreversible edit when history cannot hold it.
    if(bytes>this.budget)throw Error('本次编辑超过撤销内存预算，请分批选择 / Edit exceeds undo budget');
    this.redoStack=[];this.bytes=this.undoStack.reduce((n,c)=>n+c.bytes,0);
    while(this.undoStack.length&&this.bytes+bytes>this.budget)this.bytes-=this.undoStack.shift().bytes;
    const command={changes,bytes};this.write(command,'after');this.undoStack.push(command);this.bytes+=bytes;this.onChange();return true;
  }
  write(command,key){for(const c of command.changes)for(let j=0;j<c.ids.length;j++)c.model.editFlags[c.ids[j]]=c[key][j];}
  undo(){const c=this.undoStack.pop();if(!c)return;this.write(c,'before');this.redoStack.push(c);this.onChange();}
  redo(){const c=this.redoStack.pop();if(!c)return;this.write(c,'after');this.undoStack.push(c);this.onChange();}
  clear(){this.undoStack=[];this.redoStack=[];this.bytes=0;}
}
export function gsEditStats(models){const s={total:0,selected:0,hidden:0,deleted:0};for(const m of models){s.total+=m.count;for(const f of m.editFlags||[]){if(f&GS_DELETED)s.deleted++;else if(f&GS_HIDDEN)s.hidden++;else if(f&GS_SELECTED)s.selected++;}}return s;}
// Keep the source property layout and raw values: no sigmoid/log/quaternion round-trip loss.
export function gsExportPly(model,{selectedOnly=false,includeHidden=false}={}) {
  if(!model.source)throw Error('Missing original PLY records');
  const {bytes,headerEnd,stride,header}=model.source, flags=model.editFlags||new Uint8Array(model.count);
  const ids=[];for(let i=0;i<model.count;i++){const f=flags[i];if(!(f&GS_DELETED)&&(includeHidden||!(f&GS_HIDDEN))&&(!selectedOnly||(f&GS_SELECTED)))ids.push(i);}
  if(!ids.length)throw Error('没有符合条件的高斯 / No Gaussians to export');
  // Parser rejects nonempty non-vertex elements; updating vertex count is sufficient.
  const text=header.replace(/element vertex \d+/,`element vertex ${ids.length}`);
  const chunks=[new TextEncoder().encode(text)];let chunk=new Uint8Array(Math.min(ids.length,8192)*stride),used=0;
  for(const id of ids){if(used+stride>chunk.length){chunks.push(chunk);chunk=new Uint8Array(Math.min(ids.length,8192)*stride);used=0;}chunk.set(bytes.subarray(headerEnd+id*stride,headerEnd+(id+1)*stride),used);used+=stride;}
  if(used)chunks.push(chunk.subarray(0,used));return new Blob(chunks,{type:'application/octet-stream'});
}
