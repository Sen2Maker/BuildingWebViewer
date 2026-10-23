import { a as t, n as initializeLocale } from "./i18n-CQYkw1yO.js";
import { A as gsUnit3, D as gsDot3, E as gsCross3, O as gsProjectPosition, d as mountViewerLayout, j as gsViewSpec, n as captureCameraSnapshot, r as mountCameraControls, t as applyCameraSnapshot, u as gsSetOrbitBasis, y as saveLocalBlob } from "./camera-controls-kT0RzZel.js";
import { c as restoreMobileInputs, n as captureMobileInputs, r as isMobileApp, s as nativeExportWriter } from "./mobile-project-DIn9Vanq.js";
import { c as defaultPointSettings, o as writePointExport, r as CloudViewer, t as genSaveHandoff } from "./generate-handoff-BhhPi5Bc.js";
import { n as readPointCloud } from "./point-io-B3vnI3Pb.js";
import { t as openWorkspaceSession } from "./workspace-session-pG6s43uL.js";
//#region src/generate/drawing-geometry.js
var DRAW_EPS = 1e-8;
var drawSub = (a, b) => a.map((v, i) => v - b[i]);
var drawCross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
var drawFail = (message) => {
	throw Error(message);
};
function drawFrame(normal, origin = [
	0,
	0,
	0
], preferred = null) {
	const n = gsUnit3(normal), axis = preferred || (Math.abs(n[2]) < .9 ? [
		0,
		0,
		1
	] : [
		1,
		0,
		0
	]);
	const u = gsUnit3(axis.map((v, i) => v - n[i] * gsDot3(axis, n))), v = gsCross3(n, u);
	return {
		origin: [...origin],
		u,
		v,
		n
	};
}
function drawUnproject(spec, x, y, origin = [
	0,
	0,
	0
]) {
	const [r, u, b] = spec.basis, sx = x - spec.width / 2, sy = spec.height / 2 - y;
	return {
		origin: spec.eye.map((v, i) => v + origin[i] + (spec.perspective ? 0 : (r[i] * sx + u[i] * sy) * spec.worldHeight / spec.height)),
		direction: spec.perspective ? b.map((v, i) => -v + r[i] * sx / spec.fx + u[i] * sy / spec.fy) : b.map((v) => -v)
	};
}
function drawRayPlane(ray, frame, snap = 0) {
	const den = gsDot3(ray.direction, frame.n);
	if (Math.abs(den) < 1e-5) return null;
	const depth = gsDot3(drawSub(frame.origin, ray.origin), frame.n) / den;
	if (depth < 0) return null;
	let p = ray.origin.map((v, i) => v + ray.direction[i] * depth);
	if (snap > 0) {
		const d = drawSub(p, frame.origin), a = Math.round(gsDot3(d, frame.u) / snap) * snap, b = Math.round(gsDot3(d, frame.v) / snap) * snap;
		p = frame.origin.map((v, i) => v + a * frame.u[i] + b * frame.v[i]);
	}
	return p.every(Number.isFinite) ? p : null;
}
/** Simple, planar polygons only. Concave contours are triangulated by ear clipping. */
function drawPolygon(points, normal) {
	const frame = drawFrame(normal, points[0]), projected = points.map((p) => {
		const d = drawSub(p, frame.origin);
		if (Math.abs(gsDot3(d, frame.n)) > 1e-6 * Math.max(1, Math.hypot(...d))) drawFail("轮廓必须共面 / Contour must be planar");
		return [gsDot3(d, frame.u), gsDot3(d, frame.v)];
	});
	const n = points.length;
	const on = (a, b, p) => Math.abs(drawCross2(a, b, p)) < DRAW_EPS && p[0] >= Math.min(a[0], b[0]) - DRAW_EPS && p[0] <= Math.max(a[0], b[0]) + DRAW_EPS && p[1] >= Math.min(a[1], b[1]) - DRAW_EPS && p[1] <= Math.max(a[1], b[1]) + DRAW_EPS;
	for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (j !== i + 1 && !(i === 0 && j === n - 1)) {
		const a = projected[i], b = projected[(i + 1) % n], c = projected[j], d = projected[(j + 1) % n];
		if (drawCross2(a, b, c) * drawCross2(a, b, d) < 0 && drawCross2(c, d, a) * drawCross2(c, d, b) < 0 || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b)) drawFail("轮廓自交或重叠，请调整顶点 / Self-intersecting contour");
	}
	let area = 0;
	for (let i = 0; i < n; i++) {
		const a = projected[i], b = projected[(i + 1) % n];
		area += a[0] * b[1] - b[0] * a[1];
	}
	if (Math.abs(area) < DRAW_EPS) drawFail("轮廓面积为零 / Contour has zero area");
	const ids = points.map((_, i) => i);
	if (area < 0) ids.reverse();
	const triangles = [];
	while (ids.length > 3) {
		let found = false;
		for (let i = 0; i < ids.length; i++) {
			const a = ids[(i + ids.length - 1) % ids.length], b = ids[i], c = ids[(i + 1) % ids.length], turn = drawCross2(projected[a], projected[b], projected[c]);
			if (Math.abs(turn) < DRAW_EPS) {
				ids.splice(i, 1);
				found = true;
				break;
			}
			if (turn < 0) continue;
			if (ids.some((k) => k !== a && k !== b && k !== c && drawCross2(projected[a], projected[b], projected[k]) >= -1e-8 && drawCross2(projected[b], projected[c], projected[k]) >= -1e-8 && drawCross2(projected[c], projected[a], projected[k]) >= -1e-8)) continue;
			triangles.push([
				a,
				b,
				c
			]);
			ids.splice(i, 1);
			found = true;
			break;
		}
		if (!found) drawFail("无法三角化轮廓 / Cannot triangulate contour");
	}
	if (ids.length === 3) triangles.push([...ids]);
	return {
		frame,
		triangles
	};
}
function drawCheck(shape) {
	if (![
		"stroke",
		"polygon",
		"extrusion"
	].includes(shape.type)) drawFail("未知绘制类型 / Unknown drawing");
	const min = shape.type === "stroke" ? 2 : 3, max = shape.type === "stroke" ? 4e3 : 256;
	if (!Array.isArray(shape.points) || shape.points.length < min || shape.points.length > max || shape.points.some((p) => !Array.isArray(p) || p.length !== 3 || !p.every((v) => Number.isFinite(v) && Math.abs(v) <= 1e9))) drawFail(`顶点数量应为 ${min}–${max}，XYZ 必须有效 / Invalid vertices`);
	for (let i = 1; i < shape.points.length; i++) if (Math.hypot(...drawSub(shape.points[i], shape.points[i - 1])) < DRAW_EPS) drawFail("连续顶点不能重合 / Duplicate adjacent vertices");
	if (shape.type !== "stroke") {
		if (!Array.isArray(shape.normal) || shape.normal.length !== 3 || !shape.normal.every(Number.isFinite)) drawFail("平面法向无效 / Invalid plane normal");
		drawPolygon(shape.points, shape.normal);
		if (shape.type === "extrusion" && (!(shape.height > 0) || !Number.isFinite(shape.height) || !["surface", "volume"].includes(shape.fill))) drawFail("拉伸高度须大于零 / Extrusion height must be positive");
	}
	return shape;
}
function drawSurfaces(part) {
	const s = part.shape, pts = s.points.map((p) => p.map((v, i) => v + [
		part.place.x,
		part.place.y,
		part.place.z
	][i])), out = [];
	if (s.type === "stroke") {
		for (let i = 1; i < pts.length; i++) out.push({
			kind: "line",
			a: pts[i - 1],
			b: pts[i],
			span: Math.hypot(...drawSub(pts[i], pts[i - 1]))
		});
		return out;
	}
	const { frame, triangles } = drawPolygon(pts, s.normal), normal = frame.n, h = s.type === "extrusion" ? s.height : 0;
	const shift = (p) => p.map((v, i) => v + normal[i] * h);
	for (const [i, j, k] of triangles) {
		const a = pts[i], b = pts[j], c = pts[k], span = Math.max(Math.hypot(...drawSub(a, b)), Math.hypot(...drawSub(a, c)), Math.hypot(...drawSub(b, c)));
		if (h && s.fill === "volume") {
			out.push({
				kind: "prism",
				a,
				b,
				c,
				span,
				normal,
				height: h
			});
			continue;
		}
		out.push({
			kind: "triangle",
			a,
			b,
			c,
			span,
			normal: h ? normal.map((v) => -v) : normal,
			surface: 5
		});
		if (h) out.push({
			kind: "triangle",
			a: shift(a),
			b: shift(b),
			c: shift(c),
			span,
			normal,
			surface: 5
		});
	}
	if (h && s.fill !== "volume") for (let i = 0; i < pts.length; i++) {
		const a = pts[i], b = pts[(i + 1) % pts.length], u = drawSub(b, a), v = normal.map((n) => n * h);
		let n = gsUnit3(gsCross3(u, normal));
		if (pts.reduce((sum, p, j) => sum + gsDot3(gsCross3(drawSub(p, frame.origin), drawSub(pts[(j + 1) % pts.length], frame.origin)), normal), 0) < 0) n = n.map((v) => -v);
		out.push({
			kind: "quad",
			origin: a,
			u,
			v,
			normal: n,
			surface: 5
		});
	}
	return out;
}
//#endregion
//#region src/generate/sample.js
/** Parametric sampling into an ordinary point cloud. Includes drawn lines, planar polygons and extruded volumes. */
var GEN_LIMIT = 2e6;
var GEN_TINY = 1e-9;
var genLen = (value) => Math.hypot(value[0], value[1], value[2]);
function genUnit(value) {
	const length = genLen(value);
	if (!(length > GEN_TINY)) throw Error(t("法向长度无效"));
	return [
		value[0] / length,
		value[1] / length,
		value[2] / length
	];
}
function genFinite(value, label) {
	if (typeof value !== "number" || !Number.isFinite(value)) throw Error(t("{0}必须是有限数值", [t(label)]));
	return value;
}
function genPositive(value, label) {
	const number = genFinite(value, label);
	if (!(number > 0)) throw Error(t("{0}必须大于 0", [t(label)]));
	return number;
}
function genFlag(value, label) {
	if (typeof value !== "boolean") throw Error(t("{0}开关无效", [t(label)]));
	return value;
}
function genRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = state + 1831565813 >>> 0;
		let mixed = Math.imul(state ^ state >>> 15, state | 1);
		mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
		return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
	};
}
function genGauss(rng) {
	let u = rng(), v = rng();
	if (u < 1e-12) u = 1e-12;
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}
function genIntervals(length, spacing) {
	return Math.max(1, Math.round(length / spacing));
}
function genCheck(part) {
	if (!part || typeof part !== "object") throw Error(t("形体参数无效"));
	if (!Number.isInteger(part.id) || part.id < 1) throw Error(t("部件编号无效"));
	const place = part.place || {}, shape = part.shape || {}, sampling = part.sampling || {};
	for (const [value, label] of [
		[place.x, "位置 X"],
		[place.y, "位置 Y"],
		[place.z, "位置 Z"]
	]) genFinite(value, label);
	if (genPositive(sampling.spacing, "间距") > 1e6) throw Error(t("间距过大"));
	if (genFinite(sampling.noise, "噪声") < 0) throw Error(t("噪声不能为负"));
	if (!Number.isInteger(sampling.seed) || sampling.seed < 0 || sampling.seed > 4294967295) throw Error(t("种子需为 0 到 4294967295 的整数"));
	if (!["grid", "stratified"].includes(sampling.pattern)) throw Error(t("采样分布无效"));
	const type = shape.type;
	if ([
		"stroke",
		"polygon",
		"extrusion"
	].includes(type)) {
		drawCheck(shape);
		return part;
	}
	if (![
		"ground",
		"box",
		"gable"
	].includes(type)) throw Error(t("未知形体"));
	genPositive(shape.width, type === "gable" ? "开间" : "宽度");
	genPositive(shape.depth, type === "gable" ? "进深" : "深度");
	genFinite(shape.groundZ, "地面标高");
	if (type === "box") genPositive(shape.height, "高度");
	if (type === "gable") {
		const eave = genFinite(shape.eaveHeight, "檐高");
		const ridge = genFinite(shape.ridgeHeight, "脊高");
		if (eave < 0) throw Error(t("檐高不能为负"));
		if (ridge < eave) throw Error(t("脊高不能低于檐高"));
		if (genFinite(shape.overhang, "出檐") < 0) throw Error(t("出檐不能为负"));
		genFlag(shape.walls, "墙");
		genFlag(shape.gables, "山墙");
	}
	if (type === "box") genFlag(shape.interior, "内部");
	return part;
}
function genPushQuad(list, origin, u, v, normal, surface) {
	if (genLen(u) > GEN_TINY && genLen(v) > GEN_TINY) list.push({
		kind: "quad",
		origin,
		u,
		v,
		normal,
		surface
	});
}
function genSurfaces(part) {
	const { shape, place } = part, list = [];
	if ([
		"stroke",
		"polygon",
		"extrusion"
	].includes(shape.type)) return drawSurfaces(part);
	if (shape.type === "ground") {
		genPushQuad(list, [
			place.x - shape.width / 2,
			place.y - shape.depth / 2,
			place.z + shape.groundZ
		], [
			shape.width,
			0,
			0
		], [
			0,
			shape.depth,
			0
		], [
			0,
			0,
			1
		], 1);
		return list;
	}
	if (shape.type === "box") {
		const min = [
			place.x - shape.width / 2,
			place.y - shape.depth / 2,
			place.z + shape.groundZ
		];
		const size = [
			shape.width,
			shape.depth,
			shape.height
		];
		const max = min.map((value, axis) => value + size[axis]);
		const face = (origin, u, v, normal) => genPushQuad(list, origin, u, v, normal, 2);
		face(min, [
			size[0],
			0,
			0
		], [
			0,
			size[1],
			0
		], [
			0,
			0,
			-1
		]);
		face([
			min[0],
			min[1],
			max[2]
		], [
			size[0],
			0,
			0
		], [
			0,
			size[1],
			0
		], [
			0,
			0,
			1
		]);
		face(min, [
			0,
			size[1],
			0
		], [
			0,
			0,
			size[2]
		], [
			-1,
			0,
			0
		]);
		face([
			max[0],
			min[1],
			min[2]
		], [
			0,
			size[1],
			0
		], [
			0,
			0,
			size[2]
		], [
			1,
			0,
			0
		]);
		face(min, [
			size[0],
			0,
			0
		], [
			0,
			0,
			size[2]
		], [
			0,
			-1,
			0
		]);
		face([
			min[0],
			max[1],
			min[2]
		], [
			size[0],
			0,
			0
		], [
			0,
			0,
			size[2]
		], [
			0,
			1,
			0
		]);
		if (shape.interior) list.push({
			kind: "interior",
			min,
			max
		});
		return list;
	}
	const hx = shape.width / 2, hy = shape.depth / 2, span = hx + shape.overhang;
	const y0 = place.y - hy - shape.overhang, yLen = shape.depth + shape.overhang * 2;
	const z0 = place.z + shape.groundZ, zE = z0 + shape.eaveHeight, rise = shape.ridgeHeight - shape.eaveHeight;
	if (rise === 0) genPushQuad(list, [
		place.x - span,
		y0,
		zE
	], [
		0,
		yLen,
		0
	], [
		span * 2,
		0,
		0
	], [
		0,
		0,
		1
	], 3);
	else {
		genPushQuad(list, [
			place.x - span,
			y0,
			zE
		], [
			0,
			yLen,
			0
		], [
			span,
			0,
			rise
		], [
			-rise,
			0,
			span
		], 3);
		genPushQuad(list, [
			place.x + span,
			y0,
			zE
		], [
			0,
			yLen,
			0
		], [
			-span,
			0,
			rise
		], [
			rise,
			0,
			span
		], 3);
	}
	if (shape.walls) {
		const x0 = place.x - hx, x1 = place.x + hx, ya = place.y - hy, yb = place.y + hy;
		genPushQuad(list, [
			x0,
			ya,
			z0
		], [
			0,
			shape.depth,
			0
		], [
			0,
			0,
			shape.eaveHeight
		], [
			-1,
			0,
			0
		], 2);
		genPushQuad(list, [
			x1,
			ya,
			z0
		], [
			0,
			shape.depth,
			0
		], [
			0,
			0,
			shape.eaveHeight
		], [
			1,
			0,
			0
		], 2);
		genPushQuad(list, [
			x0,
			ya,
			z0
		], [
			shape.width,
			0,
			0
		], [
			0,
			0,
			shape.eaveHeight
		], [
			0,
			-1,
			0
		], 2);
		genPushQuad(list, [
			x0,
			yb,
			z0
		], [
			shape.width,
			0,
			0
		], [
			0,
			0,
			shape.eaveHeight
		], [
			0,
			1,
			0
		], 2);
	}
	if (shape.gables && rise > 0) {
		const spanAcross = Math.max(shape.width, rise);
		for (const [y, direction] of [[place.y - hy, -1], [place.y + hy, 1]]) list.push({
			kind: "triangle",
			span: spanAcross,
			normal: [
				0,
				direction,
				0
			],
			surface: 4,
			a: [
				place.x - hx,
				y,
				zE
			],
			b: [
				place.x + hx,
				y,
				zE
			],
			c: [
				place.x,
				y,
				zE + rise
			]
		});
	}
	return list;
}
function genQuadCount(surface, sampling) {
	const uLen = genLen(surface.u), vLen = genLen(surface.v);
	if (!(uLen > GEN_TINY) || !(vLen > GEN_TINY)) return 0;
	const stepsU = genIntervals(uLen, sampling.spacing), stepsV = genIntervals(vLen, sampling.spacing);
	return (sampling.pattern === "grid" ? stepsU + 1 : stepsU) * (sampling.pattern === "grid" ? stepsV + 1 : stepsV);
}
function genTriangleCount(surface, sampling) {
	const n = genIntervals(surface.span, sampling.spacing);
	return sampling.pattern === "grid" ? (n + 1) * (n + 2) / 2 : n * (n + 1) / 2;
}
function genInteriorCount(surface, sampling) {
	const counts = [
		0,
		1,
		2
	].map((axis) => {
		const length = surface.max[axis] - surface.min[axis];
		if (!(length > GEN_TINY)) return 0;
		return Math.max(0, Math.round(length / sampling.spacing) - 1);
	});
	return counts[0] * counts[1] * counts[2];
}
function genSurfaceCount(surface, sampling) {
	if (surface.kind === "line") return Math.max(1, Math.ceil(surface.span / sampling.spacing)) + 1;
	if (surface.kind === "prism") return genTriangleCount(surface, sampling) * (genIntervals(surface.height, sampling.spacing) + 1);
	if (surface.kind === "quad") return genQuadCount(surface, sampling);
	if (surface.kind === "triangle") return genTriangleCount(surface, sampling);
	return genInteriorCount(surface, sampling);
}
function genEstimate(part) {
	genCheck(part);
	const count = genSurfaces(part).reduce((sum, surface) => sum + genSurfaceCount(surface, part.sampling), 0);
	if (!Number.isSafeInteger(count)) throw Error(t("生成点数超出可表示范围"));
	return count;
}
function genEmitQuad(surface, sampling, rng, put) {
	const uLen = genLen(surface.u), vLen = genLen(surface.v);
	if (!(uLen > GEN_TINY) || !(vLen > GEN_TINY)) return;
	const stepsU = genIntervals(uLen, sampling.spacing), stepsV = genIntervals(vLen, sampling.spacing);
	const grid = sampling.pattern === "grid";
	const across = grid ? stepsU + 1 : stepsU, along = grid ? stepsV + 1 : stepsV;
	const normal = genUnit(surface.normal);
	for (let j = 0; j < along; j++) for (let i = 0; i < across; i++) {
		const su = grid ? i / stepsU : (i + rng()) / stepsU;
		const sv = grid ? j / stepsV : (j + rng()) / stepsV;
		let x = surface.origin[0] + surface.u[0] * su + surface.v[0] * sv;
		let y = surface.origin[1] + surface.u[1] * su + surface.v[1] * sv;
		let z = surface.origin[2] + surface.u[2] * su + surface.v[2] * sv;
		if (sampling.noise > 0) {
			const offset = genGauss(rng) * sampling.noise;
			x += normal[0] * offset;
			y += normal[1] * offset;
			z += normal[2] * offset;
		}
		put(x, y, z, normal, surface.surface, 1);
	}
}
function genEmitTriangle(surface, sampling, rng, put) {
	const n = genIntervals(surface.span, sampling.spacing), grid = sampling.pattern === "grid", normal = genUnit(surface.normal);
	const emit = (u, v) => {
		const w = 1 - u - v;
		let x = surface.a[0] * w + surface.b[0] * u + surface.c[0] * v;
		let y = surface.a[1] * w + surface.b[1] * u + surface.c[1] * v;
		let z = surface.a[2] * w + surface.b[2] * u + surface.c[2] * v;
		if (sampling.noise > 0) {
			const offset = genGauss(rng) * sampling.noise;
			x += normal[0] * offset;
			y += normal[1] * offset;
			z += normal[2] * offset;
		}
		put(x, y, z, normal, surface.surface, 1);
	};
	if (grid) {
		for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) emit(i / n, j / n);
		return;
	}
	for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
		let u = (i + rng()) / n, v = (j + rng()) / n;
		if (u + v > 1) v = 1 - u;
		emit(u, v);
	}
}
function genEmitInterior(surface, sampling, rng, put) {
	const spans = [
		0,
		1,
		2
	].map((axis) => surface.max[axis] - surface.min[axis]);
	const steps = spans.map((length) => Math.round(length / sampling.spacing));
	if (steps.some((step, axis) => !(spans[axis] > GEN_TINY) || step < 2)) return;
	const grid = sampling.pattern === "grid";
	for (let i = 1; i <= steps[0] - 1; i++) for (let j = 1; j <= steps[1] - 1; j++) for (let k = 1; k <= steps[2] - 1; k++) {
		const coordinate = (index, axis) => {
			const fraction = grid ? index / steps[axis] : Math.min(steps[axis] - 1e-9, Math.max(1e-9, index + (rng() - .5) * .5)) / steps[axis];
			return surface.min[axis] + spans[axis] * fraction;
		};
		let x = coordinate(i, 0), y = coordinate(j, 1), z = coordinate(k, 2);
		if (sampling.noise > 0) {
			x += genGauss(rng) * sampling.noise;
			y += genGauss(rng) * sampling.noise;
			z += genGauss(rng) * sampling.noise;
		}
		put(x, y, z, [
			0,
			0,
			0
		], 0, 0);
	}
}
function genSample(part, { color = [
	.5,
	.55,
	.52
], maxPoints = GEN_LIMIT } = {}) {
	genCheck(part);
	if (!Number.isInteger(maxPoints) || maxPoints < 1) throw Error(t("生成点数上限无效"));
	const count = genEstimate(part);
	if (count < 1) throw Error(t("当前形体没有可采样的点。"));
	if (count > maxPoints) throw Error(t("生成点数超过 {0}，请加大间距。", [maxPoints.toLocaleString("zh-CN")]));
	const rgbColor = color?.length === 3 && color.every((value) => Number.isFinite(value)) ? color.map((value) => Math.min(1, Math.max(0, value))) : [
		.5,
		.55,
		.52
	];
	const positions = new Float64Array(count * 3), nx = new Float64Array(count), ny = new Float64Array(count), nz = new Float64Array(count);
	const partId = new Float64Array(count), surfaceId = new Float64Array(count), normalValid = new Float64Array(count);
	const red = new Float64Array(count), green = new Float64Array(count), blue = new Float64Array(count), rgb = new Float32Array(count * 3);
	let cursor = 0;
	const rng = genRng(part.sampling.seed);
	const put = (x, y, z, normal, surface, valid) => {
		const index = cursor++;
		positions[index * 3] = x;
		positions[index * 3 + 1] = y;
		positions[index * 3 + 2] = z;
		nx[index] = normal[0];
		ny[index] = normal[1];
		nz[index] = normal[2];
		partId[index] = part.id;
		surfaceId[index] = surface;
		normalValid[index] = valid;
		red[index] = rgbColor[0];
		green[index] = rgbColor[1];
		blue[index] = rgbColor[2];
		rgb[index * 3] = rgbColor[0];
		rgb[index * 3 + 1] = rgbColor[1];
		rgb[index * 3 + 2] = rgbColor[2];
	};
	for (const surface of genSurfaces(part)) if (surface.kind === "line") {
		const n = Math.max(1, Math.ceil(surface.span / part.sampling.spacing));
		for (let i = 0; i <= n; i++) {
			const u = part.sampling.pattern === "grid" || i === 0 || i === n ? i / n : (i - .5 + rng()) / n;
			put(...surface.a.map((v, k) => v + (surface.b[k] - v) * u + (part.sampling.noise ? genGauss(rng) * part.sampling.noise : 0)), [
				0,
				0,
				0
			], 6, 0);
		}
	} else if (surface.kind === "prism") {
		const n = genIntervals(surface.height, part.sampling.spacing);
		for (let layer = 0; layer <= n; layer++) {
			const z = part.sampling.pattern === "grid" || layer === 0 || layer === n ? layer / n : (layer - .5 + rng()) / n;
			genEmitTriangle(surface, {
				...part.sampling,
				noise: 0
			}, rng, (x, y, z0) => {
				const p = [
					x,
					y,
					z0
				].map((v, k) => v + surface.normal[k] * z * surface.height + (part.sampling.noise ? genGauss(rng) * part.sampling.noise : 0));
				put(...p, [
					0,
					0,
					0
				], 0, 0);
			});
		}
	} else if (surface.kind === "quad") genEmitQuad(surface, part.sampling, rng, put);
	else if (surface.kind === "triangle") genEmitTriangle(surface, part.sampling, rng, put);
	else genEmitInterior(surface, part.sampling, rng, put);
	if (cursor !== count) throw Error(t("采样数量和估计不一致。"));
	const order = [
		"x",
		"y",
		"z",
		"nx",
		"ny",
		"nz",
		"red",
		"green",
		"blue",
		"part",
		"surface",
		"normal_valid"
	];
	return {
		count,
		totalCount: count,
		positions,
		rgb,
		fields: {
			nx,
			ny,
			nz,
			red,
			green,
			blue,
			part: partId,
			surface: surfaceId,
			normal_valid: normalValid
		},
		columnOrder: order,
		semantics: {
			order,
			tags: {
				nx: "nx",
				ny: "ny",
				nz: "nz",
				red: "red",
				green: "green",
				blue: "blue",
				part: "classification",
				surface: "scalar",
				normal_valid: "scalar"
			},
			custom: {},
			rgbScale: "1",
			hsvScale: "degrees",
			colorSpace: "rgb"
		},
		processing: {
			tool: "generate",
			recipe: 1,
			shape: { ...part.shape },
			place: { ...part.place },
			sampling: { ...part.sampling }
		}
	};
}
//#endregion
//#region src/generate/project.js
/** Recipes store geometry and sampling only, never generated point buffers. */
function genValidateProject(value) {
	if (value?.format !== "BuildingWebViewer.drawing" || value.version !== 1 || !Array.isArray(value.parts) || value.parts.length > 200) throw Error("不是有效的绘制项目 / Invalid drawing project");
	const ids = /* @__PURE__ */ new Set();
	const parts = value.parts.map((p) => {
		genCheck(p);
		if (!Number.isSafeInteger(p.id) || p.id >= Number.MAX_SAFE_INTEGER) throw Error("Invalid part ID");
		if (ids.has(p.id)) throw Error("重复部件编号 / Duplicate part ID");
		ids.add(p.id);
		if (typeof p.name !== "string" || p.name.length > 160 || typeof p.visible !== "boolean" || !Array.isArray(p.color) || p.color.length !== 3 || !p.color.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) throw Error("部件信息无效 / Invalid part metadata");
		return JSON.parse(JSON.stringify(p));
	});
	return {
		format: value.format,
		version: 1,
		parts
	};
}
//#endregion
//#region src/generate/drawing-controls.js
/** Work-plane drawing owns its overlay input; navigation owns the scene canvas. */
function mountDrawingControls({ viewer, container, toolbar, onCommit, onError, onModeChange = () => {}, isBusy = () => false }) {
	const en = document.documentElement.lang === "en", tr = (zh, enText) => en ? enText : zh;
	const make = (tag, text, cls) => {
		const n = document.createElement(tag);
		if (text) n.textContent = text;
		if (cls) n.className = cls;
		return n;
	};
	let enabled = false, mode = "navigate", lastTool = "brush", points = [], hover = null, drag = null, strokeBefore = 0, frame = drawFrame([
		0,
		0,
		1
	]), showGrid = true;
	const stage = viewer.canvas.parentElement, overlay = make("canvas", null, "draw-overlay");
	overlay.setAttribute("aria-label", tr("三维绘制画布", "3D drawing canvas"));
	overlay.tabIndex = 0;
	stage.append(overlay);
	const ctx = overlay.getContext("2d");
	const tools = make("section", null, "draw-toolbar"), buttons = /* @__PURE__ */ new Map();
	tools.setAttribute("aria-label", tr("绘制工具与草稿", "Drawing tools and draft"));
	const toolGroup = make("div", null, "draw-tool-group"), toolLabel = make("span", tr("绘制工具", "Drawing tools"), "draw-group-label");
	toolGroup.append(toolLabel);
	const toolButtons = make("div", null, "draw-tool-buttons");
	toolGroup.append(toolButtons);
	const names = /* @__PURE__ */ new Map();
	for (const [value, zh, eng] of [
		[
			"brush",
			"自由画笔",
			"Freehand"
		],
		[
			"line",
			"折线",
			"Polyline"
		],
		[
			"polygon",
			"绘制面",
			"Face"
		],
		[
			"extrusion",
			"拉伸体",
			"Extrude"
		]
	]) {
		const label = tr(zh, eng), b = make("button", label);
		b.type = "button";
		b.onclick = () => switchMode(value);
		buttons.set(value, b);
		names.set(value, label);
		toolButtons.append(b);
	}
	const draftGroup = make("div", null, "draw-draft-group"), draftInfo = make("div", null, "draw-draft-info"), draftTitle = make("strong"), draftHint = make("span");
	draftInfo.append(draftTitle, draftHint);
	const actions = make("div", null, "draw-draft-actions"), pause = make("button"), finish = make("button", tr("完成生成", "Generate cloud"), "primary"), back = make("button", tr("撤回一点", "Undo vertex")), cancel = make("button", tr("丢弃草稿", "Discard draft"), "danger-text");
	for (const b of [
		pause,
		finish,
		back,
		cancel
	]) b.type = "button";
	pause.onclick = () => switchMode(mode === "navigate" ? draftMode || lastTool : "navigate");
	actions.append(pause, finish, back, cancel);
	draftGroup.append(draftInfo, actions);
	tools.append(toolGroup, draftGroup);
	toolbar.after(tools);
	const panel = make("details", null, "draw-panel");
	panel.open = true;
	panel.append(make("summary", tr("绘制平面与深度", "Drawing plane & depth")));
	container.append(panel);
	const panelBody = make("div", null, "draw-panel-body");
	panel.append(panelBody);
	const row = (title, input) => {
		const l = make("label", title);
		input.setAttribute("aria-label", title);
		l.append(input);
		panelBody.append(l);
		return input;
	};
	const plane = row(tr("工作平面", "Work plane"), make("select"));
	for (const [value, label] of [
		["xy", "XY · Z"],
		["xz", "XZ · Y"],
		["yz", "YZ · X"],
		["view", tr("当前视角平面", "Current view plane")]
	]) {
		const o = make("option", label);
		o.value = value;
		plane.append(o);
	}
	const offset = row(tr("平面深度", "Plane depth"), make("input"));
	offset.type = "number";
	offset.step = ".1";
	offset.value = "0";
	const snap = row(tr("吸附间距（0 为关闭）", "Snap spacing (0 = off)"), make("input"));
	snap.type = "number";
	snap.min = 0;
	snap.step = ".1";
	snap.value = ".25";
	const height = row(tr("新体拉伸高度", "New extrusion height"), make("input"));
	height.type = "number";
	height.min = ".001";
	height.step = ".1";
	height.value = "3";
	const fill = row(tr("新体点分布", "New volume sampling"), make("select"));
	for (const [value, zh, eng] of [[
		"surface",
		"仅表面",
		"Surface only"
	], [
		"volume",
		"整个体积",
		"Filled volume"
	]]) {
		const o = make("option", tr(zh, eng));
		o.value = value;
		fill.append(o);
	}
	const planeActions = make("div", null, "draw-plane-actions"), align = make("button", tr("正对平面", "Face plane")), capture = make("button", tr("取当前视角平面", "Capture view plane"));
	planeActions.append(align, capture);
	panelBody.append(planeActions);
	const gridLabel = make("label", null, "gen-check"), grid = make("input");
	grid.type = "checkbox";
	grid.checked = true;
	gridLabel.append(grid, document.createTextNode(tr("显示工作平面", "Show work plane")));
	panelBody.append(gridLabel);
	grid.onchange = () => {
		showGrid = grid.checked;
		paint();
	};
	const hint = make("p", null, "gen-side-note");
	hint.textContent = tr("自由画笔按住拖动；折线、面和体点击落点。按 Esc 或“调整视角”暂停并保留草稿，再点“继续绘制”。面和体的轮廓须在同一平面。", "Drag for Freehand; click vertices for other tools. Press Esc or Adjust view to pause without losing your draft, then Resume drawing. Faces and volumes use one plane.");
	panelBody.append(hint);
	const status = make("div", null, "draw-status");
	status.setAttribute("role", "status");
	stage.append(status);
	let draftMode = null;
	function spec() {
		return gsViewSpec(viewer, viewer.canvas.clientWidth, viewer.canvas.clientHeight);
	}
	function project(p, s) {
		return gsProjectPosition(p.map((v, i) => v - viewer.origin[i]), s);
	}
	function repaintStatus(message) {
		const paused = mode === "navigate";
		draftTitle.textContent = paused ? tr("绘制已暂停", "Drawing paused") : tr(`正在绘制 · ${names.get(mode)}`, `Drawing · ${names.get(mode)}`);
		draftHint.textContent = points.length ? tr(`${points.length} 个草稿点 · ${paused ? "草稿已保留，可调整视角" : "完成后生成点云"}`, `${points.length} draft vertices · ${paused ? "Draft retained — adjust the view" : "Generate when ready"}`) : tr("按住拖动画笔 · Esc 暂停", "Drag to draw · Esc pauses");
		if (mode !== "brush" && !points.length && !paused) draftHint.textContent = tr("点击画布落点 · Esc 暂停", "Click to place vertices · Esc pauses");
		status.textContent = message || (paused ? tr(`已暂停 · ${points.length} 个草稿点保留 · 拖动调整视角`, `Paused · ${points.length} draft vertices retained · Drag to adjust view`) : tr(`${names.get(mode)} · ${points.length} 点 · Esc 暂停 · Enter 生成`, `${names.get(mode)} · ${points.length} vertices · Esc pause · Enter generate`));
	}
	function sync() {
		const paused = mode === "navigate";
		tools.hidden = !enabled && !points.length;
		toolGroup.hidden = !enabled;
		pause.textContent = paused ? tr("继续绘制", "Resume drawing") : tr("暂停 · 调整视角", "Pause · Adjust view");
		pause.setAttribute("aria-label", pause.textContent);
		height.parentElement.hidden = fill.parentElement.hidden = (draftMode || mode) !== "extrusion";
		const empty = stage.querySelector("#empty-state");
		if (empty) empty.hidden = !paused || points.length > 0 || viewer.pointCount > 0;
		for (const [key, b] of buttons) {
			b.setAttribute("aria-pressed", String(mode === key));
			b.classList.toggle("active", mode === key);
			b.disabled = !!points.length && key !== draftMode;
		}
		overlay.style.pointerEvents = enabled && !paused ? "auto" : "none";
		finish.disabled = back.disabled = cancel.disabled = !points.length;
		back.hidden = cancel.hidden = !points.length;
		const locked = points.length && ["polygon", "extrusion"].includes(draftMode);
		plane.disabled = offset.disabled = capture.disabled = !!locked;
		repaintStatus();
		paint();
	}
	function releaseGesture() {
		const id = drag;
		drag = null;
		if (id !== null && overlay.hasPointerCapture(id)) overlay.releasePointerCapture(id);
	}
	function switchMode(next) {
		if (isBusy()) return;
		if (points.length && next !== "navigate" && next !== draftMode) {
			onError(tr("请先完成或丢弃当前草稿，再更换绘制类型。", "Generate or discard the current draft before changing drawing type."));
			return;
		}
		releaseGesture();
		viewer.stopNavigation?.();
		hover = null;
		mode = next;
		if (next !== "navigate") {
			lastTool = next;
			enabled = true;
		}
		onModeChange(next);
		sync();
	}
	function reset() {
		points = [];
		hover = null;
		draftMode = null;
		drag = null;
		sync();
	}
	function setPlane(fromView = false) {
		if (points.length && ["polygon", "extrusion"].includes(draftMode)) return;
		if (fromView) {
			const s = spec(), origin = s.target.map((v, i) => v + viewer.origin[i]);
			frame = drawFrame(s.basis[2], origin, s.basis[0]);
			plane.value = "view";
			offset.value = gsDot3(origin, frame.n).toFixed(6);
		} else {
			const depth = Number(offset.value);
			if (!Number.isFinite(depth) || !offset.value.trim()) return;
			const n = plane.value === "xy" ? [
				0,
				0,
				1
			] : plane.value === "xz" ? [
				0,
				-1,
				0
			] : plane.value === "yz" ? [
				1,
				0,
				0
			] : frame.n;
			const value = plane.value === "xz" ? -depth : depth;
			frame = drawFrame(n, n.map((v) => v * value), plane.value === "view" ? frame.u : plane.value === "yz" ? [
				0,
				1,
				0
			] : [
				1,
				0,
				0
			]);
		}
		hover = null;
		paint();
	}
	plane.onchange = () => {
		if (plane.value === "view") setPlane(true);
		else setPlane();
	};
	offset.oninput = () => setPlane();
	capture.onclick = () => setPlane(true);
	align.onclick = () => {
		viewer.stopNavigation?.();
		gsSetOrbitBasis(viewer, [
			frame.u,
			frame.v,
			frame.n
		]);
		viewer.camera.pan = [0, 0];
		viewer.target = frame.origin.map((v, i) => v - viewer.origin[i]);
		viewer.requestRender();
	};
	function paint() {
		const w = viewer.canvas.clientWidth, h = viewer.canvas.clientHeight;
		if (!w || !h) return;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(h * dpr)) {
			overlay.width = Math.round(w * dpr);
			overlay.height = Math.round(h * dpr);
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);
		overlay.hidden = !enabled && !points.length || !!viewer.fly?.active;
		status.hidden = overlay.hidden;
		if (overlay.hidden) return;
		const s = spec();
		const path = (a, b, color, width = 1) => {
			const p = project(a, s), q = project(b, s);
			if (!p || !q) return;
			ctx.beginPath();
			ctx.moveTo(p.x, p.y);
			ctx.lineTo(q.x, q.y);
			ctx.strokeStyle = color;
			ctx.lineWidth = width;
			ctx.stroke();
		};
		if (showGrid) {
			const extent = Math.max(.01, (s.perspective ? viewer.distance / viewer.camera.zoom * .7 : s.worldHeight) * .6), step = Math.pow(10, Math.floor(Math.log10(extent / 8))), size = step * 10;
			for (let i = -10; i <= 10; i++) {
				const at = (a, b) => frame.origin.map((v, k) => v + a * frame.u[k] + b * frame.v[k]);
				path(at(-size, i * step), at(size, i * step), i ? "#57967b35" : "#528e7190");
				path(at(i * step, -size), at(i * step, size), i ? "#57967b35" : "#528e7190");
			}
		}
		const contour = [...points];
		if (hover && mode !== "navigate") contour.push(hover);
		for (let i = 1; i < contour.length; i++) path(contour[i - 1], contour[i], "#d47835", 2);
		if (contour.length > 2 && ["polygon", "extrusion"].includes(draftMode || mode)) {
			path(contour[contour.length - 1], contour[0], "#d4783580", 1);
			const ps = contour.map((p) => project(p, s));
			if (ps.every(Boolean)) {
				ctx.beginPath();
				ps.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
				ctx.closePath();
				ctx.fillStyle = "#d4783520";
				ctx.fill();
			}
			if ((draftMode || mode) === "extrusion") {
				const h = Number(height.value) || 0, top = contour.map((p) => p.map((v, i) => v + frame.n[i] * h));
				for (let i = 0; i < contour.length; i++) {
					path(contour[i], top[i], "#d4783570");
					path(top[i], top[(i + 1) % top.length], "#d47835");
				}
			}
		}
		for (let i = 0; i < points.length; i++) {
			if (points.length > 100 && i % 10 && i !== points.length - 1) continue;
			const p = project(points[i], s);
			if (!p) continue;
			ctx.beginPath();
			ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
			ctx.fillStyle = "#bb662c";
			ctx.fill();
			if (points.length <= 30) {
				ctx.font = "11px system-ui";
				ctx.fillText(String(i + 1), p.x + 6, p.y - 5);
			}
		}
		if (hover && mode !== "navigate") {
			const p = project(hover, s);
			if (p) {
				ctx.strokeStyle = "#305b50";
				ctx.strokeRect(p.x - 5, p.y - 5, 10, 10);
			}
		}
	}
	function hit(e) {
		const rect = overlay.getBoundingClientRect(), s = Number(snap.value);
		const p = drawRayPlane(drawUnproject(spec(), e.clientX - rect.left, e.clientY - rect.top, viewer.origin), frame, Number.isFinite(s) && s > 0 ? s : 0);
		if (!p) repaintStatus(tr("视线与平面平行或平面在身后，请正对平面或调整深度。", "Plane is edge-on or behind the camera. Face the plane or change depth."));
		return p;
	}
	function append(p) {
		if (!p) return;
		const limit = ["polygon", "extrusion"].includes(draftMode || mode) ? 256 : 4e3;
		if (points.length >= limit) {
			onError(tr(`草稿最多 ${limit} 个顶点，请分成多个部件。`, `At most ${limit} vertices per draft; split into parts.`));
			return;
		}
		if (points.length && Math.hypot(...p.map((v, i) => v - points[points.length - 1][i])) < 1e-7) return;
		draftMode ||= mode;
		points.push(p);
		sync();
	}
	overlay.addEventListener("pointerdown", (e) => {
		if (mode === "navigate" || e.button !== 0 || isBusy() || drag !== null) return;
		e.preventDefault();
		overlay.focus();
		drag = e.pointerId;
		strokeBefore = points.length;
		overlay.setPointerCapture(e.pointerId);
		hover = hit(e);
		append(hover);
	});
	overlay.addEventListener("pointermove", (e) => {
		if (mode === "navigate" || isBusy()) return;
		hover = hit(e);
		if (drag === e.pointerId && mode === "brush" && hover) {
			const last = points[points.length - 1], a = last && project(last, spec()), b = project(hover, spec());
			if (!a || b && Math.hypot(b.x - a.x, b.y - a.y) >= 5) append(hover);
		}
		paint();
		if (hover) repaintStatus(`${points.length} ${tr("点", "vertices")} · XYZ ${hover.map((v) => v.toFixed(3)).join(" / ")}`);
	});
	const end = (e) => {
		if (drag !== e.pointerId) return;
		if (e.type === "pointercancel") points.splice(strokeBefore);
		drag = null;
		if (overlay.hasPointerCapture(e.pointerId)) overlay.releasePointerCapture(e.pointerId);
		sync();
	};
	overlay.addEventListener("pointerup", end);
	overlay.addEventListener("pointercancel", end);
	overlay.addEventListener("lostpointercapture", end);
	overlay.addEventListener("contextmenu", (e) => e.preventDefault());
	overlay.addEventListener("wheel", (e) => {
		e.preventDefault();
		viewer.zoomBy(Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * .001));
	}, { passive: false });
	function complete() {
		if (isBusy()) return;
		try {
			const shape = {
				type: ["line", "brush"].includes(draftMode) ? "stroke" : draftMode,
				points: points.map((p) => [...p]),
				normal: [...frame.n],
				height: Number(height.value),
				fill: fill.value
			};
			drawCheck(shape);
			onCommit(shape);
			switchMode("navigate");
			panel.open = false;
			reset();
		} catch (e) {
			onError(e.message);
		}
	}
	finish.onclick = complete;
	back.onclick = () => {
		if (isBusy()) return;
		points.pop();
		if (!points.length) draftMode = null;
		sync();
	};
	cancel.onclick = () => {
		if (isBusy()) return;
		switchMode("navigate");
		reset();
	};
	const key = (e) => {
		if ([
			"INPUT",
			"TEXTAREA",
			"SELECT"
		].includes(e.target.tagName) || e.target.isContentEditable || viewer.fly?.active || isBusy()) return;
		if (e.key === "Escape" && mode !== "navigate") {
			e.preventDefault();
			e.stopImmediatePropagation();
			switchMode("navigate");
		} else if (points.length && e.key === "Enter") {
			e.preventDefault();
			e.stopImmediatePropagation();
			complete();
		} else if (points.length && e.key === "Backspace") {
			e.preventDefault();
			back.click();
		}
	};
	document.addEventListener("keydown", key, true);
	height.oninput = paint;
	const old = viewer.onViewChange;
	viewer.onViewChange = (...args) => {
		old?.(...args);
		paint();
	};
	const ro = new ResizeObserver(paint);
	ro.observe(stage);
	sync();
	return {
		reset,
		paint,
		setEnabled(value) {
			releaseGesture();
			enabled = value;
			hover = null;
			mode = value ? draftMode || lastTool : "navigate";
			sync();
		},
		hasDraft: () => points.length > 0,
		getDraft: () => ({
			mode: draftMode,
			points: points.map((p) => [...p]),
			frame: JSON.parse(JSON.stringify(frame))
		}),
		destroy() {
			ro.disconnect();
			document.removeEventListener("keydown", key, true);
			overlay.remove();
			status.remove();
			tools.remove();
			panel.remove();
		}
	};
}
//#endregion
//#region src/generate/point-edit-model.js
/** Immutable point entities. History shares original typed arrays and copies only changed masks. */
function editCloudCheck(cloud) {
	const n = cloud?.count;
	if (!Number.isSafeInteger(n) || n < 1 || !cloud.positions || cloud.positions.length !== n * 3) throw Error("无效点云 / Invalid point cloud");
	if (!Array.from({ length: 3 }, (_, k) => Number.isFinite(cloud.positions[k])).every(Boolean)) throw Error("Invalid coordinates");
	for (const values of Object.values(cloud.fields || {})) if (values.length !== n) throw Error("属性长度不匹配 / Field length mismatch");
	if (cloud.rgb && cloud.rgb.length !== n * 3) throw Error("RGB length mismatch");
	return cloud;
}
function editSubset(cloud, indices) {
	const count = indices.length, positions = new Float64Array(count * 3), rgb = cloud.rgb ? new Float32Array(count * 3) : null, fields = Object.create(null);
	for (const name of Object.keys(cloud.fields || {})) fields[name] = new Float64Array(count);
	for (let j = 0; j < count; j++) {
		const i = indices[j];
		positions.set(cloud.positions.subarray(i * 3, i * 3 + 3), j * 3);
		if (rgb) rgb.set(cloud.rgb.subarray(i * 3, i * 3 + 3), j * 3);
		for (const name of Object.keys(fields)) fields[name][j] = cloud.fields[name][i];
	}
	return {
		...cloud,
		count,
		totalCount: count,
		positions,
		rgb,
		fields,
		bounds: void 0,
		processing: {
			tool: "point-edit",
			sourceCount: cloud.count
		},
		columnOrder: cloud.columnOrder ? [...cloud.columnOrder] : void 0
	};
}
function editIndices(entity, selection = null, selectedOnly = false) {
	const out = [];
	for (let i = 0; i < entity.cloud.count; i++) if (!entity.deleted?.[i] && (!selectedOnly || selection?.[i])) out.push(i);
	return out;
}
function editLiveCount(entity) {
	if (!entity.deleted) return entity.cloud.count;
	let n = 0;
	for (const v of entity.deleted) n += v === 0;
	return n;
}
function editEntityBytes(entities) {
	const seen = /* @__PURE__ */ new Set();
	let bytes = 0;
	for (const e of entities) for (const a of [
		e.deleted,
		e.cloud.positions,
		e.cloud.rgb,
		...Object.values(e.cloud.fields || {})
	]) if (a?.buffer && !seen.has(a.buffer)) {
		seen.add(a.buffer);
		bytes += a.buffer.byteLength;
	}
	return bytes;
}
var PointEditModel = class {
	constructor() {
		this.entities = [];
		this.active = null;
		this.selection = /* @__PURE__ */ new Map();
		this.selectionStamp = 0;
		this.countCache = null;
		this.past = [];
		this.future = [];
		this.next = 1;
	}
	scope(all = false) {
		return this.entities.filter((e) => e.visible && (all || e.id === this.active));
	}
	commit(next) {
		if (next === this.entities) return;
		this.past.push(this.entities);
		this.future = [];
		this.entities = next;
		while (this.past.length > 20 || this.past.length > 1 && editEntityBytes([...this.entities, ...this.past.flat()]) > 268435456) this.past.shift();
		this.clearSelection();
		if (!next.some((e) => e.id === this.active)) this.active = next[0]?.id ?? null;
	}
	add(cloud, name, { recipe = null, color = null } = {}) {
		if (this.entities.length >= 200) throw Error("最多 200 个对象 / At most 200 objects");
		editCloudCheck(cloud);
		const entity = {
			id: this.next++,
			name: String(name).slice(0, 160),
			visible: true,
			cloud,
			deleted: null,
			recipe,
			frozen: !recipe,
			color
		};
		this.commit([...this.entities, entity]);
		this.active = entity.id;
		return entity;
	}
	update(id, patch) {
		this.commit(this.entities.map((e) => e.id === id ? {
			...e,
			...patch
		} : e));
	}
	remove(id) {
		this.commit(this.entities.filter((e) => e.id !== id));
	}
	undo() {
		if (!this.past.length) return false;
		this.future.push(this.entities);
		this.entities = this.past.pop();
		this.clearSelection();
		if (!this.entities.some((e) => e.id === this.active)) this.active = this.entities[0]?.id ?? null;
		return true;
	}
	redo() {
		if (!this.future.length) return false;
		this.past.push(this.entities);
		this.entities = this.future.pop();
		this.clearSelection();
		if (!this.entities.some((e) => e.id === this.active)) this.active = this.entities[0]?.id ?? null;
		return true;
	}
	clearSelection() {
		this.selection.clear();
		this.selectionStamp++;
	}
	selectedCount() {
		if (this.countCache?.entities === this.entities && this.countCache.stamp === this.selectionStamp) return this.countCache.n;
		let n = 0;
		for (const e of this.entities) {
			if (!e.visible) continue;
			const mask = this.selection.get(e.id);
			if (mask) {
				for (let i = 0; i < mask.length; i++) if (mask[i] && !e.deleted?.[i]) n++;
			}
		}
		this.countCache = {
			entities: this.entities,
			stamp: this.selectionStamp,
			n
		};
		return n;
	}
	setSelection(hits, mode = "replace") {
		this.selectionStamp++;
		if (mode === "replace") this.clearSelection();
		for (const [id, hit] of hits) {
			const entity = this.entities.find((e) => e.id === id && e.visible);
			if (!entity) continue;
			const mask = mode === "replace" ? new Uint8Array(entity.cloud.count) : (this.selection.get(id) || new Uint8Array(entity.cloud.count)).slice();
			for (let i = 0; i < mask.length; i++) if (hit[i] && !entity.deleted?.[i]) mask[i] = mode === "subtract" ? 0 : 1;
			this.selection.set(id, mask);
		}
	}
	selectAll(all = false, invert = false) {
		const hits = /* @__PURE__ */ new Map();
		for (const e of this.scope(all)) {
			const old = this.selection.get(e.id), mask = new Uint8Array(e.cloud.count);
			for (let i = 0; i < mask.length; i++) mask[i] = !e.deleted?.[i] && (!invert || !old?.[i]) ? 1 : 0;
			hits.set(e.id, mask);
		}
		this.setSelection(hits);
	}
	deleteSelected({ keep = false, all = false } = {}) {
		if (!this.selectedCount()) return false;
		const ids = new Set(this.scope(all).map((e) => e.id));
		const next = this.entities.map((e) => {
			if (!ids.has(e.id)) return e;
			const selected = this.selection.get(e.id), deleted = e.deleted ? e.deleted.slice() : new Uint8Array(e.cloud.count);
			let changed = false;
			for (let i = 0; i < deleted.length; i++) if (!deleted[i] && (keep ? !selected?.[i] : selected?.[i])) {
				deleted[i] = 1;
				changed = true;
			}
			return changed ? {
				...e,
				deleted,
				frozen: true
			} : e;
		});
		if (next.every((e, i) => e === this.entities[i])) return false;
		this.commit(next);
		return true;
	}
	restore(id) {
		if (this.entities.find((e) => e.id === id)?.deleted) this.update(id, { deleted: null });
	}
	extract() {
		const sources = this.entities.filter((e) => e.visible && this.selection.get(e.id)?.some((v, i) => v && !e.deleted?.[i]));
		if (this.entities.length + sources.length > 200) throw Error("最多 200 个对象 / At most 200 objects");
		const additions = [];
		for (const e of this.entities) {
			if (!e.visible) continue;
			const indices = editIndices(e, this.selection.get(e.id), true);
			if (indices.length) additions.push({
				id: this.next++,
				name: `${e.name} · selection`,
				visible: true,
				cloud: editSubset(e.cloud, indices),
				deleted: null,
				recipe: null,
				frozen: true,
				color: e.color
			});
		}
		if (additions.length) {
			this.commit([...this.entities, ...additions]);
			this.active = additions[0].id;
		}
		return additions.length;
	}
	colorSelected(rgb) {
		const next = this.entities.map((e) => {
			const mask = this.selection.get(e.id);
			if (!e.visible || !mask?.some(Boolean)) return e;
			const color = e.cloud.rgb ? e.cloud.rgb.slice() : new Float32Array(e.cloud.count * 3).fill(.6), fields = { ...e.cloud.fields };
			const keys = e.cloud.processing?.paintKeys || [
				"red",
				"green",
				"blue"
			].map((role) => {
				let key = `editor_${role}`;
				while (Object.hasOwn(fields, key)) key += "1";
				return key;
			});
			for (let i = 0; i < mask.length; i++) if (mask[i] && !e.deleted?.[i]) color.set(rgb, i * 3);
			for (let k = 0; k < 3; k++) fields[keys[k]] = Float64Array.from({ length: e.cloud.count }, (_, i) => color[i * 3 + k]);
			const semantics = defaultPointSettings({
				...e.cloud,
				fields
			});
			for (const key of Object.keys(semantics.tags)) if ([
				"red",
				"green",
				"blue"
			].includes(semantics.tags[key])) semantics.tags[key] = "scalar";
			keys.forEach((key, i) => semantics.tags[key] = [
				"red",
				"green",
				"blue"
			][i]);
			semantics.rgbScale = "1";
			semantics.colorSpace = "rgb";
			const cloud = {
				...e.cloud,
				rgb: color,
				fields,
				semantics,
				columnOrder: semantics.order,
				processing: {
					...e.cloud.processing,
					paintKeys: keys
				}
			};
			return {
				...e,
				cloud,
				frozen: true
			};
		});
		this.commit(next);
	}
	replace(entities) {
		this.commit(entities);
		this.next = Math.max(this.next, ...entities.map((e) => e.id + 1));
	}
};
//#endregion
//#region src/generate/point-selection.js
function editInsidePolygon(x, y, path) {
	let inside = false;
	for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
		const [a, b] = path[i], [c, d] = path[j];
		if (b > y !== d > y && x < (c - a) * (y - b) / (d - b) + a) inside = !inside;
	}
	return inside;
}
/** Select full-resolution data, not preview indices. Explicitly projects through all depth layers. */
async function editSelectProjected(entities, spec, origin, shape, { signal, onProgress = () => {} } = {}) {
	const result = /* @__PURE__ */ new Map();
	let processed = 0, total = entities.reduce((s, e) => s + e.cloud.count, 0);
	for (const e of entities) {
		const mask = new Uint8Array(e.cloud.count), p = e.cloud.positions;
		for (let start = 0; start < e.cloud.count; start += 12e3) {
			if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
			const end = Math.min(e.cloud.count, start + 12e3);
			for (let i = start; i < end; i++) {
				if (e.deleted?.[i]) continue;
				const z = p[i * 3 + 2];
				if (shape.zMin !== null && z < shape.zMin || shape.zMax !== null && z > shape.zMax) continue;
				const pixel = gsProjectPosition([
					p[i * 3] - origin[0],
					p[i * 3 + 1] - origin[1],
					z - origin[2]
				], spec);
				if (!pixel || pixel.depth <= spec.near || pixel.x < 0 || pixel.y < 0 || pixel.x > spec.width || pixel.y > spec.height) continue;
				if (shape.type === "box" ? pixel.x >= shape.x0 && pixel.x <= shape.x1 && pixel.y >= shape.y0 && pixel.y <= shape.y1 : editInsidePolygon(pixel.x, pixel.y, shape.path)) mask[i] = 1;
			}
			processed += end - start;
			onProgress(processed, total);
			await new Promise((r) => setTimeout(r, 0));
		}
		result.set(e.id, mask);
	}
	return result;
}
//#endregion
//#region src/generate/selection-controls.js
/** Overlay input is isolated from camera orbit; all edits operate on stable source indices. */
function mountPointSelection({ viewer, model, container, onSelection, onError, onBusy, isBusy = () => false }) {
	const en = document.documentElement.lang === "en", tr = (a, b) => en ? b : a, el = (tag, text) => {
		const e = document.createElement(tag);
		if (text) e.textContent = text;
		return e;
	};
	const overlay = el("canvas");
	overlay.className = "edit-overlay";
	overlay.setAttribute("aria-label", tr("点云选区画布", "Point selection canvas"));
	overlay.tabIndex = 0;
	viewer.canvas.parentElement.append(overlay);
	const ctx = overlay.getContext("2d");
	let highlightCache = null, enabled = false, drag = null, path = [], controller = null, shapeType = "box";
	const row = (title, input) => {
		const l = el("label", title);
		input.setAttribute("aria-label", title);
		l.append(input);
		container.append(l);
		return input;
	};
	const tools = row(tr("选区形状", "Selection shape"), el("select"));
	for (const [value, label] of [["box", tr("矩形框选", "Rectangle")], ["lasso", tr("自由套索", "Freehand lasso")]]) {
		const o = el("option", label);
		o.value = value;
		tools.append(o);
	}
	tools.onchange = () => {
		shapeType = tools.value;
	};
	const operation = row(tr("选择方式", "Selection operation"), el("select"));
	for (const [value, label] of [
		["replace", tr("替换选区", "Replace")],
		["add", tr("追加（Shift）", "Add (Shift)")],
		["subtract", tr("减选（Ctrl）", "Subtract (Ctrl)")]
	]) {
		const o = el("option", label);
		o.value = value;
		operation.append(o);
	}
	const scope = row(tr("作用对象", "Selection scope"), el("select"));
	for (const [value, label] of [["active", tr("当前对象", "Active object")], ["visible", tr("全部显示对象", "All visible objects")]]) {
		const o = el("option", label);
		o.value = value;
		scope.append(o);
	}
	scope.onchange = () => {
		model.clearSelection();
		onSelection();
		paint();
	};
	const zgroup = el("details"), sum = el("summary", tr("限制 Z 高度范围", "Limit Z range"));
	zgroup.append(sum);
	container.append(zgroup);
	const zmin = el("input"), zmax = el("input");
	for (const [input, label] of [[zmin, tr("最低 Z（留空不限）", "Minimum Z (blank = any)")], [zmax, tr("最高 Z（留空不限）", "Maximum Z (blank = any)")]]) {
		input.type = "number";
		input.step = "any";
		input.placeholder = "—";
		input.setAttribute("aria-label", label);
		const l = el("label", label);
		l.append(input);
		zgroup.append(l);
	}
	const hint = el("p", tr("穿透选择：范围内前后各层都会选中，包含未显示的抽稀点。粉色表示选中；旋转检查或限制 Z 后再删除。Esc 取消正在框选。", "Through-depth selection includes all layers and full-resolution points. Pink marks selection. Rotate to inspect or limit Z before deleting. Esc cancels a selection gesture."));
	hint.className = "tool-help";
	container.append(hint);
	const count = el("p");
	count.className = "selection-count";
	count.setAttribute("role", "status");
	container.append(count);
	function paint() {
		const w = viewer.canvas.clientWidth, h = viewer.canvas.clientHeight;
		if (!w || !h) return;
		const d = Math.min(devicePixelRatio || 1, 2);
		if (overlay.width !== Math.round(w * d) || overlay.height !== Math.round(h * d)) {
			overlay.width = Math.round(w * d);
			overlay.height = Math.round(h * d);
		}
		ctx.setTransform(d, 0, 0, d, 0, 0);
		ctx.clearRect(0, 0, w, h);
		overlay.style.pointerEvents = enabled ? "auto" : "none";
		overlay.hidden = !!viewer.fly?.active;
		if (overlay.hidden) return;
		const spec = gsViewSpec(viewer, w, h), n = model.selectedCount();
		count.textContent = tr(`已选 ${n.toLocaleString()} 点`, `Selected ${n.toLocaleString()} points`);
		const stride = Math.max(1, Math.ceil(n / 3e4));
		let k = 0;
		ctx.fillStyle = "#f23888";
		if (highlightCache?.entities !== model.entities || highlightCache.stamp !== model.selectionStamp) {
			const points = [];
			for (const e of model.entities) {
				if (!e.visible) continue;
				const mask = model.selection.get(e.id);
				if (!mask) continue;
				for (let i = 0; i < mask.length; i++) {
					if (!mask[i] || e.deleted?.[i]) continue;
					if (k++ % stride === 0) points.push([e, i]);
				}
			}
			highlightCache = {
				entities: model.entities,
				stamp: model.selectionStamp,
				points
			};
		}
		for (const [e, i] of highlightCache.points) {
			const p = gsProjectPosition([
				0,
				1,
				2
			].map((a) => e.cloud.positions[i * 3 + a] - viewer.origin[a]), spec);
			if (p && p.depth > spec.near) ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
		}
		if (path.length) {
			ctx.beginPath();
			if (shapeType === "box") {
				const a = path[0], b = path[path.length - 1];
				ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
			} else {
				path.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p));
				ctx.closePath();
			}
			ctx.fillStyle = "#f2388822";
			ctx.strokeStyle = "#d93479";
			ctx.lineWidth = 1.5;
			ctx.fill();
			ctx.stroke();
		}
	}
	const point = (e) => {
		const r = overlay.getBoundingClientRect();
		return [e.clientX - r.left, e.clientY - r.top];
	};
	overlay.addEventListener("pointerdown", (e) => {
		if (!enabled || isBusy() || controller || drag !== null || e.button !== 0) return;
		viewer.stopNavigation?.();
		e.preventDefault();
		overlay.focus();
		drag = e.pointerId;
		path = [point(e)];
		overlay.setPointerCapture(e.pointerId);
		paint();
	});
	overlay.addEventListener("pointermove", (e) => {
		if (drag !== e.pointerId) return;
		const p = point(e), last = path[path.length - 1];
		if (shapeType === "box") path = [path[0], p];
		else if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 3 && path.length < 2048) path.push(p);
		paint();
	});
	const end = async (e) => {
		if (drag !== e.pointerId) return;
		drag = null;
		if (overlay.hasPointerCapture(e.pointerId)) overlay.releasePointerCapture(e.pointerId);
		if (e.type !== "pointerup") {
			path = [];
			paint();
			return;
		}
		const p = point(e);
		if (shapeType === "box") path = [path[0], p];
		const a = path[0], b = path[path.length - 1];
		if (path.length < 2 || shapeType === "box" && Math.hypot(a[0] - b[0], a[1] - b[1]) < 3) {
			path = [];
			paint();
			return;
		}
		const range = (input) => input.value.trim() === "" ? null : Number(input.value), zMin = range(zmin), zMax = range(zmax);
		if (zMin !== null && !Number.isFinite(zMin) || zMax !== null && !Number.isFinite(zMax) || zMin !== null && zMax !== null && zMin > zMax) {
			onError(tr("Z 范围无效", "Invalid Z range"));
			path = [];
			paint();
			return;
		}
		const shape = {
			type: shapeType,
			path: [...path],
			x0: Math.min(a[0], b[0]),
			x1: Math.max(a[0], b[0]),
			y0: Math.min(a[1], b[1]),
			y1: Math.max(a[1], b[1]),
			zMin,
			zMax
		}, mode = e.ctrlKey || e.metaKey ? "subtract" : e.shiftKey ? "add" : operation.value;
		controller = new AbortController();
		onBusy(true);
		try {
			const hits = await editSelectProjected(model.scope(scope.value === "visible"), gsViewSpec(viewer, viewer.canvas.clientWidth, viewer.canvas.clientHeight), [...viewer.origin], shape, {
				signal: controller.signal,
				onProgress: (n, total) => {
					count.textContent = tr(`正在选择 ${Math.round(n / total * 100)}%`, `Selecting ${Math.round(n / total * 100)}%`);
				}
			});
			model.setSelection(hits, mode);
			onSelection();
		} catch (err) {
			if (err.name !== "AbortError") onError(err.message);
		} finally {
			controller = null;
			path = [];
			onBusy(false);
			paint();
		}
	};
	overlay.addEventListener("pointerup", end);
	overlay.addEventListener("pointercancel", end);
	overlay.addEventListener("lostpointercapture", (e) => {
		if (drag === e.pointerId) {
			drag = null;
			path = [];
			paint();
		}
	});
	overlay.addEventListener("contextmenu", (e) => e.preventDefault());
	const key = (e) => {
		if (e.key === "Escape" && (controller || drag !== null)) {
			controller?.abort();
			drag = null;
			path = [];
			paint();
		}
	};
	document.addEventListener("keydown", key, true);
	const old = viewer.onViewChange;
	viewer.onViewChange = (...args) => {
		old?.(...args);
		paint();
	};
	const ro = new ResizeObserver(paint);
	ro.observe(viewer.canvas.parentElement);
	return {
		setEnabled(value) {
			enabled = value;
			path = [];
			paint();
		},
		get all() {
			return scope.value === "visible";
		},
		paint,
		cancel() {
			controller?.abort();
			drag = null;
			path = [];
			paint();
		},
		destroy() {
			controller?.abort();
			ro.disconnect();
			document.removeEventListener("keydown", key, true);
			overlay.remove();
		}
	};
}
//#endregion
//#region src/generate/editor-project.js
var EDIT_PROJECT_FORMAT = "BuildingWebViewer.point-editor";
var EDIT_PROJECT_LIMIT = 536870912;
function editorMeta(e) {
	return {
		id: e.id,
		name: e.name,
		visible: e.visible,
		recipe: e.recipe || null,
		frozen: !!e.frozen,
		color: e.color || null
	};
}
function editorCloudMeta(c) {
	return {
		count: c.count,
		totalCount: c.count,
		columnOrder: c.columnOrder,
		semantics: c.semantics,
		processing: c.processing
	};
}
function editorValidateEntities(entities) {
	if (!Array.isArray(entities) || entities.length > 200) throw Error("项目最多 200 个对象 / Project supports at most 200 objects");
	const ids = /* @__PURE__ */ new Set();
	let bytes = 0;
	for (const e of entities) {
		if (!Number.isSafeInteger(e.id) || e.id < 1 || ids.has(e.id) || typeof e.name !== "string" || e.name.length > 160 || typeof e.visible !== "boolean") throw Error("Invalid project object");
		ids.add(e.id);
		editCloudCheck(e.cloud);
		if (e.recipe) genCheck(e.recipe);
		if (e.color && (!Array.isArray(e.color) || e.color.length !== 3 || !e.color.every((v) => Number.isFinite(v) && v >= 0 && v <= 1))) throw Error("Invalid object color");
		if (e.deleted && (!(e.deleted instanceof Uint8Array) || e.deleted.length !== e.cloud.count || e.deleted.some((v) => v > 1))) throw Error("Invalid deletion mask");
		for (const a of [
			e.cloud.positions,
			e.cloud.rgb,
			...Object.values(e.cloud.fields || {}),
			e.deleted
		]) if (a) {
			bytes += a.byteLength;
			if (bytes > EDIT_PROJECT_LIMIT) throw Error("项目超过 512 MB / Project exceeds 512 MB");
		}
	}
	return entities;
}
/** Portable binary container: bounded JSON descriptors followed by typed-array blocks. */
function editorProjectBlob(entities) {
	editorValidateEntities(entities);
	const blocks = [];
	let offset = 0;
	const array = (a) => {
		if (!a) return null;
		const type = a instanceof Float64Array ? "f64" : a instanceof Float32Array ? "f32" : a instanceof Uint8Array ? "u8" : null;
		if (!type) throw Error("Unsupported point array");
		const d = {
			type,
			length: a.length,
			offset,
			bytes: a.byteLength
		};
		blocks.push(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
		offset += a.byteLength;
		return d;
	};
	const objects = entities.map((e) => ({
		...editorMeta(e),
		deleted: array(e.deleted),
		cloud: {
			...editorCloudMeta(e.cloud),
			positions: array(e.cloud.positions),
			rgb: array(e.cloud.rgb),
			fields: Object.fromEntries(Object.entries(e.cloud.fields || {}).map(([k, v]) => [k, array(v)]))
		}
	}));
	const header = new TextEncoder().encode(JSON.stringify({
		format: EDIT_PROJECT_FORMAT,
		version: 1,
		objects
	}));
	if (header.length > 4194304) throw Error("Project metadata too large");
	const size = /* @__PURE__ */ new Uint8Array(4);
	new DataView(size.buffer).setUint32(0, header.length, true);
	return new Blob([
		size,
		header,
		...blocks
	], { type: "application/octet-stream" });
}
async function editorReadProject(file) {
	if (file.size < 4 || file.size > 541065216) throw Error("项目文件大小无效 / Invalid project size");
	const len = new DataView(await file.slice(0, 4).arrayBuffer()).getUint32(0, true);
	if (len > 4194304 || len + 4 > file.size) throw Error("Invalid project header");
	const meta = JSON.parse(await file.slice(4, 4 + len).text());
	if (meta.format !== EDIT_PROJECT_FORMAT || meta.version !== 1 || !Array.isArray(meta.objects) || meta.objects.length > 200) throw Error("不是点云编辑项目 / Invalid point editor project");
	let expectedOffset = 0;
	const array = async (d, expected = null) => {
		if (d === null) return null;
		const T = {
			f64: Float64Array,
			f32: Float32Array,
			u8: Uint8Array
		}[d?.type];
		if (!T || !Number.isSafeInteger(d.length) || d.length < 0 || d.offset !== expectedOffset || d.bytes !== d.length * T.BYTES_PER_ELEMENT || expected !== null && d.length !== expected || d.offset + d.bytes > file.size - 4 - len) throw Error("Invalid project array");
		expectedOffset += d.bytes;
		return new T(await file.slice(4 + len + d.offset, 4 + len + d.offset + d.bytes).arrayBuffer());
	};
	const entities = [];
	for (const e of meta.objects) {
		const n = e.cloud?.count;
		if (!Number.isSafeInteger(n) || n < 1 || n > EDIT_PROJECT_LIMIT / 24) throw Error("Invalid point count");
		const deleted = await array(e.deleted, n), positions = await array(e.cloud.positions, n * 3), rgb = await array(e.cloud.rgb, n * 3), fields = Object.create(null);
		for (const [k, v] of Object.entries(e.cloud.fields || {})) fields[k] = await array(v, n);
		const cloud = {
			...e.cloud,
			positions,
			rgb,
			fields
		};
		if (!(positions instanceof Float64Array) || rgb && !(rgb instanceof Float32Array)) throw Error("Invalid coordinate array");
		for (const x of positions) if (!Number.isFinite(x)) throw Error("Non-finite coordinate");
		entities.push({
			...editorMeta(e),
			deleted,
			cloud
		});
	}
	if (expectedOffset !== file.size - 4 - len) throw Error("Trailing or missing project bytes");
	return editorValidateEntities(entities);
}
async function editorDB() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open("BuildingWebViewer.point-editor", 1);
		req.onupgradeneeded = () => req.result.createObjectStore("projects");
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}
async function editorSaveLocal(entities) {
	const db = await editorDB();
	try {
		await new Promise((resolve, reject) => {
			const tx = db.transaction("projects", "readwrite");
			tx.objectStore("projects").put({
				format: EDIT_PROJECT_FORMAT,
				version: 1,
				entities
			}, "current");
			tx.oncomplete = resolve;
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}
async function editorLoadLocal() {
	const db = await editorDB();
	try {
		return await new Promise((resolve, reject) => {
			const r = db.transaction("projects").objectStore("projects").get("current");
			r.onsuccess = () => {
				try {
					resolve(r.result ? editorValidateEntities(r.result.entities) : null);
				} catch (e) {
					reject(e);
				}
			};
			r.onerror = () => reject(r.error);
		});
	} finally {
		db.close();
	}
}
//#endregion
//#region src/generate/app.js
async function editorBoot() {
	initializeLocale();
	const $ = (id) => document.getElementById(id), en = document.documentElement.lang === "en", tr = (a, b) => en ? b : a;
	const el = (tag, text, cls) => {
		const e = document.createElement(tag);
		if (text) e.textContent = text;
		if (cls) e.className = cls;
		return e;
	};
	let nativeSession = null;
	const nativeSources = /* @__PURE__ */ new Set();
	const nativeApp = isMobileApp();
	const model = new PointEditModel(), cache = /* @__PURE__ */ new WeakMap();
	let serial = 0, seen = false, busy = false, selectionBusy = false, workflow = "navigate", drawing, selection, saving = false, saveAgain = false, unsaved = false;
	const palette = [
		[
			.3,
			.57,
			.53
		],
		[
			.73,
			.43,
			.28
		],
		[
			.43,
			.53,
			.72
		],
		[
			.64,
			.43,
			.68
		]
	];
	const error = (text) => {
		$("error").hidden = !text;
		$("error").querySelector("span").textContent = text || "";
	};
	const note = (text) => {
		$("data-notes").textContent = text || "";
	};
	const loading = (text) => {
		$("loading").hidden = !text;
		$("loading").querySelector("span").textContent = text || "";
	};
	const viewer = new CloudViewer($("scene"), { onError: error });
	viewer.setOptions({
		colorMode: "rgb",
		pointSize: 3,
		pointRatio: 100,
		showWire: false,
		showPoints: true
	});
	const blocked = () => busy || selectionBusy;
	const draftGuard = () => {
		if (drawing?.hasDraft()) {
			error(tr("先完成或取消当前绘制草稿。", "Finish or cancel the drawing draft first."));
			return true;
		}
		return false;
	};
	function getLive(entity) {
		if (!entity.deleted) return entity.cloud;
		return editSubset(entity.cloud, editIndices(entity));
	}
	function preview(entity) {
		if (cache.has(entity)) return cache.get(entity);
		const indices = editIndices(entity), stride = Math.max(1, Math.ceil(indices.length / 12e4));
		const cloud = !entity.deleted && stride === 1 ? entity.cloud : editSubset(entity.cloud, indices.filter((_, i) => i % stride === 0));
		const item = {
			key: `editor-${++serial}`,
			name: entity.name,
			cloud,
			color: entity.color || palette[entity.id % palette.length]
		};
		cache.set(entity, item);
		return item;
	}
	async function autosave() {
		if (nativeApp) {
			nativeSession?.schedule();
			return;
		}
		if (saving) {
			saveAgain = true;
			return;
		}
		saving = true;
		const snapshot = model.entities;
		try {
			await editorSaveLocal(snapshot);
			if (snapshot === model.entities) unsaved = false;
			$("editor-save-status").textContent = tr("已保存到本机浏览器", "Saved in this browser");
		} catch {
			$("editor-save-status").textContent = tr("自动保存失败，请保存项目文件", "Autosave unavailable — save a project file");
		} finally {
			saving = false;
			if (saveAgain) {
				saveAgain = false;
				autosave();
			}
		}
	}
	function checkpoint() {
		unsaved = true;
		$("editor-save-status").textContent = nativeApp ? tr("待自动保存", "Pending autosave") : tr("正在保存…", "Saving…");
		autosave();
	}
	function buttons() {
		document.querySelectorAll("[data-workflow],.gs-fly-entry").forEach((b) => b.disabled = blocked());
		const n = model.selectedCount();
		for (const id of [
			"edit-delete",
			"edit-keep",
			"edit-extract",
			"edit-paint"
		]) if ($(id)) $(id).disabled = blocked() || !n;
		for (const id of ["editor-export", "editor-handoff"]) $(id).disabled = blocked() || !model.entities.some((e) => e.visible && editLiveCount(e));
		$("editor-undo").disabled = blocked() || !model.past.length;
		$("editor-redo").disabled = blocked() || !model.future.length;
		const s = $("editor-selection-count");
		if (s) s.textContent = tr(`已选 ${n.toLocaleString()} 点`, `Selected ${n.toLocaleString()} points`);
	}
	function projectList() {
		const list = $("editor-objects");
		list.replaceChildren();
		for (const e of model.entities) {
			const row = el("div", null, "editor-object");
			row.classList.toggle("active", e.id === model.active);
			row.setAttribute("role", "listitem");
			const check = el("input");
			check.type = "checkbox";
			check.checked = e.visible;
			check.setAttribute("aria-label", tr(`显示 ${e.name}`, `Show ${e.name}`));
			check.onchange = () => {
				if (blocked()) {
					check.checked = e.visible;
					return;
				}
				model.update(e.id, { visible: check.checked });
				changed();
			};
			const choose = el("button");
			choose.className = "editor-object-name";
			choose.setAttribute("aria-pressed", String(e.id === model.active));
			choose.append(el("strong", e.name), el("small", `${editLiveCount(e).toLocaleString()} ${tr("点", "points")} · ${e.recipe ? tr(e.frozen ? "已修订" : "绘制", "Drawn") : tr("导入 / 提取", "Imported / extracted")}`));
			choose.onclick = () => {
				if (blocked()) return;
				model.active = e.id;
				model.clearSelection();
				projectList();
				properties();
				buttons();
				selection.paint();
				$("current-title").textContent = e.name;
			};
			row.append(check, choose);
			list.append(row);
		}
		if (!model.entities.length) list.append(el("p", tr("还没有对象。导入文件，或从绘制开始。", "No objects yet. Import files or start drawing."), "tool-help"));
		$("item-count").textContent = String(model.entities.length);
	}
	function refresh({ fit = false } = {}) {
		const items = model.entities.filter((e) => e.visible && editLiveCount(e)).map(preview);
		viewer.setClouds(items, { preserveView: seen && !fit });
		seen = items.length > 0;
		const total = model.entities.filter((e) => e.visible).reduce((n, e) => n + editLiveCount(e), 0), shown = items.reduce((n, i) => n + i.cloud.count, 0);
		$("scene-stats").textContent = tr(`${model.entities.length} 个对象 · ${total.toLocaleString()} 点${shown < total ? ` · 预览 ${shown.toLocaleString()} 点` : ""}`, `${model.entities.length} objects · ${total.toLocaleString()} points${shown < total ? ` · Preview ${shown.toLocaleString()}` : ""}`);
		$("current-title").textContent = model.entities.find((e) => e.id === model.active)?.name || tr("点云工作台", "Point-cloud workspace");
		$("empty-state").hidden = items.length > 0 || workflow === "create";
		$("screenshot").disabled = !total;
		projectList();
		properties();
		buttons();
		drawing?.paint();
		selection?.paint();
	}
	function changed(options) {
		error("");
		checkpoint();
		refresh(options);
	}
	const row = (box, label, input) => {
		const l = el("label", label);
		input.setAttribute("aria-label", label);
		l.append(input);
		box.append(l);
		return input;
	};
	const newSettings = $("editor-new-sampling");
	newSettings.className = "tool-section";
	newSettings.append(el("h3", tr("新点云采样", "New cloud sampling")));
	const spacing = row(newSettings, tr("生成间距", "Generation spacing"), el("input"));
	spacing.type = "number";
	spacing.min = ".000001";
	spacing.step = "any";
	spacing.value = ".25";
	const genColor = row(newSettings, tr("生成颜色", "Generation color"), el("input"));
	genColor.type = "color";
	genColor.value = "#4c9287";
	function properties() {
		const box = $("editor-properties");
		box.replaceChildren();
		box.className = "tool-section";
		box.append(el("h3", tr("当前对象", "Active object")));
		const e = model.entities.find((e) => e.id === model.active);
		if (!e) {
			box.append(el("p", tr("从左侧选择对象查看属性。", "Select an object on the left."), "tool-help"));
			return;
		}
		const name = row(box, tr("对象名称", "Object name"), el("input"));
		name.value = e.name;
		name.maxLength = 160;
		name.onchange = () => {
			if (!blocked()) {
				model.update(e.id, { name: name.value.trim() || e.name });
				changed();
			}
		};
		box.append(el("p", `${editLiveCount(e).toLocaleString()} / ${e.cloud.count.toLocaleString()} ${tr("点保留", "points retained")}`, "object-stat"));
		const fields = el("div", null, "field-chips");
		for (const key of [
			"X",
			"Y",
			"Z",
			...Object.keys(e.cloud.fields || {}).slice(0, 12)
		]) fields.append(el("span", key));
		box.append(fields);
		if (Object.keys(e.cloud.fields || {}).length > 12) box.append(el("p", tr("其余属性也会保留在导出中。", "Additional fields are preserved on export."), "tool-help"));
		if (e.recipe) {
			const detail = el("details"), summary = el("summary", tr("原绘制轮廓与重新采样", "Drawing recipe & resampling"));
			detail.append(summary);
			box.append(detail);
			detail.append(el("p", tr("点级修改不会被重新生成覆盖。调整这里的参数，生成一个新副本；当前点云保持不变。", "Point edits are never regenerated away. These settings create a new copy; the current cloud stays unchanged."), "tool-help"));
			let vertices = null;
			if (e.recipe.shape.points) {
				vertices = row(detail, tr("轮廓 XYZ（每行一个顶点）", "Contour XYZ (one vertex per line)"), el("textarea"));
				vertices.rows = 5;
				vertices.value = e.recipe.shape.points.map((p) => p.join(" ")).join("\n");
			}
			const sample = row(detail, tr("副本采样间距", "Copy spacing"), el("input"));
			sample.type = "number";
			sample.step = "any";
			sample.value = e.recipe.sampling.spacing;
			let height = null, fill = null;
			if (e.recipe.shape.type === "extrusion") {
				height = row(detail, tr("副本拉伸高度", "Copy extrusion height"), el("input"));
				height.type = "number";
				height.step = "any";
				height.value = e.recipe.shape.height;
				fill = row(detail, tr("副本体采样", "Copy volume sampling"), el("select"));
				for (const [v, text] of [["surface", tr("表面", "Surface")], ["volume", tr("体积", "Volume")]]) {
					const o = el("option", text);
					o.value = v;
					fill.append(o);
				}
				fill.value = e.recipe.shape.fill;
			}
			const regenerate = el("button", tr("生成新副本", "Generate new copy"));
			regenerate.onclick = () => {
				if (blocked() || draftGuard()) return;
				try {
					const recipe = JSON.parse(JSON.stringify(e.recipe));
					if (vertices) recipe.shape.points = vertices.value.trim().split(/\n/).filter((s) => s.trim()).map((s) => s.trim().split(/[\s,]+/).map(Number));
					recipe.sampling.spacing = Number(sample.value);
					if (height) {
						recipe.shape.height = Number(height.value);
						recipe.shape.fill = fill.value;
					}
					genCheck(recipe);
					const cloud = genSample(recipe, { color: e.color || palette[0] });
					model.add(cloud, `${e.name} · ${tr("副本", "copy")}`, {
						recipe,
						color: e.color
					});
					changed();
				} catch (err) {
					error(err.message);
				}
			};
			detail.append(regenerate);
		}
		const actions = el("div", null, "editor-pair");
		const restore = el("button", tr("恢复删除点", "Restore deleted points"));
		restore.disabled = !e.deleted?.some(Boolean);
		restore.onclick = () => {
			if (!blocked()) {
				model.restore(e.id);
				changed();
			}
		};
		const remove = el("button", tr("移除对象", "Remove object"));
		remove.className = "danger-text";
		remove.onclick = () => {
			if (!blocked() && !draftGuard()) {
				model.remove(e.id);
				changed();
			}
		};
		actions.append(restore, remove);
		box.append(actions);
	}
	function setWorkflow(next) {
		if (blocked()) return;
		if (next === "edit" && draftGuard()) return;
		error("");
		workflow = next;
		if (next !== "navigate") viewer.fly?.leave();
		$("empty-state").hidden = next === "create" || model.entities.some((e) => e.visible && editLiveCount(e));
		document.querySelector(".gs-fly-entry").hidden = next !== "navigate";
		viewer.stopNavigation?.();
		drawing.setEnabled(next === "create");
		selection.setEnabled(next === "edit");
		$("editor-create-settings").hidden = next !== "create";
		$("editor-selection-settings").hidden = next !== "edit";
		editbar.hidden = next !== "edit";
		for (const b of document.querySelectorAll("[data-workflow]")) {
			b.classList.toggle("active", b.dataset.workflow === next);
			b.setAttribute("aria-pressed", String(b.dataset.workflow === next));
		}
		if (next === "edit") {
			const trigger = document.querySelector("[data-open-settings=\"tools\"]");
			if (trigger.getAttribute("aria-expanded") !== "true") trigger.click();
		}
		$("geometry-note").textContent = next === "create" ? tr("在工作平面绘制 · 可暂停调整视角", "Draw on the work plane · Pause to adjust the view") : next === "edit" ? tr("穿透选择 · 删除、裁剪或提取", "Through-depth selection · Delete, crop or extract") : tr("拖动旋转 · 草稿可随时继续", "Drag to orbit · Resume your draft at any time");
		const drawingHint = tr("画布用于绘制 · Esc 或“调整视角”暂停 · Enter 生成", "Canvas draws · Esc or Adjust view pauses · Enter generates");
		document.querySelector(".desktop-hint").textContent = next === "create" ? drawingHint : tr("拖动旋转 · 滚轮缩放 · 右键 / Shift 拖动平移 · F 适应窗口", "Drag to orbit · Scroll to zoom · Right / Shift drag to pan · F to fit");
		document.querySelector(".touch-hint").textContent = next === "create" ? tr("单指绘制 · 点“暂停 · 调整视角”后可旋转、缩放与平移", "Draw with one finger · Pause to orbit, zoom and pan") : tr("单指旋转 · 双指缩放与平移", "One finger to orbit · Two fingers to zoom and pan");
		selection.paint();
	}
	mountCameraControls({
		container: $("camera-controls"),
		bookmarkContainer: $("bookmark-controls"),
		getViewers: () => [viewer],
		space: "raw-world"
	});
	mountViewerLayout({ getViewers: () => [viewer] });
	drawing = mountDrawingControls({
		viewer,
		container: $("drawing-controls"),
		toolbar: document.querySelector(".viewer-toolbar"),
		isBusy: blocked,
		onError: error,
		onModeChange: (mode) => setWorkflow(mode === "navigate" ? "navigate" : "create"),
		onCommit: (shape) => {
			if (model.entities.length >= 200) throw Error(tr("最多 200 个对象", "At most 200 objects"));
			const color = genColor.value.match(/\w{2}/g).map((v) => parseInt(v, 16) / 255), recipe = {
				id: model.next,
				name: "drawing",
				visible: true,
				color,
				place: {
					x: 0,
					y: 0,
					z: 0
				},
				shape,
				sampling: {
					spacing: Number(spacing.value),
					pattern: "grid",
					noise: 0,
					seed: 1
				}
			};
			const cloud = genSample(recipe, { color });
			model.add(cloud, `${tr(shape.type === "stroke" ? "绘制线" : shape.type === "polygon" ? "绘制面" : "拉伸体", shape.type)} ${model.next}`, {
				recipe,
				color
			});
			seen = true;
			changed();
		}
	});
	const editbar = el("div", null, "edit-toolbar");
	document.querySelector(".draw-toolbar").after(editbar);
	for (const [id, zh, eng, action] of [
		[
			"edit-all",
			"全选",
			"Select all",
			() => model.selectAll(selection.all)
		],
		[
			"edit-invert",
			"反选",
			"Invert",
			() => model.selectAll(selection.all, true)
		],
		[
			"edit-clear",
			"清空选区",
			"Clear",
			() => model.clearSelection()
		],
		[
			"edit-delete",
			"删除选中",
			"Delete selected",
			() => model.deleteSelected({ all: selection.all })
		],
		[
			"edit-keep",
			"只保留选中",
			"Keep selected",
			() => model.deleteSelected({
				keep: true,
				all: selection.all
			})
		],
		[
			"edit-extract",
			"提取为新对象",
			"Extract",
			() => model.extract()
		]
	]) {
		const b = el("button", tr(zh, eng));
		b.id = id;
		if (id === "edit-delete") b.className = "danger-text";
		b.onclick = () => {
			if (blocked()) return;
			const edit = [
				"edit-delete",
				"edit-keep",
				"edit-extract"
			].includes(id);
			if (edit && draftGuard()) return;
			try {
				const done = action();
				if (edit && done) changed();
				else {
					buttons();
					selection.paint();
				}
			} catch (err) {
				error(err.message);
			}
		};
		editbar.append(b);
	}
	const count = el("span", null, "edit-counter");
	count.id = "editor-selection-count";
	editbar.append(count);
	selection = mountPointSelection({
		viewer,
		model,
		isBusy: blocked,
		container: $("editor-selection-settings"),
		onError: error,
		onSelection: buttons,
		onBusy: (value) => {
			selectionBusy = value;
			buttons();
		}
	});
	const paintbox = el("div", null, "editor-pair"), paintcolor = el("input");
	paintcolor.type = "color";
	paintcolor.value = "#ee853d";
	paintcolor.setAttribute("aria-label", tr("选区颜色", "Selection color"));
	const paint = el("button", tr("选区染色", "Color selection"));
	paint.id = "edit-paint";
	paint.onclick = () => {
		if (blocked() || !model.selectedCount()) return;
		model.colorSelected(paintcolor.value.match(/\w{2}/g).map((v) => parseInt(v, 16) / 255));
		changed();
	};
	paintbox.append(paintcolor, paint);
	$("editor-selection-settings").append(paintbox);
	for (const b of document.querySelectorAll("[data-workflow]")) b.onclick = () => setWorkflow(b.dataset.workflow);
	setWorkflow("navigate");
	for (const [id, action] of [["editor-undo", "undo"], ["editor-redo", "redo"]]) $(id).onclick = () => {
		if (!blocked() && !draftGuard() && model[action]()) changed();
	};
	document.addEventListener("keydown", (e) => {
		if ([
			"INPUT",
			"SELECT",
			"TEXTAREA"
		].includes(e.target.tagName) || viewer.fly?.active || blocked()) return;
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
			e.preventDefault();
			$(e.shiftKey ? "editor-redo" : "editor-undo").click();
		} else if (e.key === "Delete" && workflow === "edit") {
			e.preventDefault();
			$("edit-delete").click();
		}
	});
	async function importFiles(files) {
		if (blocked() || draftGuard()) return;
		const list = [...files].filter((f) => /\.(txt|xyz|pts|csv|ply|pcd)$/i.test(f.name));
		if (!list.length) {
			error(tr("请导入 TXT、XYZ、PLY 或 PCD 点云。", "Import TXT, XYZ, PLY or PCD files."));
			return;
		}
		if (model.entities.length + list.length > 200) {
			error(tr("最多 200 个对象", "At most 200 objects"));
			return;
		}
		busy = true;
		buttons();
		let added = 0;
		try {
			for (const f of list) {
				loading(tr(`读取 ${f.name}`, `Reading ${f.name}`));
				const cloud = await readPointCloud(f, {
					maxPoints: 0,
					onProgress: () => {}
				});
				model.add(cloud, f.name);
				added++;
			}
			changed({ fit: true });
			note(tr(`已导入 ${added} 个点云，属性保留。`, `Imported ${added} clouds with their fields.`));
		} catch (e) {
			if (added) changed({ fit: true });
			error(e.message);
		} finally {
			busy = false;
			loading("");
			buttons();
		}
	}
	$("editor-import").onclick = () => {
		if (blocked() || draftGuard()) return;
		if (nativeSession) nativeSession.pick().catch((e) => error(e.message));
		else $("editor-files").click();
	};
	$("editor-files").onchange = () => {
		const files = [...$("editor-files").files];
		$("editor-files").value = "";
		importFiles(files);
	};
	const zone = document.querySelector(".workspace");
	zone.addEventListener("dragover", (e) => {
		if (e.dataTransfer.types.includes("Files")) {
			e.preventDefault();
			zone.classList.add("editor-drop");
		}
	});
	zone.addEventListener("dragleave", (e) => {
		if (!zone.contains(e.relatedTarget)) zone.classList.remove("editor-drop");
	});
	zone.addEventListener("drop", (e) => {
		e.preventDefault();
		zone.classList.remove("editor-drop");
		importFiles(e.dataTransfer.files);
	});
	$("editor-save").onclick = async () => {
		if (blocked() || draftGuard()) return;
		try {
			await saveLocalBlob(editorProjectBlob(model.entities), "point-workspace.bwvproject");
			note(tr("项目包含源点云、属性与删除状态，可继续修订。", "Project includes source clouds, fields and deletion state."));
		} catch (e) {
			error(e.message);
		}
	};
	$("editor-open").onclick = () => {
		if (blocked() || draftGuard()) return;
		if (nativeSession) nativeSession.pick().catch((e) => error(e.message));
		else $("editor-project-file").click();
	};
	$("editor-project-file").onchange = async () => {
		const file = $("editor-project-file").files[0];
		$("editor-project-file").value = "";
		if (!file || blocked()) return;
		busy = true;
		loading(tr("读取项目…", "Reading project…"));
		try {
			let entities;
			if (/\.json$/i.test(file.name)) {
				if (file.size > 4194304) throw Error("JSON exceeds 4 MB");
				entities = genValidateProject(JSON.parse(await file.text())).parts.map((p) => ({
					id: p.id,
					name: p.name,
					visible: p.visible,
					recipe: p,
					color: p.color,
					frozen: false,
					deleted: null,
					cloud: genSample(p, { color: p.color })
				}));
			} else entities = await editorReadProject(file);
			model.replace(entities);
			changed({ fit: true });
		} catch (e) {
			error(e.message);
		} finally {
			busy = false;
			loading("");
			buttons();
		}
	};
	async function bytes(items) {
		const chunks = [];
		let total = 0;
		await writePointExport(items, {
			format: "ply",
			sourceIds: items.length > 1,
			write: (chunk) => {
				total += chunk.byteLength;
				if (total > 536870912) throw Error(tr("导出超过 512 MB，请拆分对象。", "Export exceeds 512 MB; split the objects."));
				chunks.push(chunk);
			}
		});
		return new Blob(chunks, { type: "application/octet-stream" });
	}
	async function exportClouds(handoff = false) {
		if (blocked() || draftGuard()) return;
		busy = true;
		buttons();
		loading(tr("正在准备点云…", "Preparing point clouds…"));
		try {
			const items = model.entities.filter((e) => e.visible && editLiveCount(e)).map((e) => ({
				name: e.name,
				cloud: getLive(e)
			}));
			if (!items.length) return;
			if (handoff) {
				const files = [];
				for (const item of items) files.push({
					name: item.name.replace(/\.[^.]+$/, "") + ".ply",
					buffer: await (await bytes([item])).arrayBuffer()
				});
				if (nativeSession) {
					await nativeSession.flush();
					const batch = Date.now().toString(36);
					for (const file of files) {
						const writer = await nativeExportWriter(file.name);
						try {
							await writer.write(file.buffer);
							await writer.commit(nativeSession.id, `studio/${batch}/${file.name.replace(/[\/]/g, "_")}`);
						} catch (e) {
							await writer.abort().catch(() => {});
							throw e;
						}
					}
					location.assign(`pointcloud.html?project=${encodeURIComponent(nativeSession.id)}&studio=${batch}&lang=${en ? "en" : "zh"}`);
				} else {
					await genSaveHandoff(files);
					location.assign(`pointcloud.html?generated=1&lang=${en ? "en" : "zh"}`);
				}
			} else await saveLocalBlob(await bytes(items), "edited-point-cloud.ply");
		} catch (e) {
			error(e.message);
		} finally {
			busy = false;
			loading("");
			buttons();
		}
	}
	$("editor-export").onclick = () => exportClouds();
	$("editor-handoff").onclick = () => exportClouds(true);
	$("dismiss-error").onclick = () => error("");
	$("fit-view").onclick = () => viewer.fit();
	$("zoom-in").onclick = () => viewer.zoomBy(1.2);
	$("zoom-out").onclick = () => viewer.zoomBy(1 / 1.2);
	for (const b of document.querySelectorAll("[data-view]")) b.onclick = () => {
		viewer.setView(b.dataset.view);
		for (const other of document.querySelectorAll("[data-view]")) {
			other.classList.toggle("active", other === b);
			other.setAttribute("aria-pressed", String(other === b));
		}
	};
	busy = true;
	buttons();
	loading(tr("恢复本地工作台…", "Restoring local workspace…"));
	try {
		if (nativeApp) {
			nativeSession = await openWorkspaceSession({
				tool: "generate",
				restore: async ({ state, records, snapshot }) => {
					for (const key of state?.sources || []) nativeSources.add(key);
					if (snapshot) model.entities = await editorReadProject(snapshot);
					model.next = Math.max(1, ...model.entities.map((e) => e.id + 1));
					for (const { file, path } of records) {
						const key = file.nativeKey + ":" + path;
						if (nativeSources.has(key)) continue;
						if (/\.bwvproject$/i.test(path)) for (const e of await editorReadProject(file)) model.entities.push({
							...e,
							id: model.next++
						});
						else if (/\.(txt|xyz|csv|pts|ply|pcd)$/i.test(path)) try {
							model.add(await readPointCloud(file, { maxPoints: 0 }), file.name);
						} catch (e) {
							note(e.message);
						}
						nativeSources.add(key);
					}
					if (model.entities.length > 200) throw Error("项目最多 200 个对象 / At most 200 objects");
					model.active = model.entities.some((e) => e.id === state?.active) ? state.active : model.entities[0]?.id ?? null;
					model.past = [];
					model.future = [];
					refresh();
					if (state?.camera && viewer.pointCount) applyCameraSnapshot([viewer], state.camera, {
						space: "raw-world",
						checkScene: false
					});
					restoreMobileInputs(state?.display);
					return { snapshotUnchanged: Boolean(snapshot) && [...nativeSources].every((key) => (state?.sources || []).includes(key)) };
				},
				capture: () => {
					const entities = model.entities;
					return {
						revision: entities,
						blob: () => editorProjectBlob(entities),
						state: {
							schemaVersion: 1,
							sources: [...nativeSources],
							active: model.active,
							camera: viewer.pointCount ? captureCameraSnapshot(viewer, { space: "raw-world" }) : null,
							display: captureMobileInputs()
						}
					};
				},
				onStatus: (kind, e) => {
					$("editor-save-status").textContent = tr(kind === "saved" ? "已保存到 App 项目" : kind === "saving" ? "正在保存…" : kind === "dirty" ? "待自动保存" : "保存失败，请重试", kind === "saved" ? "Saved in app project" : kind === "saving" ? "Saving…" : kind === "dirty" ? "Pending autosave" : "Save failed — retry");
					if (kind === "saved") unsaved = false;
					if (e) error(e.message);
				},
				beforeLeave: () => {
					if (draftGuard()) throw Error(tr("先完成或取消绘制", "Finish or cancel drawing first"));
				},
				onBackground: () => {
					selection.cancel();
					viewer.fly?.leave();
					viewer.stopNavigation();
				},
				onForeground: () => viewer.requestRender()
			});
			if (nativeSession?.redirecting) return;
			await nativeSession.flush();
		} else {
			let entities = await editorLoadLocal();
			if (entities === null) {
				const old = localStorage.getItem("BuildingWebViewer.drawing.v1");
				if (old) entities = genValidateProject(JSON.parse(old)).parts.map((p) => ({
					id: p.id,
					name: p.name,
					visible: p.visible,
					cloud: genSample(p, { color: p.color }),
					deleted: null,
					recipe: p,
					frozen: false,
					color: p.color
				}));
			}
			if (entities) {
				model.entities = entities;
				model.active = entities[0]?.id ?? null;
				model.next = Math.max(1, ...entities.map((e) => e.id + 1));
			}
		}
	} catch (e) {
		error(tr("项目恢复失败：", "Project restore failed: ") + e.message);
		if (nativeApp) return;
	} finally {
		busy = false;
		loading("");
		refresh();
		if (!model.entities.length) {
			viewer.baseHeight = 20;
			viewer.distance = 40;
			viewer.target = [
				0,
				0,
				0
			];
			viewer.requestRender();
		}
	}
	window.addEventListener("beforeunload", (event) => {
		if (unsaved || drawing?.hasDraft()) {
			event.preventDefault();
			event.returnValue = "";
		}
	});
	window.addEventListener("pagehide", () => {
		if (unsaved) autosave();
	});
}
editorBoot().catch((e) => {
	const box = document.getElementById("error");
	if (box) {
		box.hidden = false;
		box.querySelector("span").textContent = e.message;
	}
});
//#endregion
