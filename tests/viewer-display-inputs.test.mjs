import test from 'node:test';
import assert from 'node:assert/strict';
import {readViewerDisplayInputs} from '../src/shared/viewer-display-inputs.js';
function fixture(mode='',scale='',colors=''){
  const inputs={'display-mode':{value:mode},'scale-mode':{value:scale},'color-mode':{value:colors}};
  return {inputs,getElementById:id=>inputs[id]};
}
test('empty or invalid restored selects recover the last valid view before reaching WebGL',()=>{
  const root=fixture('','obsolete','');
  assert.deepEqual(readViewerDisplayInputs(root,{mode:'wire',scale:'normalized',colors:'height'}),{mode:'wire',scale:'normalized',colors:'height'});
  assert.equal(root.inputs['display-mode'].value,'wire');assert.equal(root.inputs['scale-mode'].value,'normalized');
});
test('valid user choices survive recovery; invalid prior settings use documented defaults',()=>{
  const root=fixture('solid-wire','real','building');
  assert.deepEqual(readViewerDisplayInputs(root,{mode:'solid',scale:'normalized',colors:'height'}),{mode:'solid-wire',scale:'real',colors:'building'});
  assert.deepEqual(readViewerDisplayInputs(fixture(),{mode:'bad',scale:'',colors:null}),{mode:'solid',scale:'real',colors:'surface'});
});
