import { gsCross3, gsDot3, gsUnit3 } from '../shared/camera-geometry.js';

const DRAW_EPS=1e-8;
const drawSub=(a,b)=>a.map((v,i)=>v-b[i]);
const drawCross2=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const drawFail=message=>{throw Error(message);};
export function drawFrame(normal, origin=[0,0,0], preferred=null) {
  const n=gsUnit3(normal), axis=preferred|| (Math.abs(n[2])<.9?[0,0,1]:[1,0,0]);
  const u=gsUnit3(axis.map((v,i)=>v-n[i]*gsDot3(axis,n))),v=gsCross3(n,u);
  return {origin:[...origin],u,v,n};
}
export function drawUnproject(spec,x,y,origin=[0,0,0]) {
  const [r,u,b]=spec.basis, sx=x-spec.width/2,sy=spec.height/2-y;
  return {origin:spec.eye.map((v,i)=>v+origin[i]+(spec.perspective?0:(r[i]*sx+u[i]*sy)*spec.worldHeight/spec.height)),
    direction:spec.perspective?b.map((v,i)=>-v+r[i]*sx/spec.fx+u[i]*sy/spec.fy):b.map(v=>-v)};
}
export function drawRayPlane(ray,frame,snap=0) {
  const den=gsDot3(ray.direction,frame.n);if(Math.abs(den)<1e-5)return null;
  const depth=gsDot3(drawSub(frame.origin,ray.origin),frame.n)/den;if(depth<0)return null;
  let p=ray.origin.map((v,i)=>v+ray.direction[i]*depth);
  if(snap>0){const d=drawSub(p,frame.origin),a=Math.round(gsDot3(d,frame.u)/snap)*snap,b=Math.round(gsDot3(d,frame.v)/snap)*snap;p=frame.origin.map((v,i)=>v+a*frame.u[i]+b*frame.v[i]);}
  return p.every(Number.isFinite)?p:null;
}
/** Simple, planar polygons only. Concave contours are triangulated by ear clipping. */
export function drawPolygon(points,normal) {
  const frame=drawFrame(normal,points[0]), projected=points.map(p=>{const d=drawSub(p,frame.origin);if(Math.abs(gsDot3(d,frame.n))>1e-6*Math.max(1,Math.hypot(...d)))drawFail('轮廓必须共面 / Contour must be planar');return [gsDot3(d,frame.u),gsDot3(d,frame.v)];});
  const n=points.length;
  const on=(a,b,p)=>Math.abs(drawCross2(a,b,p))<DRAW_EPS&&p[0]>=Math.min(a[0],b[0])-DRAW_EPS&&p[0]<=Math.max(a[0],b[0])+DRAW_EPS&&p[1]>=Math.min(a[1],b[1])-DRAW_EPS&&p[1]<=Math.max(a[1],b[1])+DRAW_EPS;
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(j!==i+1&&!(i===0&&j===n-1)){
    const a=projected[i],b=projected[(i+1)%n],c=projected[j],d=projected[(j+1)%n];
    if(drawCross2(a,b,c)*drawCross2(a,b,d)<0&&drawCross2(c,d,a)*drawCross2(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))drawFail('轮廓自交或重叠，请调整顶点 / Self-intersecting contour');
  }
  let area=0;for(let i=0;i<n;i++){const a=projected[i],b=projected[(i+1)%n];area+=a[0]*b[1]-b[0]*a[1];}
  if(Math.abs(area)<DRAW_EPS)drawFail('轮廓面积为零 / Contour has zero area');
  const ids=points.map((_,i)=>i);if(area<0)ids.reverse();const triangles=[];
  while(ids.length>3){let found=false;for(let i=0;i<ids.length;i++){
    const a=ids[(i+ids.length-1)%ids.length],b=ids[i],c=ids[(i+1)%ids.length],turn=drawCross2(projected[a],projected[b],projected[c]);
    if(Math.abs(turn)<DRAW_EPS){ids.splice(i,1);found=true;break;}if(turn<0)continue;
    if(ids.some(k=>k!==a&&k!==b&&k!==c&&drawCross2(projected[a],projected[b],projected[k])>=-DRAW_EPS&&drawCross2(projected[b],projected[c],projected[k])>=-DRAW_EPS&&drawCross2(projected[c],projected[a],projected[k])>=-DRAW_EPS))continue;
    triangles.push([a,b,c]);ids.splice(i,1);found=true;break;
  }if(!found)drawFail('无法三角化轮廓 / Cannot triangulate contour');}
  if(ids.length===3)triangles.push([...ids]);return {frame,triangles};
}
export function drawCheck(shape) {
  if(!['stroke','polygon','extrusion'].includes(shape.type))drawFail('未知绘制类型 / Unknown drawing');
  const min=shape.type==='stroke'?2:3,max=shape.type==='stroke'?4000:256;
  if(!Array.isArray(shape.points)||shape.points.length<min||shape.points.length>max||shape.points.some(p=>!Array.isArray(p)||p.length!==3||!p.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e9)))drawFail(`顶点数量应为 ${min}–${max}，XYZ 必须有效 / Invalid vertices`);
  for(let i=1;i<shape.points.length;i++)if(Math.hypot(...drawSub(shape.points[i],shape.points[i-1]))<DRAW_EPS)drawFail('连续顶点不能重合 / Duplicate adjacent vertices');
  if(shape.type!=='stroke'){
    if(!Array.isArray(shape.normal)||shape.normal.length!==3||!shape.normal.every(Number.isFinite))drawFail('平面法向无效 / Invalid plane normal');
    drawPolygon(shape.points,shape.normal);
    if(shape.type==='extrusion'&&(!(shape.height>0)||!Number.isFinite(shape.height)||!['surface','volume'].includes(shape.fill)))drawFail('拉伸高度须大于零 / Extrusion height must be positive');
  }
  return shape;
}
export function drawSurfaces(part) {
  const s=part.shape,pts=s.points.map(p=>p.map((v,i)=>v+[part.place.x,part.place.y,part.place.z][i])),out=[];
  if(s.type==='stroke'){for(let i=1;i<pts.length;i++)out.push({kind:'line',a:pts[i-1],b:pts[i],span:Math.hypot(...drawSub(pts[i],pts[i-1]))});return out;}
  const {frame,triangles}=drawPolygon(pts,s.normal),normal=frame.n,h=s.type==='extrusion'?s.height:0;
  const shift=p=>p.map((v,i)=>v+normal[i]*h);
  for(const [i,j,k]of triangles){const a=pts[i],b=pts[j],c=pts[k],span=Math.max(Math.hypot(...drawSub(a,b)),Math.hypot(...drawSub(a,c)),Math.hypot(...drawSub(b,c)));
    if(h&&s.fill==='volume'){out.push({kind:'prism',a,b,c,span,normal,height:h});continue;}
    out.push({kind:'triangle',a,b,c,span,normal:h?normal.map(v=>-v):normal,surface:5});
    if(h)out.push({kind:'triangle',a:shift(a),b:shift(b),c:shift(c),span,normal,surface:5});
  }
  if(h&&s.fill!=='volume')for(let i=0;i<pts.length;i++){
    const a=pts[i],b=pts[(i+1)%pts.length],u=drawSub(b,a),v=normal.map(n=>n*h);let n=gsUnit3(gsCross3(u,normal));
    // Ear clipping winding can differ from the input contour.
    const signed=pts.reduce((sum,p,j)=>sum+gsDot3(gsCross3(drawSub(p,frame.origin),drawSub(pts[(j+1)%pts.length],frame.origin)),normal),0);if(signed<0)n=n.map(v=>-v);
    out.push({kind:'quad',origin:a,u,v,normal:n,surface:5});
  }
  return out;
}
export function drawWire(part) {
  const {shape:s,place}=part,vertices=s.points.map(p=>p.map((v,i)=>v+[place.x,place.y,place.z][i])),edges=[];
  for(let i=1;i<vertices.length;i++)edges.push([i-1,i]);if(s.type!=='stroke')edges.push([vertices.length-1,0]);
  if(s.type==='extrusion'){const n=gsUnit3(s.normal),size=vertices.length;vertices.push(...vertices.map(p=>p.map((v,i)=>v+n[i]*s.height)));for(let i=0;i<size;i++){edges.push([i,i+size],[i+size,(i+1)%size+size]);}}
  return {vertices,edges};
}
