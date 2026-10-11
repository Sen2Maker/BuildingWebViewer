import test from 'node:test';
import assert from 'node:assert/strict';
import {gsCovariance} from '../src/gaussian/covariance.js';
import {gsFrameQuality} from '../src/gaussian/quality.js';
import {gsViewingProfile} from '../src/gaussian/preview.js';
import {gsRotationRows} from '../src/gaussian/ply.js';
import {GaussianViewer} from '../src/gaussian/renderer.js';
test('precomputed covariance matches projected rotated axes, including anisotropic splats',()=>{
 for(let k=0;k<100;k++){
  const q=[Math.cos(k),Math.sin(k*.7),.3,-.4],norm=Math.hypot(...q);q.forEach((n,i)=>q[i]=n/norm);
  const scale=[.003+k*.003,.12,.02],m=gsRotationRows(q),j=[.2,-.6,1.3],l=[.8,.2,-.1];
  const c=gsCovariance(...scale,...q),matrix=[[c[0],c[1],c[2]],[c[1],c[3],c[4]],[c[2],c[4],c[5]]];
  const direct=(a,b)=>scale.reduce((sum,s,col)=>sum+s*s*m.reduce((n,row,i)=>n+row[col]*a[i],0)*m.reduce((n,row,i)=>n+row[col]*b[i],0),0);
  const packed=(a,b)=>a.reduce((sum,v,i)=>sum+v*matrix[i].reduce((n,w,z)=>n+w*b[z],0),0);
  for(const [a,b] of [[j,j],[j,l],[l,l]])assert.ok(Math.abs(direct(a,b)-packed(a,b))<1e-10);
 }
});
test('all profiles preserve population; motion quality restores and export never uses temporary SH',()=>{
 for(const mode of ['auto','light','balanced','full','points'])for(const mobile of [true,false])assert.equal(gsViewingProfile(mode,mobile,true).limit,0);
 const base={pixelRatio:1,devicePixelRatio:2.625,interactionScale:.65,interactionDegree:1,degree:3};
 assert.deepEqual(gsFrameQuality({...base,moving:true}),{dpr:.65,degree:1});
 assert.deepEqual(gsFrameQuality({...base,moving:false}),{dpr:1,degree:3});
 assert.deepEqual(gsFrameQuality({...base,moving:true,exporting:true}),{dpr:1,degree:3});
 assert.equal(gsFrameQuality({...base,moving:true,degree:0}).degree,0);
});
test('sort upload reuses allocation and replaces order for repeated camera views',()=>{
 const uploads=[];const gl={bindTexture(){},texSubImage2D(...args){uploads.push([...args.at(-1)]);}};
 const viewer={gl,textureSize:{width:2,height:2},textures:{order:{}},orderPixels:new Uint32Array(4)};
 const buffer=viewer.orderPixels;GaussianViewer.prototype.uploadOrder.call(viewer,new Uint32Array([2,1,0]));GaussianViewer.prototype.uploadOrder.call(viewer,new Uint32Array([0,2,1]));
 assert.equal(viewer.orderPixels,buffer);assert.deepEqual(uploads,[[2,1,0,0],[0,2,1,0]]);
});
