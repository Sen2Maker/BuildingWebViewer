import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { gsParseCameras, gsParseGaussianPly, gsRotationRows, gsShadeRGB, gsSigmoid, gsTrainingAngles } from '../src/gaussian/ply.js';
import { gsSortedOrder } from '../src/gaussian/renderer.js';

function gsSyntheticPly() {
  const names = ['x','y','z','nx','ny','nz','f_dc_0','f_dc_1','f_dc_2'];
  for (let index = 0; index < 45; index += 1) names.push(`f_rest_${index}`);
  names.push('opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3');
  const header = `ply\nformat binary_little_endian 1.0\nelement vertex 2\n${names.map(name => `property float ${name}`).join('\n')}\nend_header\n`;
  const stride = names.length;
  const body = new Float32Array(2 * stride);
  const at = (vertex, name) => vertex * stride + names.indexOf(name);
  body[at(0, 'x')] = 1; body[at(0, 'y')] = 2; body[at(0, 'z')] = 3;
  body[at(0, 'opacity')] = 0; body[at(0, 'scale_0')] = 0; body[at(0, 'scale_1')] = Math.log(2); body[at(0, 'scale_2')] = Math.log(3);
  body[at(0, 'rot_0')] = 1; body[at(0, 'f_dc_0')] = 1; body[at(0, 'f_rest_0')] = 1.5; body[at(0, 'f_rest_15')] = -2;
  body[at(1, 'x')] = -4; body[at(1, 'opacity')] = 20; body[at(1, 'rot_0')] = 0;
  const bytes = new Uint8Array(header.length + body.byteLength);
  bytes.set(new TextEncoder().encode(header), 0);
  bytes.set(new Uint8Array(body.buffer), header.length);
  return bytes.buffer;
}

test('sigmoid, degree-0 color and Inria quaternion match the 3DGS conventions', () => {
  assert.equal(gsSigmoid(0), 0.5);
  assert.ok(Math.abs(gsSigmoid(20) - 1) < 1e-8);
  assert.deepEqual(gsShadeRGB([0, 0, 0], null, [0, 0, 1], 0), [0.5, 0.5, 0.5]);
  const shaded = gsShadeRGB([1, 0, 0], null, [1, 0, 0], 0);
  assert.ok(Math.abs(shaded[0] - (0.5 + 0.28209479177387814)) < 1e-6);
  const rest = new Array(45).fill(0);
  rest[5] = 0.1;
  const zonal = gsShadeRGB([0, 0, 0], rest, [0, 0, 1], 2);
  assert.ok(Math.abs(zonal[0] - (0.5 + 0.31539156525252005 * 2 * 0.1)) < 1e-6);
  assert.ok(Math.abs(zonal[1] - 0.5) < 1e-6);
  const turn = Math.SQRT1_2;
  const rows = gsRotationRows([turn, 0, 0, turn]);
  assert.ok(Math.abs(rows[0][0]) < 1e-6 && Math.abs(rows[0][1] + 1) < 1e-6 && Math.abs(rows[1][0] - 1) < 1e-6 && Math.abs(rows[2][2] - 1) < 1e-6);
});

test('binary gaussian PLY keeps opacity, scale, DC color and f_rest layout', async () => {
  const model = await gsParseGaussianPly(gsSyntheticPly(), {includeRest: true});
  assert.equal(model.count, 2);
  assert.equal(model.sourceCount, 2);
  assert.deepEqual(Array.from(model.centers.subarray(0, 3)), [1, 2, 3]);
  assert.equal(model.opacity[0], 0.5);
  assert.ok(model.opacity[1] > 0.999);
  assert.equal(model.scale[0], 1);
  assert.ok(Math.abs(model.scale[1] - 2) < 1e-6);
  assert.ok(Math.abs(model.scale[2] - 3) < 1e-6);
  assert.equal(model.dc[0], 1);
  assert.equal(model.rest[0], 1.5);
  assert.equal(model.rest[15], -2);
  assert.deepEqual(Array.from(model.quat.subarray(0, 4)), [1, 0, 0, 0]);
  assert.equal(model.quat[4], 1);
  await assert.rejects(gsParseGaussianPly(new TextEncoder().encode('ply\nformat ascii 1.0\nelement vertex 0\nproperty float x\nend_header\n')), /二进制小端/);
});

test('training cameras use the vector from the bounds center to the camera', () => {
  const top = gsTrainingAngles([0, 0, 10], [0, 0, 0]);
  assert.ok(Math.abs(top.elevation - 90) < 1e-6);
  const side = gsTrainingAngles([0, 10, 0], [0, 0, 0]);
  assert.ok(Math.abs(side.azimuth - 90) < 1e-6 && Math.abs(side.elevation) < 1e-6);
  const cameras = gsParseCameras(JSON.stringify([{id: 3, img_name: 'frame.jpg', position: [1, 2, 3], width: 8, height: 4}, {id: 4}]));
  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].name, 'frame.jpg');
  assert.deepEqual(cameras[0].position, [1, 2, 3]);
});

test('splat depth sort draws the farther orthographic sample first', () => {
  const order = gsSortedOrder(new Float32Array([2, -1, 0, 0.5]));
  assert.deepEqual(Array.from(order), [1, 2, 3, 0]);
});

test('a real 3DGS PLY header can be sampled when GS_PLY is set', async () => {
  const path = process.env.GS_PLY;
  if (!path || !fs.existsSync(path)) return;
  const fd = fs.openSync(path, 'r');
  const probe = Buffer.alloc(8192);
  fs.readSync(fd, probe, 0, probe.length, 0);
  const text = probe.toString('latin1');
  const marker = text.indexOf('end_header');
  assert.ok(marker > 0);
  let end = marker + 'end_header'.length;
  if (text.charCodeAt(end) === 13) end += 1;
  if (text.charCodeAt(end) === 10) end += 1;
  const declared = Number(text.slice(0, marker).match(/element vertex (\d+)/)[1]);
  const properties = text.slice(0, marker).split('\n').filter(line => line.startsWith('property ')).length;
  const body = Buffer.alloc(properties * 4 * 2);
  fs.readSync(fd, body, 0, body.length, end);
  fs.closeSync(fd);
  const bytes = new Uint8Array(end + body.length);
  bytes.set(probe.subarray(0, end), 0); bytes.set(body, end);
  const model = await gsParseGaussianPly(bytes.buffer, {vertexLimit: 2, includeRest: true});
  assert.equal(model.sourceCount, declared);
  assert.equal(model.count, 2);
  assert.equal(model.hasRest, true);
  assert.ok(model.centers.subarray(0, 3).every(Number.isFinite));
  assert.ok(model.opacity[0] > 0 && model.opacity[0] < 1);
  assert.ok(model.scale.subarray(0, 3).every(value => value > 0));
  assert.ok(Math.abs(Math.hypot(...model.quat.subarray(0, 4)) - 1) < 1e-5);
});
