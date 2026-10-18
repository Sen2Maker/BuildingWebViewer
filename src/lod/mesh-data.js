/** Shared reference boxes keep OBJ variants and point overlays aligned across panes. */
export function meshReferenceModels(panes,clouds){
 const boxes=new Map();
 function add(id,bounds){if(!bounds||bounds.length!==2||bounds.some(p=>p.length!==3||!Array.from(p).every(Number.isFinite)))return;
   id=String(id);if(!boxes.has(id))boxes.set(id,[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]]);const b=boxes.get(id);
   for(let a=0;a<3;a++){b[0][a]=Math.min(b[0][a],bounds[0][a]);b[1][a]=Math.max(b[1][a],bounds[1][a]);}}
 for(const pane of panes)for(const model of pane)add(model.id,model.bounds);
 for(const item of clouds)add(item.id,item.cloud.bounds);
 return [...boxes].sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([id,bounds])=>({id,bounds,vertices:bounds,faces:[]}));
}
