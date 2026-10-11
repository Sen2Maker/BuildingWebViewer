import { gsProjectPosition } from '../shared/camera-geometry.js';
export function editInsidePolygon(x,y,path){let inside=false;for(let i=0,j=path.length-1;i<path.length;j=i++){const[a,b]=path[i],[c,d]=path[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;}return inside;}
/** Select full-resolution data, not preview indices. Explicitly projects through all depth layers. */
export async function editSelectProjected(entities,spec,origin,shape,{signal,onProgress=()=>{}}={}){
 const result=new Map();let processed=0,total=entities.reduce((s,e)=>s+e.cloud.count,0);
 for(const e of entities){const mask=new Uint8Array(e.cloud.count),p=e.cloud.positions;
  for(let start=0;start<e.cloud.count;start+=12000){if(signal?.aborted)throw new DOMException('Cancelled','AbortError');const end=Math.min(e.cloud.count,start+12000);
   for(let i=start;i<end;i++){if(e.deleted?.[i])continue;const z=p[i*3+2];if(shape.zMin!==null&&z<shape.zMin||shape.zMax!==null&&z>shape.zMax)continue;
    const pixel=gsProjectPosition([p[i*3]-origin[0],p[i*3+1]-origin[1],z-origin[2]],spec);if(!pixel||pixel.depth<=spec.near||pixel.x<0||pixel.y<0||pixel.x>spec.width||pixel.y>spec.height)continue;
    if(shape.type==='box'?pixel.x>=shape.x0&&pixel.x<=shape.x1&&pixel.y>=shape.y0&&pixel.y<=shape.y1:editInsidePolygon(pixel.x,pixel.y,shape.path))mask[i]=1;
   }processed+=end-start;onProgress(processed,total);await new Promise(r=>setTimeout(r,0));
  }result.set(e.id,mask);
 }return result;
}
