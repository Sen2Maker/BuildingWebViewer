import assert from 'node:assert/strict';
import test from 'node:test';
import {comparisonRedirectUrl, redirectComparison} from '../src/compare/app.js';

// compare.html is only a compatibility entry; all actual viewing belongs to lod.html.
test('legacy comparison entry preserves compact selection, language and quality in the same directory', () => {
  const source = new URL('https://viewer.example/BuildingWebViewer/compare.html?dataset=bwv-test4000&building=367&quality=original&lang=en');
  const target = new URL(comparisonRedirectUrl(source.href));
  assert.equal(target.pathname, '/BuildingWebViewer/lod.html');
  assert.equal(target.origin, source.origin);
  assert.equal(target.search, source.search);
});

test('legacy descriptor survives redirect byte-for-byte, including encoded names and presets', () => {
  const descriptor = {schemaVersion: 1, manifest: 'https://data.example/index.json', buildingId: '楼栋 A + 2', preset: {palette: 'viridis'}};
  const source = new URL('https://viewer.example/tools/compare.html?lang=zh');
  source.hash = new URLSearchParams({compare: JSON.stringify(descriptor)}).toString();
  const target = new URL(comparisonRedirectUrl(source.href));
  assert.equal(target.hash, source.hash);
  assert.deepEqual(JSON.parse(new URLSearchParams(target.hash.slice(1)).get('compare')), descriptor);
});

test('query and fragment values cannot override the fixed redirect destination', () => {
  const source = 'https://viewer.example/tools/compare.html?next=https://other.example/&redirect=//other.example/#compare=not-a-descriptor';
  const target = new URL(comparisonRedirectUrl(source));
  assert.equal(target.href, 'https://viewer.example/tools/lod.html?next=https://other.example/&redirect=//other.example/#compare=not-a-descriptor');
});

test('offline and native comparison entries stay on their bundled origin', () => {
  for (const source of [
    'file:///home/user/viewer/compare.html?lang=en#compare=example',
    'capacitor://localhost/compare.html?dataset=bwv-test4000',
    'ionic://localhost/tools/compare.html?lang=zh',
    'https://localhost/compare.html?dataset=bwv-test4000',
  ]) {
    const original = new URL(source), target = new URL(comparisonRedirectUrl(source));
    assert.equal(target.protocol, original.protocol);
    assert.equal(target.host, original.host);
    assert.equal(target.search, original.search);
    assert.equal(target.hash, original.hash);
    assert.equal(target.pathname, original.pathname.replace(/compare\.html$/, 'lod.html'));
  }
});

test('unsupported and credential-bearing source addresses fail without navigation', () => {
  for (const href of ['javascript:alert(1)', 'data:text/html,hello', 'https://user:secret@viewer.example/compare.html', 'not-a-url']) {
    let navigations = 0;
    assert.throws(() => redirectComparison({location: {href, replace() { navigations++; }}}));
    assert.equal(navigations, 0);
  }
});

test('compatibility navigation replaces history once instead of adding another viewer step', () => {
  const replacements = [];
  const host = {location: {href: 'https://viewer.example/compare.html?dataset=bwv-test4000&building=375', replace(url) { replacements.push(url); }}};
  const target = redirectComparison(host);
  assert.deepEqual(replacements, ['https://viewer.example/lod.html?dataset=bwv-test4000&building=375']);
  assert.equal(target, replacements[0]);
});
