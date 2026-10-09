import test from 'node:test';
import assert from 'node:assert/strict';
import {displayColorOverride} from '../src/shared/cloud-colors.js';
import {drawSceneGuides} from '../src/shared/scene-guides.js';
test('per-file overrides validate RGB without mutating source arrays',()=>{
 assert.deepEqual(displayColorOverride('#FF0000'),[1,0,0]);assert.deepEqual(displayColorOverride('#0000ff'),[0,0,1]);
 for(const value of [null,'red','#fff','#12345z',''])assert.equal(displayColorOverride(value),null);
});
test('each screenshot overlay obeys visibility and all overrides suppress scalar legend',()=>{
 const texts=[];const ctx={save(){},restore(){},scale(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},fillRect(){},fillText(text){texts.push(text);},createLinearGradient(){return{addColorStop(){}};}};
 const viewer={options:{axes:false,ruler:false,legend:false,pointCountLabel:false,showPoints:true,pointRatio:30,palette:'current'},basis:()=>[[1,0,0],[0,1,0],[0,0,1]],baseHeight:10,camera:{zoom:1},pointCount:100,activeClouds:[{count:100,item:{}}],colorRange:{min:0,max:10},effectiveColorMode:'height'};
 drawSceneGuides(ctx,viewer,400,300);assert.deepEqual(texts,[]);
 viewer.options.pointCountLabel=true;drawSceneGuides(ctx,viewer,400,300);assert.equal(texts.length,1);assert.match(texts[0],/30/);
 texts.length=0;viewer.options.pointCountLabel=false;viewer.options.legend=true;drawSceneGuides(ctx,viewer,400,300);assert.equal(texts.length,1);
 texts.length=0;viewer.activeClouds[0].item.displayColor='#ff0000';drawSceneGuides(ctx,viewer,400,300);assert.deepEqual(texts,[]);
});
