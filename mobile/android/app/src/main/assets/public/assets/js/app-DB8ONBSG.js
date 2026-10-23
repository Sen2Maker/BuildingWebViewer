import { a as objectFilePreference, c as migrateObjectImportState, i as adjacentObjectEntry, l as createViewerComparison, n as paletteGradient, o as objectNavigationDirection, r as CloudFileCache, s as resolveObjectFile, t as mountPaletteControls } from "./palette-controls-DzRnLWzq.js";
import { a as t, n as initializeLocale } from "./i18n-CQYkw1yO.js";
import { a as setNameSummary, l as appendLodFiles, n as mountProjectTree, o as createBatchProgress, p as ViewerProject, r as archiveImportQueue, t as mountPointDrop } from "./point-drop-blJQM5I1.js";
import { F as paletteUniforms, M as PALETTE_GLSL, N as currentPalettePreferences, R as validatePaletteOptions, d as mountViewerLayout, g as currentPresentation, h as updateSceneGuides, m as drawSceneGuides, n as captureCameraSnapshot, o as validateCameraSnapshot, p as validateImageSize, r as mountCameraControls, s as mountTouchCamera, t as applyCameraSnapshot, u as gsSetOrbitBasis, v as rgbHex, y as saveLocalBlob } from "./camera-controls-kT0RzZel.js";
import { c as restoreMobileInputs, l as restoreProjectTree, n as captureMobileInputs, o as mountMobileProject, r as isMobileApp, u as snapshotProjectTree } from "./mobile-project-DIn9Vanq.js";
import { a as installCameraNavigation, i as StyledLineRenderer, l as pickMeshNavigationDepth, o as navigationBasis, s as navigationMatrix, u as pointDisplayColors } from "./point-io-B3vnI3Pb.js";
//#region src/lod/mesh-data.js
/** Shared reference boxes keep OBJ variants and point overlays aligned across panes. */
function meshReferenceModels(panes, clouds) {
	const boxes = /* @__PURE__ */ new Map();
	function add(id, bounds) {
		if (!bounds || bounds.length !== 2 || bounds.some((p) => p.length !== 3 || !Array.from(p).every(Number.isFinite))) return;
		id = String(id);
		if (!boxes.has(id)) boxes.set(id, [[
			Infinity,
			Infinity,
			Infinity
		], [
			-Infinity,
			-Infinity,
			-Infinity
		]]);
		const b = boxes.get(id);
		for (let a = 0; a < 3; a++) {
			b[0][a] = Math.min(b[0][a], bounds[0][a]);
			b[1][a] = Math.max(b[1][a], bounds[1][a]);
		}
	}
	for (const pane of panes) for (const model of pane) add(model.id, model.bounds);
	for (const item of clouds) add(item.id, item.cloud.bounds);
	return [...boxes].sort(([a], [b]) => a.localeCompare(b, void 0, { numeric: true })).map(([id, bounds]) => ({
		id,
		bounds,
		vertices: bounds,
		faces: []
	}));
}
//#endregion
//#region src/shared/camera-animation.js
/** Renderer-independent, one-based camera timeline. No DOM, storage or video encoder. */
var CA_FORMAT = "BuildingWebViewer.camera-animation";
var CA_EASINGS = [
	"linear",
	"smooth",
	"ease-in",
	"ease-out",
	"hold"
];
function caFrameCount(duration, fps) {
	if (!Number.isFinite(duration) || duration <= 0 || duration > 300 || !Number.isInteger(fps) || fps < 1 || fps > 60) throw Error("时长需大于 0 且不超过 300 秒，帧率为 1–60 的整数 / Duration: (0, 300] seconds; FPS: 1–60");
	return Math.max(1, Math.round(duration * fps));
}
function caTime(frame, fps) {
	return (frame - 1) / fps;
}
function caEase(t, mode) {
	t = Math.max(0, Math.min(1, t));
	if (mode === "hold") return t >= 1 ? 1 : 0;
	if (mode === "smooth") return t * t * (3 - 2 * t);
	if (mode === "ease-in") return t * t;
	if (mode === "ease-out") return 1 - (1 - t) * (1 - t);
	return t;
}
var caClone = (value) => JSON.parse(JSON.stringify(value));
var caMix = (a, b, t) => a + (b - a) * t;
var caLogMix = (a, b, t) => Math.exp(caMix(Math.log(a), Math.log(b), t));
var caSameScene = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function caNormalizeSnapshot(raw) {
	const s = validateCameraSnapshot(raw, {
		space: raw?.space,
		checkScene: false
	}), c = s.camera;
	return validateCameraSnapshot({
		...s,
		version: 2,
		camera: {
			...c,
			roll: c.roll || 0,
			distance: c.distance || c.baseHeight * 2,
			fov: c.fov || 55,
			near: c.near || .001
		}
	}, {
		space: s.space,
		checkScene: false
	});
}
function caOutput(raw = {}) {
	const value = {
		format: "mp4",
		width: 1280,
		height: 720,
		bitrate: 8e6,
		guides: false,
		...raw
	};
	if (![
		"mp4",
		"webm",
		"png"
	].includes(value.format) || !Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width < 64 || value.height < 64 || value.width > 4096 || value.height > 4096 || value.width % 2 || value.height % 2 || value.width * value.height > 8294400 || !Number.isFinite(value.bitrate) || value.bitrate < 1e5 || value.bitrate > 1e8 || typeof value.guides !== "boolean") throw Error("视频尺寸需为 64–4096 的偶数、总像素不超过 4K，码率为 0.1–100 Mbps / Invalid output size, bitrate or format");
	return {
		format: value.format,
		width: value.width,
		height: value.height,
		bitrate: value.bitrate,
		guides: value.guides
	};
}
function caValidateProject(value) {
	if (value?.format !== "BuildingWebViewer.camera-animation" || value.version !== 1 || !["lod-arrangement", "raw-world"].includes(value.space) || !Array.isArray(value.keys) || value.keys.length > 200) throw Error("无效的相机动画文件（最多 200 个关键帧） / Invalid camera animation (at most 200 keyframes)");
	const frames = caFrameCount(value.duration, value.fps), ids = /* @__PURE__ */ new Set(), used = /* @__PURE__ */ new Set();
	let scene = null, hasScene = false;
	const keys = value.keys.map((k, i) => {
		if (!k || typeof k.id !== "string" || !k.id || k.id.length > 128 || ids.has(k.id) || !Number.isInteger(k.frame) || k.frame < 1 || k.frame > frames || used.has(k.frame) || typeof k.name !== "string" || k.name.length > 80 || !CA_EASINGS.includes(k.easing)) throw Error("关键帧编号、名称或帧位置无效；同一帧不能有两个关键帧 / Invalid or duplicate keyframe");
		ids.add(k.id);
		used.add(k.frame);
		const snapshot = caNormalizeSnapshot(k.snapshot);
		if (snapshot.space !== value.space) throw Error("相机坐标空间不一致 / Camera spaces differ");
		if (hasScene && !caSameScene(scene, snapshot.scene)) throw Error("所有关键帧必须使用相同的模型布局 / Keyframes must use the same scene layout");
		scene = snapshot.scene;
		hasScene = true;
		return {
			id: k.id,
			frame: k.frame,
			name: k.name,
			easing: k.easing,
			snapshot
		};
	}).sort((a, b) => a.frame - b.frame);
	return {
		format: CA_FORMAT,
		version: 1,
		space: value.space,
		duration: frames / value.fps,
		fps: value.fps,
		keys,
		output: caOutput(value.output)
	};
}
function caNewProject(space = "lod-arrangement") {
	return {
		format: CA_FORMAT,
		version: 1,
		space,
		duration: 5,
		fps: 30,
		keys: [],
		output: caOutput()
	};
}
function caSerialize(project) {
	return JSON.stringify(caValidateProject(project), null, 2);
}
function caParse(text) {
	if (typeof text !== "string" || text.length > 2097152) throw Error("动画文件超过 2 MB / Animation file exceeds 2 MB");
	return caValidateProject(JSON.parse(text));
}
/** Quaternion columns are camera right/up/back, avoiding azimuth wrap and gimbal interpolation. */
function caQuat(camera) {
	const az = camera.azimuth * Math.PI / 180, el = camera.elevation * Math.PI / 180, roll = (camera.roll || 0) * Math.PI / 180;
	const r = [
		-Math.sin(az),
		Math.cos(az),
		0
	], u = [
		-Math.cos(az) * Math.sin(el),
		-Math.sin(az) * Math.sin(el),
		Math.cos(el)
	], b = [
		Math.cos(el) * Math.cos(az),
		Math.cos(el) * Math.sin(az),
		Math.sin(el)
	];
	const right = r.map((v, i) => v * Math.cos(roll) + u[i] * Math.sin(roll)), up = u.map((v, i) => v * Math.cos(roll) - r[i] * Math.sin(roll));
	const m = [
		right[0],
		up[0],
		b[0],
		right[1],
		up[1],
		b[1],
		right[2],
		up[2],
		b[2]
	], tr = m[0] + m[4] + m[8];
	let q;
	if (tr > 0) {
		const s = Math.sqrt(tr + 1) * 2;
		q = [
			(m[7] - m[5]) / s,
			(m[2] - m[6]) / s,
			(m[3] - m[1]) / s,
			s / 4
		];
	} else if (m[0] > m[4] && m[0] > m[8]) {
		const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
		q = [
			s / 4,
			(m[1] + m[3]) / s,
			(m[2] + m[6]) / s,
			(m[7] - m[5]) / s
		];
	} else if (m[4] > m[8]) {
		const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
		q = [
			(m[1] + m[3]) / s,
			s / 4,
			(m[5] + m[7]) / s,
			(m[2] - m[6]) / s
		];
	} else {
		const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
		q = [
			(m[2] + m[6]) / s,
			(m[5] + m[7]) / s,
			s / 4,
			(m[3] - m[1]) / s
		];
	}
	const n = Math.hypot(...q);
	return q.map((v) => v / n);
}
function caSlerp(a, b, t) {
	let dot = a.reduce((s, v, i) => s + v * b[i], 0);
	if (dot < 0) {
		b = b.map((v) => -v);
		dot = -dot;
	}
	let q;
	if (dot > .9995) q = a.map((v, i) => caMix(v, b[i], t));
	else {
		const theta = Math.acos(Math.max(-1, Math.min(1, dot))), sn = Math.sin(theta);
		q = a.map((v, i) => (v * Math.sin((1 - t) * theta) + b[i] * Math.sin(t * theta)) / sn);
	}
	const n = Math.hypot(...q);
	return q.map((v) => v / n);
}
function caBasis([x, y, z, w]) {
	return [
		[
			1 - 2 * (y * y + z * z),
			2 * (x * y + z * w),
			2 * (x * z - y * w)
		],
		[
			2 * (x * y - z * w),
			1 - 2 * (x * x + z * z),
			2 * (y * z + x * w)
		],
		[
			2 * (x * z + y * w),
			2 * (y * z - x * w),
			1 - 2 * (x * x + y * y)
		]
	];
}
function caInterpolate(a, b, t) {
	if (t <= 0) return caClone(a);
	if (t >= 1) return caClone(b);
	if (a.projection !== b.projection) return caClone(a);
	const x = caNormalizeSnapshot(a), y = caNormalizeSnapshot(b), c = x.camera, d = y.camera, rot = { camera: {} };
	gsSetOrbitBasis(rot, caBasis(caSlerp(caQuat(c), caQuat(d), t)));
	const lens = c.lens || d.lens ? {
		fx: caLogMix(c.lens?.fx || .5 / Math.tan(c.fov * Math.PI / 360), d.lens?.fx || .5 / Math.tan(d.fov * Math.PI / 360), t),
		fy: caLogMix(c.lens?.fy || .5 / Math.tan(c.fov * Math.PI / 360), d.lens?.fy || .5 / Math.tan(d.fov * Math.PI / 360), t)
	} : null;
	return {
		...x,
		camera: {
			...c,
			...rot.camera,
			...lens ? { lens } : {},
			zoom: caLogMix(c.zoom, d.zoom, t),
			baseHeight: caLogMix(c.baseHeight, d.baseHeight, t),
			distance: caLogMix(c.distance, d.distance, t),
			fov: caMix(c.fov, d.fov, t),
			near: caLogMix(c.near, d.near, t),
			pan: c.pan.map((v, i) => caMix(v, d.pan[i], t)),
			target: c.target.map((v, i) => caMix(v, d.target[i], t))
		}
	};
}
/** Project is validated on edits, not once per rendered frame. End regions hold nearest key. */
function caSample(project, frame) {
	const keys = project.keys;
	if (!keys.length) return null;
	if (!Number.isFinite(frame)) throw Error("Invalid playhead");
	if (frame <= keys[0].frame) return caClone(keys[0].snapshot);
	if (frame >= keys.at(-1).frame) return caClone(keys.at(-1).snapshot);
	let high = keys.findIndex((k) => k.frame >= frame);
	if (keys[high].frame === frame) return caClone(keys[high].snapshot);
	const a = keys[high - 1], b = keys[high];
	return caInterpolate(a.snapshot, b.snapshot, caEase((frame - a.frame) / (b.frame - a.frame), a.easing));
}
function caPutKey(project, { frame, snapshot, name, easing = "smooth", id = null }) {
	const next = caClone(project), existing = next.keys.find((k) => k.frame === frame);
	const key = {
		id: existing?.id || id || `key-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
		frame,
		name: name ?? existing?.name ?? `视角 ${frame}`,
		easing: existing?.easing || easing,
		snapshot: caNormalizeSnapshot(snapshot)
	};
	next.keys = next.keys.filter((k) => k.frame !== frame);
	next.keys.push(key);
	return caValidateProject(next);
}
function caMoveKey(project, id, frame) {
	const next = caClone(project), key = next.keys.find((k) => k.id === id);
	if (!key) throw Error("Keyframe missing");
	key.frame = frame;
	return caValidateProject(next);
}
function caResize(project, duration, fps, { stretch = true } = {}) {
	const next = caClone(project), oldTotal = caFrameCount(project.duration, project.fps), total = caFrameCount(duration, fps);
	next.duration = total / fps;
	next.fps = fps;
	if (stretch) for (const k of next.keys) k.frame = oldTotal === 1 ? 1 : 1 + Math.round((k.frame - 1) * (total - 1) / (oldTotal - 1));
	return caValidateProject(next);
}
function caOrbit(project, snapshot) {
	const total = caFrameCount(project.duration, project.fps);
	if (total < 5) throw Error("环绕示例至少需要 5 帧 / Orbit needs at least 5 frames");
	const result = {
		...caClone(project),
		keys: []
	}, base = caNormalizeSnapshot(snapshot);
	for (let i = 0; i < 5; i++) {
		const s = caClone(base);
		s.camera.azimuth += i * 90;
		result.keys.push({
			id: "orbit-" + i,
			frame: 1 + Math.round(i * (total - 1) / 4),
			name: `${i * 90}°`,
			easing: "linear",
			snapshot: s
		});
	}
	return caValidateProject(result);
}
//#endregion
//#region src/shared/zip-writer.js
/** Bounded ZIP/Store sink, append-only and compatible with directly written files. */
var zwTable = Uint32Array.from({ length: 256 }, (_, n) => {
	for (let i = 0; i < 8; i++) n = n >>> 1 ^ (n & 1 ? 3988292384 : 0);
	return n >>> 0;
});
function zwCRC(data) {
	let n = 4294967295;
	for (const b of data) n = n >>> 8 ^ zwTable[(n ^ b) & 255];
	return (n ^ 4294967295) >>> 0;
}
function createStoreZip({ write, maxBytes = 134217728 } = {}) {
	const entries = [];
	let offset = 0, closed = false;
	const encoder = new TextEncoder();
	const send = async (bytes) => {
		if (offset + bytes.byteLength > Math.min(maxBytes, 4294967295)) throw Error("帧序列超过输出上限，请缩短时长或直接写入文件 / Frame sequence exceeds output limit");
		await write(bytes);
		offset += bytes.byteLength;
	};
	return {
		async add(path, value) {
			if (closed || entries.length >= 65e3 || typeof path !== "string" || path.startsWith("/") || path.split("/").some((v) => !v || v === ".." || v === ".") || /[\x00-\x1f\\]/.test(path)) throw Error("Invalid ZIP entry");
			const name = encoder.encode(path);
			if (name.length > 65535 || entries.some((e) => e.path === path)) throw Error("Duplicate or long ZIP path");
			const data = value instanceof Uint8Array ? value : new Uint8Array(await value.arrayBuffer()), crc = zwCRC(data), header = new Uint8Array(30 + name.length), v = new DataView(header.buffer);
			v.setUint32(0, 67324752, true);
			v.setUint16(4, 20, true);
			v.setUint16(6, 2048, true);
			v.setUint16(12, 33, true);
			v.setUint32(14, crc, true);
			v.setUint32(18, data.length, true);
			v.setUint32(22, data.length, true);
			v.setUint16(26, name.length, true);
			header.set(name, 30);
			entries.push({
				path,
				name,
				size: data.length,
				crc,
				offset
			});
			await send(header);
			await send(data);
		},
		async close() {
			if (closed) throw Error("ZIP already closed");
			closed = true;
			const start = offset;
			for (const e of entries) {
				const header = new Uint8Array(46 + e.name.length), v = new DataView(header.buffer);
				v.setUint32(0, 33639248, true);
				v.setUint16(4, 20, true);
				v.setUint16(6, 20, true);
				v.setUint16(8, 2048, true);
				v.setUint16(14, 33, true);
				v.setUint32(16, e.crc, true);
				v.setUint32(20, e.size, true);
				v.setUint32(24, e.size, true);
				v.setUint16(28, e.name.length, true);
				v.setUint32(42, e.offset, true);
				header.set(e.name, 46);
				await send(header);
			}
			const end = /* @__PURE__ */ new Uint8Array(22), v = new DataView(end.buffer);
			v.setUint32(0, 101010256, true);
			v.setUint16(8, entries.length, true);
			v.setUint16(10, entries.length, true);
			v.setUint32(12, offset - start, true);
			v.setUint32(16, start, true);
			await send(end);
		},
		get bytes() {
			return offset;
		}
	};
}
//#endregion
//#region src/shared/animation-export.js
/** Deterministic frame production: wall-clock playback speed never drops exported frames. */
async function caRunFrames({ project, render, write, signal, onProgress = () => {}, guard = () => true, yieldTask = () => new Promise((r) => setTimeout(r, 0)) }) {
	const checked = caValidateProject(project), total = caFrameCount(checked.duration, checked.fps);
	if (!checked.keys.length) throw Error("请先添加关键帧 / Add a keyframe first");
	for (let index = 0; index < total; index++) {
		if (signal?.aborted) throw new DOMException("已取消 / Canceled", "AbortError");
		if (!guard()) throw Error("模型或布局已改变，导出已停止；请重新加载动画对应的场景 / Scene changed; export stopped");
		await write(await render(caSample(checked, index + 1), index), index, index / checked.fps, 1 / checked.fps);
		onProgress(index + 1, total);
		await yieldTask();
	}
	if (signal?.aborted) throw new DOMException("已取消 / Canceled", "AbortError");
	return total;
}
var caWriterPromise;
function caLoadVideoWriter() {
	if (globalThis.BWVVideoWriter) return Promise.resolve(globalThis.BWVVideoWriter);
	if (!caWriterPromise) caWriterPromise = new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = new URL("assets/vendor/video-writer.js?v=" + encodeURIComponent(document.querySelector("meta[name=\"application-build\"]")?.content || "preview"), document.baseURI).href;
		script.onload = () => globalThis.BWVVideoWriter ? resolve(globalThis.BWVVideoWriter) : reject(Error("视频编码模块未就绪 / Video encoder unavailable"));
		script.onerror = () => reject(Error("无法加载本地视频编码模块 / Cannot load the local video encoder"));
		document.head.append(script);
	}).catch((e) => {
		caWriterPromise = null;
		throw e;
	});
	return caWriterPromise;
}
async function caExportAnimation({ project, adapter, width, height, format = "mp4", bitrate = 8e6, signal, onProgress = () => {}, writable = null, includeGuides = false }) {
	if (![
		"mp4",
		"webm",
		"png"
	].includes(format) || !Number.isInteger(width) || !Number.isInteger(height) || width < 64 || height < 64 || width > 4096 || height > 4096 || width % 2 || height % 2 || width * height > 8294400 || !Number.isFinite(bitrate) || bitrate < 1e5 || bitrate > 1e8) throw Error("视频尺寸需为 64–4096 的偶数，总像素不超过 4K；码率为 0.1–100 Mbps / Invalid video size or bitrate");
	project = caValidateProject(project);
	if (!project.keys.length) throw Error("请先添加关键帧 / Add keyframes first");
	adapter.assert(project.keys[0].snapshot);
	if (!writable && format !== "png" && bitrate * project.duration / 8 > 117440512) throw Error("预计视频较大，请直接写入文件或降低时长 / Large video: save directly to disk or reduce duration");
	let writer = null, session = null;
	const cancelWriter = () => {
		writer?.cancel().catch(() => {});
	};
	const guard = adapter.guard(), before = adapter.capture(), parts = [], limit = 134217728;
	let size = 0, pngFrames = 0;
	try {
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d", { alpha: false });
		if (!ctx) throw Error("无法创建导出画布 / Cannot create video canvas");
		if (format === "png") {
			const zip = createStoreZip({
				maxBytes: writable ? 4294967295 : limit,
				write: async (bytes) => {
					if (writable) await writable.write(bytes);
					else {
						size += bytes.byteLength;
						if (size > limit) throw Error("帧序列超过 128 MB，请直接写入文件 / Sequence exceeds 128 MB; save directly to disk");
						parts.push(bytes);
					}
				}
			});
			await zip.add("animation.json", new TextEncoder().encode(caSerialize(project)));
			await zip.add("README.txt", new TextEncoder().encode(`BWV camera frame sequence\nFPS: ${project.fps}\nFrames: ${caFrameCount(project.duration, project.fps)}\nDuration: ${project.duration} seconds\nframe_000001.png is time 0. Import as a PNG image sequence at the FPS above.\n`));
			writer = {
				get info() {
					return {
						encodedFrames: pngFrames,
						codec: "PNG"
					};
				},
				async add(i) {
					const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(Error("PNG encoding failed")), "image/png"));
					await zip.add(`frame_${String(i + 1).padStart(6, "0")}.png`, blob);
					pngFrames++;
				},
				async finish() {
					await zip.close();
					if (writable) {
						await writable.close();
						return null;
					}
					return new Blob(parts, { type: "application/zip" });
				},
				async cancel() {
					parts.length = 0;
					await writable?.abort().catch(() => {});
				}
			};
		} else {
			const vendor = await caLoadVideoWriter();
			if (!await vendor.supported(format, {
				width,
				height,
				fps: project.fps,
				bitrate
			})) throw Error(`浏览器不支持此尺寸的 ${format.toUpperCase()} 编码，请改用 WebM、PNG 帧序列或降低尺寸 / This codec/size is unsupported; try WebM, PNG sequence or a smaller frame`);
			writer = await vendor.create(canvas, {
				format,
				fps: project.fps,
				bitrate,
				writable,
				maxBytes: limit
			});
		}
		session = adapter.createCapture(width, height);
		signal?.addEventListener("abort", cancelWriter, { once: true });
		await caRunFrames({
			project,
			signal,
			guard,
			onProgress,
			render: (snapshot) => {
				adapter.apply(snapshot, { render: false });
				ctx.putImageData(new ImageData(session.render(), width, height), 0, 0);
				if (includeGuides) adapter.drawGuides?.(ctx, width, height);
				return canvas;
			},
			write: (_, i) => writer.add(i)
		});
		const result = await writer.finish();
		if (writer.info.encodedFrames !== caFrameCount(project.duration, project.fps)) throw Error("实际编码帧数与时间轴不符 / Encoded frame count mismatch");
		if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
		return {
			blob: result,
			info: {
				...writer.info,
				width,
				height,
				fps: project.fps,
				duration: project.duration
			}
		};
	} catch (e) {
		await writer?.cancel().catch(() => {});
		if (!writer) await writable?.abort().catch(() => {});
		throw e;
	} finally {
		signal?.removeEventListener("abort", cancelWriter);
		session?.dispose();
		if (guard()) adapter.apply(before);
	}
}
//#endregion
//#region src/shared/animation-controls.js
/** Shared desktop animation editor. All tool-specific state lives behind adapter. */
function mountCameraAnimation({ adapter, toolbar, anchor, storageKey = "BWV.camera-animation.mesh.v1" }) {
	const doc = toolbar.ownerDocument, en = doc.documentElement.lang === "en", tr = (a, b) => en ? b : a;
	const el = (tag, text, cls) => {
		const n = doc.createElement(tag);
		if (text) n.textContent = text;
		if (cls) n.className = cls;
		return n;
	};
	const btn = (text, action, cls) => {
		const n = el("button", text, cls);
		n.type = "button";
		if (action) n.onclick = action;
		return n;
	};
	const select = (options) => {
		const n = el("select");
		for (const [value, zh, eng] of options) {
			const o = el("option", tr(zh, eng));
			o.value = value;
			n.append(o);
		}
		return n;
	};
	let project = caNewProject(adapter.space), cursor = 1, selected = null, playing = false, raf = null, playStart = 0, exporter = null, resultURL = null, cacheError = false, drag = null;
	const past = [], future = [];
	const storage = () => globalThis.localStorage;
	try {
		const saved = storage().getItem(storageKey);
		if (saved) project = caParse(saved);
	} catch {
		cacheError = true;
	}
	const toggle = btn(tr("相机动画", "Camera animation"), () => setOpen(panel.hidden), "ca-toggle");
	toggle.setAttribute("aria-expanded", "false");
	toggle.setAttribute("aria-controls", "camera-animation");
	toolbar.append(toggle);
	const panel = el("section", null, "camera-animation");
	panel.id = "camera-animation";
	panel.hidden = true;
	panel.setAttribute("aria-label", tr("相机动画时间轴", "Camera animation timeline"));
	anchor.after(panel);
	const header = el("div", null, "ca-heading"), heading = el("div"), eyebrow = el("span", "CAMERA ANIMATION", "ca-eyebrow");
	heading.append(eyebrow, el("h3", tr("相机动画", "Camera animation")));
	const files = el("div", null, "ca-header-actions"), newButton = btn(tr("新建", "New"), () => {
		stop();
		commit(caNewProject(adapter.space));
		cursor = 1;
		selected = null;
		refresh();
		message(tr("已新建空时间轴；可撤销。", "New timeline created; Undo is available."));
	}), importButton = btn(tr("导入 JSON", "Import JSON"), () => input.click()), jsonButton = btn(tr("保存 JSON", "Save JSON"), () => saveJSON()), close = btn("×", () => setOpen(false), "ca-close");
	close.setAttribute("aria-label", tr("收起相机动画", "Close camera animation"));
	const compact = btn(tr("精简", "Compact"), () => {
		const small = panel.classList.toggle("ca-compact");
		compact.textContent = small ? tr("展开", "Expand") : tr("精简", "Compact");
	});
	const input = el("input");
	input.type = "file";
	input.accept = ".json";
	input.hidden = true;
	files.append(compact, newButton, importButton, jsonButton, close, input);
	header.append(heading, files);
	panel.append(header);
	const settings = el("div", null, "ca-settings");
	panel.append(settings);
	const field = (box, label, n) => {
		const l = el("label");
		l.append(el("span", label), n);
		n.setAttribute("aria-label", label);
		box.append(l);
		return n;
	};
	const duration = field(settings, tr("时长 / 秒", "Duration / s"), el("input"));
	duration.type = "number";
	duration.min = ".016667";
	duration.max = "300";
	duration.step = "any";
	duration.value = project.duration;
	const fps = field(settings, tr("帧率 / FPS", "Frame rate / FPS"), el("input"));
	fps.type = "number";
	fps.min = 1;
	fps.max = 60;
	fps.step = 1;
	fps.value = project.fps;
	const resize = field(settings, tr("调整时间轴时", "When changing timing"), select([[
		"stretch",
		"等比例移动关键帧",
		"Scale keyframe positions"
	], [
		"keep",
		"保留原帧号",
		"Keep frame numbers"
	]]));
	const applyTime = btn(tr("应用", "Apply"), () => timing());
	const meta = el("span", null, "ca-meta");
	settings.append(applyTime, meta);
	const transport = el("div", null, "ca-transport"), play = btn(tr("▶ 播放", "▶ Play"), () => playing ? stop() : start(), "ca-play"), first = btn("⏮", () => seek(1)), prev = btn("‹", () => seek(cursor - 1)), next = btn("›", () => seek(cursor + 1));
	first.setAttribute("aria-label", tr("回到第一帧", "First frame"));
	prev.setAttribute("aria-label", tr("上一帧", "Previous frame"));
	next.setAttribute("aria-label", tr("下一帧", "Next frame"));
	const frame = el("input");
	frame.type = "number";
	frame.min = 1;
	frame.step = 1;
	frame.setAttribute("aria-label", tr("当前帧", "Current frame"));
	const frameWrap = el("label", null, "ca-current-frame");
	frameWrap.append(el("span", tr("第", "Frame")), frame, el("span", tr("帧", "")));
	const time = el("output", null, "ca-time"), loopLabel = el("label", null, "ca-check"), loop = el("input");
	loop.type = "checkbox";
	loopLabel.append(loop, doc.createTextNode(tr("循环", "Loop")));
	const undo = btn("↶", () => history(-1)), redo = btn("↷", () => history(1));
	undo.setAttribute("aria-label", tr("撤销时间轴修改", "Undo timeline edit"));
	redo.setAttribute("aria-label", tr("重做时间轴修改", "Redo timeline edit"));
	const add = btn("", () => capture(), "primary ca-add"), orbit = btn(tr("环绕示例", "Orbit example"), () => {
		try {
			stop();
			commit(caOrbit(project, adapter.capture()));
			selected = project.keys[0].id;
			seek(1);
			message(tr("已生成一周环绕，可撤销；也可拖动视角后在任意帧打点。", "Created one orbit; Undo is available. You can also position the camera and capture any frame."));
		} catch (e) {
			message(e.message, true);
		}
	});
	transport.append(first, prev, play, next, frameWrap, time, loopLabel, undo, redo, orbit, add);
	panel.append(transport);
	const track = el("div", null, "ca-track");
	track.tabIndex = 0;
	track.setAttribute("role", "group");
	track.setAttribute("aria-label", tr("关键帧时间轴，左右键逐帧移动", "Keyframe timeline; arrow keys step frames"));
	const ruler = el("div", null, "ca-ruler"), marks = el("div", null, "ca-key-marks"), playhead = el("div", null, "ca-playhead");
	track.append(ruler, marks, playhead);
	panel.append(track);
	const scrub = el("input", null, "ca-scrub");
	scrub.type = "range";
	scrub.min = 1;
	scrub.step = 1;
	scrub.setAttribute("aria-label", tr("播放头位置", "Playhead position"));
	panel.append(scrub);
	const lower = el("div", null, "ca-lower"), keyBox = el("div", null, "ca-key-box"), keyHeading = el("div", null, "ca-key-heading");
	keyHeading.append(el("strong", tr("关键帧", "Keyframes")), el("span", tr("◆ 可拖动 · 第 1 帧从 0 秒开始", "Drag ◆ to retime · Frame 1 starts at 0 s")));
	keyBox.append(keyHeading);
	const list = el("div", null, "ca-key-list");
	keyBox.append(list);
	lower.append(keyBox);
	const exportBox = el("details", null, "ca-export");
	exportBox.append(el("summary", tr("视频与帧序列导出", "Video & image sequence export")));
	const exportFields = el("div", null, "ca-export-fields");
	exportBox.append(exportFields);
	const format = field(exportFields, tr("格式", "Format"), select([
		[
			"mp4",
			"MP4 · H.264",
			"MP4 · H.264"
		],
		[
			"webm",
			"WebM · VP8",
			"WebM · VP8"
		],
		[
			"png",
			"PNG 帧序列 · ZIP",
			"PNG sequence · ZIP"
		]
	]));
	const size = field(exportFields, tr("画幅 / 分辨率", "Frame / resolution"), select([
		[
			"1280x720",
			"720p · 16:9",
			"720p · 16:9"
		],
		[
			"1920x1080",
			"1080p · 16:9",
			"1080p · 16:9"
		],
		[
			"1080x1920",
			"竖屏 · 9:16",
			"Portrait · 9:16"
		],
		[
			"1080x1080",
			"正方形 · 1:1",
			"Square · 1:1"
		],
		[
			"640x360",
			"360p · 快速测试",
			"360p · Quick test"
		],
		[
			"custom",
			"自定义",
			"Custom"
		]
	]));
	const width = field(exportFields, tr("宽 / 像素", "Width / px"), el("input")), height = field(exportFields, tr("高 / 像素", "Height / px"), el("input"));
	for (const n of [width, height]) {
		n.type = "number";
		n.min = 64;
		n.max = 4096;
		n.step = 2;
	}
	width.value = 1280;
	height.value = 720;
	const bitrate = field(exportFields, tr("码率 / Mbps", "Bitrate / Mbps"), el("input"));
	bitrate.type = "number";
	bitrate.min = .1;
	bitrate.max = 100;
	bitrate.step = .5;
	bitrate.value = 8;
	const extras = el("div", null, "ca-export-extras"), guidesLabel = el("label", null, "ca-check"), guides = el("input");
	guides.type = "checkbox";
	guidesLabel.append(guides, doc.createTextNode(tr("导出坐标轴与比例尺", "Include axes and scale")));
	extras.append(guidesLabel);
	const directLabel = el("label", null, "ca-check"), direct = el("input");
	direct.type = "checkbox";
	directLabel.append(direct, doc.createTextNode(tr("直接写入文件（长视频推荐）", "Write directly to disk (long clips)")));
	directLabel.hidden = typeof globalThis.showSaveFilePicker !== "function";
	extras.append(directLabel);
	exportBox.append(extras);
	const exportHelp = el("p", tr("只导出三维画面，不录制界面、编号标签或声音。PNG 序列可导入 PR / AE；视频编码能力取决于浏览器。", "Exports the 3D view without UI, object labels or audio. Import PNG sequences into an editor at the selected FPS; video codecs depend on your browser."), "ca-help");
	exportBox.append(exportHelp);
	const submit = btn(tr("开始导出", "Export animation"), () => exportVideo(), "primary"), cancel = btn(tr("取消导出", "Cancel export"), () => exporter?.abort(), "ca-cancel");
	cancel.hidden = true;
	const exportActions = el("div", null, "ca-export-actions");
	exportActions.append(submit, cancel);
	exportBox.append(exportActions);
	lower.append(exportBox);
	panel.append(lower);
	const hint = el("p", tr("拖动模型调整视角，再点击“打点”。每一行的过渡方式作用于到下一个关键帧的区间；首尾之外保持最近的视角。不同投影之间直接切换。", "Position the camera, then capture a keyframe. Each transition controls the segment to the next key. Ends hold the nearest pose; projection changes are cuts."), "ca-help");
	panel.append(hint);
	const status = el("p", null, "ca-status");
	status.setAttribute("role", "status");
	panel.append(status);
	const progressWrap = el("div", null, "ca-progress-wrap"), progress = el("progress"), progressText = el("span");
	progress.max = 100;
	progressWrap.hidden = true;
	progressWrap.append(progress, progressText);
	panel.append(progressWrap);
	const result = el("div", null, "ca-result"), download = el("a"), video = el("video"), resultInfo = el("p", null, "ca-help");
	result.hidden = true;
	video.controls = true;
	video.muted = true;
	video.playsInline = true;
	result.append(download, resultInfo, video);
	panel.append(result);
	const savedNote = el("p", null, "ca-cache-note");
	panel.append(savedNote);
	function message(text, bad = false) {
		status.textContent = text;
		status.classList.toggle("ca-error", bad);
	}
	function cache() {
		try {
			storage().setItem(storageKey, caSerialize(project));
			cacheError = false;
		} catch {
			cacheError = true;
		}
		savedNote.textContent = cacheError ? tr("缓存不可用；请保存动画 JSON 备份。", "Browser storage unavailable; save animation JSON as a backup.") : tr("动画自动保存在当前浏览器 · 模型文件仍需自行加载", "Animation autosaves in this browser · Reload model files separately");
	}
	function commit(next) {
		const clean = caValidateProject(next);
		if (JSON.stringify(clean) === JSON.stringify(project)) return;
		past.push(caSerialize(project));
		if (past.length > 50) past.shift();
		future.length = 0;
		project = clean;
		cursor = Math.min(cursor, total());
		cache();
		refresh();
	}
	function history(direction) {
		if (exporter) return;
		stop();
		const from = direction < 0 ? past : future, to = direction < 0 ? future : past;
		if (!from.length) return;
		to.push(caSerialize(project));
		project = caParse(from.pop());
		cursor = Math.min(cursor, total());
		selected = null;
		cache();
		refresh();
		safeApply();
	}
	function total() {
		return caFrameCount(project.duration, project.fps);
	}
	function compatible() {
		if (!adapter.ready()) return tr("请先加载网格模型，再捕获视角。", "Load a mesh, then capture its view.");
		try {
			if (project.keys.length) adapter.assert(project.keys[0].snapshot);
			return "";
		} catch (e) {
			return e.message;
		}
	}
	function frameText() {
		return project.keys.findIndex((k) => k.frame === cursor) < 0 ? tr(`在第 ${cursor} 帧打点`, `Capture frame ${cursor}`) : tr(`更新第 ${cursor} 帧视角`, `Replace frame ${cursor} view`);
	}
	function updatePlayhead() {
		frame.value = cursor;
		scrub.value = cursor;
		time.textContent = `${caTime(cursor, project.fps).toFixed(3)} s`;
		playhead.style.left = `${(cursor - 1) / Math.max(1, total() - 1) * 100}%`;
		add.textContent = frameText();
		for (const m of marks.children) m.classList.toggle("active", m.dataset.keyId === selected);
	}
	function safeApply() {
		try {
			const pose = caSample(project, cursor);
			if (pose) adapter.apply(pose);
			return true;
		} catch (e) {
			message(e.message, true);
			return false;
		}
	}
	function seek(value, { apply = true } = {}) {
		if (exporter) return;
		stop();
		setFrame(value, apply);
	}
	function setFrame(value, apply = true) {
		if (!Number.isFinite(Number(value))) return;
		cursor = Math.max(1, Math.min(total(), Math.round(Number(value))));
		const k = project.keys.find((k) => k.frame === cursor);
		if (k) selected = k.id;
		updatePlayhead();
		if (apply) safeApply();
	}
	function start() {
		if (exporter || !project.keys.length) return;
		if (compatible()) {
			message(compatible(), true);
			return;
		}
		if (cursor >= total()) cursor = 1;
		adapter.canvas()?.dispatchEvent(new CustomEvent("bwv-animation-start"));
		adapter.canvas()?.focus();
		playing = true;
		play.textContent = tr("❚❚ 暂停", "❚❚ Pause");
		playStart = performance.now() - caTime(cursor, project.fps) * 1e3;
		const tick = (now) => {
			if (!playing) return;
			if (doc.hidden) {
				stop();
				return;
			}
			let f = 1 + Math.floor((now - playStart) * project.fps / 1e3);
			if (f > total()) {
				if (loop.checked) {
					f = 1 + (f - 1) % total();
					playStart = now - caTime(f, project.fps) * 1e3;
				} else {
					setFrame(total());
					stop();
					return;
				}
			}
			setFrame(f, false);
			if (!safeApply()) return stop();
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
	}
	function stop() {
		playing = false;
		if (raf !== null) cancelAnimationFrame(raf);
		raf = null;
		play.textContent = tr("▶ 播放", "▶ Play");
	}
	function setOpen(open) {
		if (exporter) return;
		panel.hidden = !open;
		toggle.setAttribute("aria-expanded", String(open));
		toggle.classList.toggle("active", open);
		if (!open) stop();
		adapter.setPreviewAspect?.(open ? Number(width.value) / Number(height.value) : null);
		if (open) {
			refresh();
			if (!project.keys.length) message(tr("先调整视角，再在当前帧打点；也可以先试“环绕示例”。", "Position the camera and capture this frame, or try Orbit example."));
		}
	}
	function capture() {
		try {
			stop();
			const snapshot = adapter.capture();
			commit(caPutKey(project, {
				frame: cursor,
				snapshot,
				name: en ? `View ${cursor}` : void 0
			}));
			selected = project.keys.find((k) => k.frame === cursor).id;
			renderKeys();
			message(tr(`已保存第 ${cursor} 帧的视角。`, `Captured frame ${cursor}.`));
		} catch (e) {
			message(e.message, true);
		}
	}
	function renderKeys() {
		list.replaceChildren();
		marks.replaceChildren();
		ruler.replaceChildren();
		for (let i = 0; i <= 4; i++) {
			const n = el("span", `${(caTime(total(), project.fps) * i / 4).toFixed(project.duration < 5 ? 2 : 1)}s`);
			n.style.left = `${i * 25}%`;
			ruler.append(n);
		}
		if (!project.keys.length) list.append(el("p", tr("还没有关键帧。调整视角后打点，或生成环绕示例。", "No keyframes yet. Capture a camera pose, or generate an orbit example."), "ca-empty"));
		for (const k of project.keys) {
			const marker = btn("◆", null, "ca-key");
			marker.dataset.keyId = k.id;
			marker.style.left = `${(k.frame - 1) / Math.max(1, total() - 1) * 100}%`;
			marker.title = `${k.name} · ${tr("第", "Frame")} ${k.frame} · ${caTime(k.frame, project.fps).toFixed(3)}s`;
			marker.setAttribute("aria-label", marker.title);
			marker.onpointerdown = (e) => {
				if (exporter) return;
				e.preventDefault();
				e.stopPropagation();
				stop();
				selected = k.id;
				setFrame(k.frame);
				drag = {
					kind: "key",
					id: k.id,
					frame: k.frame
				};
				track.setPointerCapture(e.pointerId);
			};
			marker.onclick = () => {
				selected = k.id;
				seek(k.frame);
			};
			marks.append(marker);
			const row = el("div", null, "ca-key-row");
			row.classList.toggle("active", selected === k.id);
			const position = el("input");
			position.type = "number";
			position.min = 1;
			position.max = total();
			position.value = k.frame;
			position.setAttribute("aria-label", tr(`${k.name} 帧位置`, `${k.name} frame`));
			position.onchange = () => {
				try {
					stop();
					const f = Number(position.value);
					commit(caMoveKey(project, k.id, f));
					selected = k.id;
					setFrame(f);
				} catch (e) {
					position.value = k.frame;
					message(e.message, true);
				}
			};
			const name = el("input");
			name.value = k.name;
			name.maxLength = 80;
			name.setAttribute("aria-label", tr("关键帧名称", "Keyframe name"));
			name.onchange = () => {
				const next = JSON.parse(caSerialize(project));
				next.keys.find((x) => x.id === k.id).name = name.value.trim() || k.name;
				commit(next);
			};
			const easing = select([
				[
					"smooth",
					"缓入缓出",
					"Ease in/out"
				],
				[
					"linear",
					"匀速",
					"Linear"
				],
				[
					"ease-in",
					"逐渐加速",
					"Ease in"
				],
				[
					"ease-out",
					"逐渐减速",
					"Ease out"
				],
				[
					"hold",
					"保持后切换",
					"Hold / cut"
				]
			]);
			easing.value = k.easing;
			easing.setAttribute("aria-label", tr(`${k.name} 到下一帧的过渡`, `${k.name} transition`));
			easing.onchange = () => {
				const next = JSON.parse(caSerialize(project));
				next.keys.find((x) => x.id === k.id).easing = easing.value;
				commit(next);
			};
			const actions = el("div", null, "ca-key-actions"), jump = btn(tr("定位", "Go"), () => {
				selected = k.id;
				seek(k.frame);
				renderKeys();
			}), replace = btn(tr("更新视角", "Replace view"), () => {
				try {
					stop();
					commit(caPutKey(project, {
						frame: k.frame,
						snapshot: adapter.capture(),
						name: k.name
					}));
					message(tr(`已更新第 ${k.frame} 帧的视角。`, `Replaced frame ${k.frame} view.`));
				} catch (e) {
					message(e.message, true);
				}
			}), remove = btn("×", () => {
				const next = JSON.parse(caSerialize(project));
				next.keys = next.keys.filter((x) => x.id !== k.id);
				if (selected === k.id) selected = null;
				commit(next);
			});
			remove.setAttribute("aria-label", tr(`删除 ${k.name}`, `Delete ${k.name}`));
			actions.append(jump, replace, remove);
			row.append(position, name, easing, actions);
			list.append(row);
		}
		updatePlayhead();
	}
	function refresh() {
		const out = project.output;
		format.value = out.format;
		width.value = out.width;
		height.value = out.height;
		bitrate.value = out.bitrate / 1e6;
		guides.checked = out.guides;
		size.value = [...size.options].some((o) => o.value === `${out.width}x${out.height}`) ? `${out.width}x${out.height}` : "custom";
		bitrate.disabled = out.format === "png";
		if (!panel.hidden) adapter.setPreviewAspect?.(out.width / out.height);
		duration.value = Number(project.duration.toFixed(6));
		fps.value = project.fps;
		frame.max = scrub.max = total();
		meta.textContent = tr(`${total()} 帧 · ${project.keys.length} 个关键帧`, `${total()} frames · ${project.keys.length} keys`);
		undo.disabled = !past.length;
		redo.disabled = !future.length;
		const reason = compatible();
		add.disabled = !!reason;
		orbit.disabled = !adapter.ready();
		play.disabled = submit.disabled = !!reason || !project.keys.length;
		jsonButton.disabled = !project.keys.length;
		renderKeys();
		cache();
		if (reason && project.keys.length) message(tr("当前场景与动画不匹配：", "Scene mismatch: ") + reason, true);
	}
	const timing = () => {
		try {
			stop();
			commit(caResize(project, Number(duration.value), Number(fps.value), { stretch: resize.value === "stretch" }));
			setFrame(Math.min(cursor, total()));
		} catch (e) {
			duration.value = project.duration;
			fps.value = project.fps;
			message(e.message, true);
		}
	};
	duration.onchange = fps.onchange = timing;
	frame.onchange = () => seek(Number(frame.value));
	scrub.oninput = () => seek(Number(scrub.value));
	const at = (e) => {
		const r = track.getBoundingClientRect();
		return 1 + Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (total() - 1));
	};
	track.onpointerdown = (e) => {
		if (exporter || e.button !== 0 || e.target.closest("button")) return;
		stop();
		drag = { kind: "scrub" };
		track.setPointerCapture(e.pointerId);
		seek(at(e));
	};
	track.onpointermove = (e) => {
		if (!drag) return;
		const f = at(e);
		if (drag.kind === "key") {
			drag.frame = f;
			const mark = [...marks.children].find((n) => n.dataset.keyId === drag.id);
			if (mark) mark.style.left = `${(f - 1) / Math.max(1, total() - 1) * 100}%`;
			setFrame(f, false);
		} else seek(f);
	};
	const end = (e) => {
		if (!drag) return;
		const d = drag;
		drag = null;
		if (track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId);
		if (d.kind === "key") {
			try {
				if (e.type === "pointerup") {
					commit(caMoveKey(project, d.id, d.frame));
					selected = d.id;
					setFrame(d.frame);
				}
			} catch (err) {
				message(err.message, true);
			}
			renderKeys();
		}
	};
	track.onpointerup = track.onpointercancel = end;
	track.onlostpointercapture = () => {
		if (drag) {
			drag = null;
			renderKeys();
		}
	};
	input.onchange = async () => {
		const file = input.files?.[0];
		input.value = "";
		if (!file) return;
		try {
			if (file.size > 2097152) throw Error("Animation file exceeds 2 MB");
			const next = caParse(await file.text());
			if (next.space !== adapter.space) throw Error("相机坐标空间不匹配 / Camera space mismatch");
			stop();
			commit(next);
			cursor = 1;
			selected = null;
			refresh();
			message(compatible() || tr("动画已导入。", "Animation imported."), !!compatible());
		} catch (e) {
			message(e.message, true);
		}
	};
	async function saveJSON() {
		try {
			await saveLocalBlob(new Blob([caSerialize(project)], { type: "application/json" }), "BWV-camera-animation.json", { document: doc });
		} catch (error) {
			message(error.message, true);
		}
	}
	function saveOutput() {
		try {
			const next = JSON.parse(caSerialize(project));
			next.output = {
				format: format.value,
				width: Number(width.value),
				height: Number(height.value),
				bitrate: Number(bitrate.value) * 1e6,
				guides: guides.checked
			};
			commit(next);
		} catch (e) {
			message(e.message, true);
		}
	}
	const updateSize = () => {
		if (size.value !== "custom") {
			const [w, h] = size.value.split("x").map(Number);
			width.value = w;
			height.value = h;
		}
		saveOutput();
		if (!panel.hidden) adapter.setPreviewAspect?.(Number(width.value) / Number(height.value));
	};
	size.onchange = updateSize;
	for (const n of [width, height]) n.onchange = () => {
		size.value = "custom";
		saveOutput();
		if (!panel.hidden) adapter.setPreviewAspect?.(Number(width.value) / Number(height.value));
	};
	format.onchange = () => {
		bitrate.disabled = format.value === "png";
		saveOutput();
	};
	bitrate.onchange = guides.onchange = saveOutput;
	const inertNodes = [
		toolbar,
		anchor,
		doc.querySelector(".sidebar"),
		doc.querySelector(".main-heading"),
		doc.getElementById("selected-models"),
		doc.getElementById("viewer-inspector")
	].filter(Boolean), oldInert = /* @__PURE__ */ new Map();
	function exportLock(value) {
		for (const n of inertNodes) if (value) {
			oldInert.set(n, n.inert);
			n.inert = true;
		} else n.inert = oldInert.get(n) || false;
		if (!value) oldInert.clear();
		for (const n of panel.querySelectorAll("button,input,select,summary")) if (value) {
			n.dataset.caDisabled = String(n.disabled || false);
			if ("disabled" in n) n.disabled = true;
		} else if ("disabled" in n) {
			n.disabled = n.dataset.caDisabled === "true";
			delete n.dataset.caDisabled;
		}
		cancel.disabled = false;
		cancel.hidden = !value;
		close.disabled = value;
		toggle.disabled = value;
		anchor.classList.toggle("ca-recording", value);
	}
	async function exportVideo() {
		if (exporter) return;
		stop();
		const controller = new AbortController();
		exporter = controller;
		exportLock(true);
		progressWrap.hidden = false;
		progress.value = 0;
		result.hidden = true;
		message(tr("正在准备逐帧导出…", "Preparing frame-by-frame export…"));
		let writable = null;
		const fmt = format.value;
		try {
			if (direct.checked && typeof globalThis.showSaveFilePicker === "function") writable = await (await globalThis.showSaveFilePicker({
				suggestedName: `BWV-camera-animation.${fmt === "png" ? "zip" : fmt}`,
				types: [{
					description: fmt === "png" ? "PNG sequence ZIP" : fmt.toUpperCase(),
					accept: { [fmt === "png" ? "application/zip" : `video/${fmt}`]: [fmt === "png" ? ".zip" : "." + fmt] }
				}]
			})).createWritable();
			const started = performance.now();
			const { blob, info } = await caExportAnimation({
				project,
				adapter,
				width: Number(width.value),
				height: Number(height.value),
				format: fmt,
				bitrate: Number(bitrate.value) * 1e6,
				writable,
				includeGuides: guides.checked,
				signal: controller.signal,
				onProgress: (n, total) => {
					progress.value = n / total * 100;
					const elapsed = (performance.now() - started) / 1e3, left = n ? Math.max(0, elapsed * (total - n) / n) : 0;
					progressText.textContent = tr(`${n} / ${total} 帧 · ${Math.round(n / total * 100)}% · 约剩 ${Math.ceil(left)} 秒`, `${n} / ${total} frames · ${Math.round(n / total * 100)}% · ~${Math.ceil(left)} s left`);
					if (n === total) message(tr("所有帧已渲染，正在封装文件…", "All frames rendered; finalizing the file…"));
				}
			});
			resultInfo.textContent = tr(`实际输出：${info.encodedFrames} 帧 · ${info.duration.toFixed(3)} 秒 · ${info.fps} FPS · ${info.width}×${info.height} · ${info.codec}`, `Encoded: ${info.encodedFrames} frames · ${info.duration.toFixed(3)} s · ${info.fps} FPS · ${info.width}×${info.height} · ${info.codec}`);
			if (controller.signal.aborted) throw new DOMException("Canceled", "AbortError");
			if (blob) {
				if (resultURL) URL.revokeObjectURL(resultURL);
				resultURL = URL.createObjectURL(blob);
				download.href = resultURL;
				download.download = `BWV-camera-animation.${fmt === "png" ? "zip" : fmt}`;
				download.onclick = isMobileApp() ? async (event) => {
					event.preventDefault();
					try {
						await saveLocalBlob(blob, download.download, { document: doc });
					} catch (error) {
						message(error.message, true);
					}
				} : null;
				download.textContent = tr(`下载 ${fmt === "png" ? "PNG 帧序列 ZIP" : fmt.toUpperCase()} · ${(blob.size / 1048576).toFixed(1)} MB`, `Download ${fmt === "png" ? "PNG sequence ZIP" : fmt.toUpperCase()} · ${(blob.size / 1048576).toFixed(1)} MB`);
				video.hidden = fmt === "png";
				if (fmt !== "png") video.src = resultURL;
				result.hidden = false;
			}
			message(tr("导出完成。相机已恢复到导出前的视角。", "Export complete. The camera has returned to its pre-export view."));
			progress.value = 100;
		} catch (e) {
			await writable?.abort().catch(() => {});
			message(e.name === "AbortError" || controller.signal.aborted ? tr("导出已取消；相机已恢复。", "Export canceled; camera restored.") : e.message, e.name !== "AbortError" && !controller.signal.aborted);
		} finally {
			exporter = null;
			exportLock(false);
			refresh();
		}
	}
	const keyboard = (e) => {
		if (exporter) {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopImmediatePropagation();
				exporter.abort();
			}
			return;
		}
		if (!panel.contains(e.target) || [
			"INPUT",
			"SELECT",
			"TEXTAREA"
		].includes(e.target.tagName) || e.target.isContentEditable) return;
		if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
			e.preventDefault();
			const d = e.key === "ArrowRight" ? 1 : -1;
			if (e.shiftKey) {
				const keys = project.keys.filter((k) => d > 0 ? k.frame > cursor : k.frame < cursor);
				seek(keys.length ? (d > 0 ? keys[0] : keys.at(-1)).frame : d > 0 ? total() : 1);
			} else seek(cursor + d);
		} else if (e.key === " " && e.target.tagName !== "BUTTON") {
			e.preventDefault();
			playing ? stop() : start();
		}
	};
	doc.addEventListener("keydown", keyboard, true);
	const interrupt = () => {
		if (playing) stop();
	};
	adapter.canvas()?.addEventListener("pointerdown", interrupt, true);
	doc.addEventListener("visibilitychange", () => {
		if (doc.hidden) stop();
	});
	const body = el("div", null, "ca-body");
	for (const n of [...panel.children]) if (n !== header) body.append(n);
	panel.append(body);
	refresh();
	return {
		refresh() {
			stop();
			refresh();
		},
		getProject: () => caValidateProject(project),
		destroy() {
			stop();
			exporter?.abort();
			if (resultURL) URL.revokeObjectURL(resultURL);
			doc.removeEventListener("keydown", keyboard, true);
			adapter.canvas()?.removeEventListener("pointerdown", interrupt, true);
			adapter.setPreviewAspect?.(null);
			toggle.remove();
			panel.remove();
		}
	};
}
//#endregion
//#region src/shared/animation-render-target.js
/** One reusable offscreen target per export, shared by future renderer adapters. */
function createAnimationRenderTarget(viewer, width, height) {
	const gl = viewer.gl;
	if (viewer.disposed || viewer.contextLost || gl.isContextLost()) throw Error("渲染器不可用 / Renderer unavailable");
	validateImageSize(width, height, Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)));
	const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING), fb = gl.createFramebuffer(), texture = gl.createTexture(), depth = gl.createRenderbuffer();
	const raw = new Uint8Array(width * height * 4), pixels = new Uint8ClampedArray(raw.length);
	let disposed = false;
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		gl.deleteFramebuffer(fb);
		gl.deleteTexture(texture);
		gl.deleteRenderbuffer(depth);
	};
	try {
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
		gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
		if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw Error("无法分配导出画面，请降低分辨率 / Cannot allocate video frame; reduce resolution");
	} catch (e) {
		dispose();
		throw e;
	} finally {
		gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.bindRenderbuffer(gl.RENDERBUFFER, null);
	}
	return {
		render() {
			if (disposed || viewer.contextLost || gl.isContextLost()) throw Error("视频渲染已中断 / Video rendering interrupted");
			const before = gl.getParameter(gl.FRAMEBUFFER_BINDING), target = viewer.exportTarget;
			try {
				viewer.exportTarget = {
					width,
					height,
					transparent: false,
					scale: height / Math.max(1, viewer.canvas.clientHeight)
				};
				gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
				viewer.render();
				gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
				if (gl.getError() !== gl.NO_ERROR) throw Error("视频帧读取失败 / Frame readback failed");
				const stride = width * 4;
				for (let y = 0; y < height; y++) pixels.set(raw.subarray((height - y - 1) * stride, (height - y) * stride), y * stride);
				return pixels;
			} finally {
				viewer.exportTarget = target;
				gl.bindFramebuffer(gl.FRAMEBUFFER, before);
			}
		},
		dispose
	};
}
//#endregion
//#region src/lod/animation-adapter.js
/** Mesh-specific boundary. Shared timeline/export modules never import this viewer. */
function createMeshAnimationAdapter({ getViewer, getModels, getScene }) {
	let aspect = null, oldStyle = null;
	const resizePreview = () => {
		const v = getViewer();
		if (!v?.canvas || !aspect) return;
		const c = v.canvas, p = c.parentElement, w = Math.min(p.clientWidth, p.clientHeight * aspect), h = w / aspect;
		c.style.inset = "auto";
		c.style.position = "absolute";
		c.style.left = `${(p.clientWidth - w) / 2}px`;
		c.style.top = `${(p.clientHeight - h) / 2}px`;
		c.style.width = `${w}px`;
		c.style.height = `${h}px`;
		v.requestRender();
	};
	const observer = new ResizeObserver(resizePreview);
	if (getViewer()?.canvas) observer.observe(getViewer().canvas.parentElement);
	const ready = () => {
		const v = getViewer();
		return !!v && !v.disposed && !v.contextLost && !!v.triangleCount && getModels().length > 0;
	};
	const requireViewer = () => {
		if (!ready()) throw Error("请先加载网格模型 / Load a mesh first");
		return getViewer();
	};
	return {
		space: "lod-arrangement",
		ready,
		capture() {
			const v = requireViewer(), snapshot = captureCameraSnapshot(v, {
				space: "lod-arrangement",
				scene: getScene()
			});
			return validateCameraSnapshot({
				...snapshot,
				version: 2,
				camera: {
					...snapshot.camera,
					roll: snapshot.camera.roll || 0,
					distance: snapshot.camera.distance ?? v.distance,
					fov: snapshot.camera.fov ?? v.fov,
					near: snapshot.camera.near ?? v.near
				}
			}, {
				space: "lod-arrangement",
				scene: getScene()
			});
		},
		assert(snapshot) {
			requireViewer();
			validateCameraSnapshot(snapshot, {
				space: "lod-arrangement",
				scene: getScene()
			});
		},
		apply(snapshot, { render = true } = {}) {
			const v = requireViewer();
			v.fly?.leave();
			applyCameraSnapshot([v], snapshot, {
				space: "lod-arrangement",
				scene: getScene(),
				render
			});
		},
		guard() {
			const models = getModels(), scale = getScene().scale, v = getViewer();
			return () => ready() && getViewer() === v && getModels() === models && getScene().scale === scale;
		},
		createCapture(width, height) {
			return createAnimationRenderTarget(requireViewer(), width, height);
		},
		drawGuides(ctx, width, height) {
			const v = requireViewer();
			drawSceneGuides(ctx, v, Math.min(width, 420 * height / Math.max(1, v.canvas.clientHeight)), height, height / Math.max(1, v.canvas.clientHeight));
		},
		canvas() {
			return getViewer()?.canvas;
		},
		setPreviewAspect(value) {
			const v = getViewer();
			if (!v?.canvas) return;
			const c = v.canvas;
			aspect = Number.isFinite(value) && value > 0 ? value : null;
			if (aspect) {
				if (!oldStyle) oldStyle = Object.fromEntries([
					"inset",
					"position",
					"left",
					"top",
					"width",
					"height"
				].map((k) => [k, c.style[k]]));
				c.parentElement.classList.add("ca-composition");
				resizePreview();
			} else if (oldStyle) {
				for (const [k, v] of Object.entries(oldStyle)) c.style[k] = v;
				oldStyle = null;
				c.parentElement.classList.remove("ca-composition");
				v.requestRender();
			}
		},
		destroy() {
			observer.disconnect();
		}
	};
}
//#endregion
//#region src/shared/mesh-point-layer.js
/** A point pass in the mesh WebGL context: shared depth, camera and export target. */
var MeshPointLayer = class {
	constructor(gl) {
		this.gl = gl;
		this.entries = [];
		this.colorKey = "";
		const shaders = [[gl.VERTEX_SHADER, "attribute vec3 position;attribute vec3 color;uniform mat4 matrix;uniform float size;varying vec3 rgb;void main(){gl_Position=matrix*vec4(position,1.0);gl_PointSize=size;rgb=color;}"], [gl.FRAGMENT_SHADER, "precision mediump float;varying vec3 rgb;uniform float opacity;uniform int style;void main(){float r=length(gl_PointCoord-vec2(.5));if(style!=1&&r>.5)discard;float a=style==1?1.:1.-smoothstep(.4,.5,r);vec3 c=rgb;if(style==2){vec2 xy=(gl_PointCoord-vec2(.5))*2.;vec3 n=vec3(xy,-sqrt(max(0.,1.-dot(xy,xy))));c*=.4+.6*abs(dot(n,normalize(vec3(-.4,.6,1.))));}gl_FragColor=vec4(c,opacity*a);}"]].map(([type, source]) => {
			const shader = gl.createShader(type);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				const error = gl.getShaderInfoLog(shader);
				gl.deleteShader(shader);
				throw Error(error);
			}
			return shader;
		});
		this.program = gl.createProgram();
		for (const s of shaders) gl.attachShader(this.program, s);
		gl.linkProgram(this.program);
		for (const s of shaders) gl.deleteShader(s);
		if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(this.program));
		this.loc = {};
		for (const k of [
			"matrix",
			"size",
			"opacity",
			"style"
		]) this.loc[k] = gl.getUniformLocation(this.program, k);
		for (const k of ["position", "color"]) this.loc[k] = gl.getAttribLocation(this.program, k);
		this.maxSize = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];
		this.attributes = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
	}
	clear() {
		for (const e of this.entries) {
			this.gl.deleteBuffer(e.position);
			this.gl.deleteBuffer(e.color);
		}
		this.entries = [];
		this.colorKey = "";
	}
	buffer(values) {
		const gl = this.gl, b = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, b);
		gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
		if (gl.getError() === gl.OUT_OF_MEMORY) {
			gl.deleteBuffer(b);
			throw Error("点云显存不足 / Point buffer allocation failed");
		}
		return b;
	}
	setItems(items, placements) {
		const gl = this.gl, next = [];
		try {
			for (const item of items) {
				const transform = placements.get(String(item.id));
				if (!transform) continue;
				const old = this.entries.find((e) => e.item.cloud === item.cloud && e.item.id === item.id && JSON.stringify(e.transform) === JSON.stringify(transform));
				if (old) {
					old.item = item;
					next.push(old);
					continue;
				}
				const position = new Float32Array(item.cloud.count * 3);
				for (let i = 0; i < position.length; i++) position[i] = (item.cloud.positions[i] - transform.origin[i % 3]) * transform.scale + transform.center[i % 3];
				const e = {
					item,
					transform,
					position: this.buffer(position),
					color: null,
					count: item.cloud.count,
					bytes: position.byteLength * 2
				};
				next.push(e);
				e.color = this.buffer(new Float32Array(position.length));
			}
		} catch (error) {
			for (const e of next) if (!this.entries.includes(e)) {
				gl.deleteBuffer(e.position);
				if (e.color) gl.deleteBuffer(e.color);
			}
			throw error;
		}
		for (const e of this.entries) if (!next.includes(e)) {
			gl.deleteBuffer(e.position);
			gl.deleteBuffer(e.color);
		}
		this.entries = next;
		this.colorKey = "";
	}
	setOptions(options) {
		this.options = options;
		const key = JSON.stringify([
			options.pointColorMode,
			options.pointColor,
			options.palette,
			options.reverse,
			options.pointRgbFields,
			options.range
		]);
		if (key === this.colorKey) return;
		const mode = options.pointColorMode || "height", field = mode.startsWith("field:") ? mode.slice(6) : null;
		let min = Infinity, max = -Infinity;
		if (mode === "height" || field) for (const e of this.entries) {
			const cloud = e.item.cloud, values = field ? cloud.fields?.[field] : null;
			if (field && !values) continue;
			for (let i = 0; i < cloud.count; i++) {
				const v = field ? values[i] : cloud.positions[i * 3 + 2];
				if (Number.isFinite(v)) {
					min = Math.min(min, v);
					max = Math.max(max, v);
				}
			}
		}
		this.fallbacks = [];
		this.colorRange = min <= max ? options.range ? { ...options.range } : {
			min,
			max
		} : null;
		this.effectiveColorMode = mode;
		for (const e of this.entries) {
			const result = pointDisplayColors(e.item.cloud, e.count, {
				colorMode: mode,
				rgbFields: options.pointRgbFields,
				palette: options.palette,
				reverse: options.reverse,
				range: this.colorRange
			});
			if (mode === "solid") {
				const color = rgbHex(options.pointColor || "#547d99");
				for (let i = 0; i < e.count; i++) result.values.set(color, i * 3);
			}
			if (result.fallback) this.fallbacks.push(result.fallback);
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, e.color);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, result.values, this.gl.STATIC_DRAW);
		}
		this.colorKey = key;
	}
	draw(matrix, dpr) {
		const gl = this.gl, o = this.options || {}, l = this.loc;
		if (o.showPoints === false || !this.entries.length) return;
		for (let i = 0; i < this.attributes; i++) gl.disableVertexAttribArray(i);
		gl.useProgram(this.program);
		gl.uniformMatrix4fv(l.matrix, false, matrix);
		gl.uniform1f(l.size, Math.min(this.maxSize, Math.max(.5, Number(o.pointSize) || 2) * dpr));
		gl.uniform1f(l.opacity, o.pointOpacity ?? 1);
		gl.uniform1i(l.style, o.pointStyle === "square" ? 1 : o.pointStyle === "sphere" ? 2 : 0);
		gl.enable(gl.DEPTH_TEST);
		gl.depthMask((o.pointOpacity ?? 1) >= 1);
		gl.enableVertexAttribArray(l.position);
		gl.enableVertexAttribArray(l.color);
		for (const e of this.entries) {
			gl.bindBuffer(gl.ARRAY_BUFFER, e.position);
			gl.vertexAttribPointer(l.position, 3, gl.FLOAT, false, 12, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, e.color);
			gl.vertexAttribPointer(l.color, 3, gl.FLOAT, false, 12, 0);
			gl.drawArrays(gl.POINTS, 0, e.count);
		}
		gl.disableVertexAttribArray(l.position);
		gl.disableVertexAttribArray(l.color);
		gl.depthMask(true);
	}
	dispose() {
		this.clear();
		this.gl.deleteProgram(this.program);
	}
};
//#endregion
//#region src/lod/renderer.js
/** Local, dependency-free mesh renderer. Building placement is synthetic; geometry and scale are preserved. */
var DEG = Math.PI / 180;
var dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var clamp = (value, low, high) => Math.max(low, Math.min(high, value));
var PALETTE = [
	[
		.39,
		.57,
		.67
	],
	[
		.64,
		.61,
		.46
	],
	[
		.5,
		.63,
		.58
	],
	[
		.62,
		.52,
		.64
	],
	[
		.67,
		.53,
		.43
	],
	[
		.45,
		.61,
		.72
	],
	[
		.65,
		.61,
		.69
	],
	[
		.55,
		.66,
		.46
	]
];
var VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec3 buildingColor;
attribute float vertexHeight;
uniform vec2 heightTransform;
varying highp float heightValue;
uniform mat4 matrix;
uniform mediump int kind;
uniform mediump int colorByBuilding;
varying vec4 color;
varying vec3 surfaceNormal;
void main() {
  gl_Position = matrix * vec4(position, 1.0);
  surfaceNormal = normal;
  heightValue = vertexHeight * heightTransform.y + heightTransform.x;
  if (kind == 0) {
    vec3 base = abs(normal.z) > .22 ? vec3(.46, .59, .67) : vec3(.91, .89, .84);
    if (colorByBuilding == 1) base = buildingColor * (abs(normal.z) > .22 ? .86 : 1.13);
    float light = 1.0;
    color = vec4(base * light, 1.0);
  } else if (kind == 2) {
    color = vec4(.67, .71, .74, .24);
  } else if (kind == 3) {
    color = vec4(.23, .36, .43, .64);
  } else {
    color = vec4(.23, .31, .36, .65);
  }
}`;
var FRAGMENT_SHADER = `
precision mediump float;
varying vec4 color;
varying vec3 surfaceNormal;
uniform int surfaceStyle;
uniform vec3 viewDirection;
varying highp float heightValue;
uniform mediump int kind;
uniform mediump int colorByBuilding;
${PALETTE_GLSL}
void main() {
  gl_FragColor = colorByBuilding == 2 && (kind == 0 || kind == 3)
    ? vec4(paletteColor(heightValue), kind == 0 ? 1.0 : .9) : color;
  if(kind==0 && surfaceStyle!=1) {
    vec3 n=normalize(surfaceNormal),lightDirection=normalize(vec3(-.5,-.7,1.1));
    gl_FragColor.rgb *= .75+.25*abs(dot(n,lightDirection));
    if(surfaceStyle==2)gl_FragColor.rgb+=vec3(.3)*pow(abs(dot(n,normalize(lightDirection+viewDirection))),32.);
  }
}`;
var MeshViewer = class {
	constructor(canvas, { onLabels = () => {}, onError = () => {}, onViewChange = () => {} } = {}) {
		this.canvas = canvas;
		this.onLabels = onLabels;
		this.onError = onError;
		this.onViewChange = onViewChange;
		this.options = {
			...currentPresentation(),
			mode: "solid",
			edges: true,
			colors: "surface",
			grid: true,
			labels: true,
			scale: "real",
			...currentPalettePreferences()
		};
		this.camera = {
			elevation: 38,
			azimuth: -55,
			zoom: 1,
			pan: [0, 0]
		};
		this.baseHeight = 30;
		this.sceneBounds = [[
			-5,
			-5,
			0
		], [
			5,
			5,
			10
		]];
		this.target = [
			0,
			0,
			5
		];
		this.models = [];
		this.labelAnchors = [];
		this.buffers = {};
		this.triangleCount = 0;
		this.disposed = false;
		this.contextLost = false;
		this.frame = null;
		this.listeners = [];
		try {
			this.gl = canvas.getContext("webgl", {
				antialias: true,
				alpha: false,
				preserveDrawingBuffer: true
			});
			if (!this.gl) throw new Error(t("此浏览器无法启用 WebGL，请检查浏览器的硬件加速设置。"));
			this.initGL();
		} catch (error) {
			this.onError(error.message);
			throw error;
		}
		installCameraNavigation(this);
		this.pickOrbitDepth = (...args) => pickMeshNavigationDepth(this, ...args);
		this.installEvents();
		this.resizeObserver = new ResizeObserver(() => this.requestRender());
		this.resizeObserver.observe(canvas);
		this.render();
	}
	initGL() {
		const gl = this.gl;
		const compile = (type, source) => {
			const shader = gl.createShader(type);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				const message = gl.getShaderInfoLog(shader);
				gl.deleteShader(shader);
				throw new Error(t("WebGL 着色器编译失败：{0}", [message]));
			}
			return shader;
		};
		const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
		const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
		const program = gl.createProgram();
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		gl.linkProgram(program);
		gl.deleteShader(vertex);
		gl.deleteShader(fragment);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			const message = gl.getProgramInfoLog(program);
			gl.deleteProgram(program);
			throw new Error(t("WebGL 程序链接失败：{0}", [message]));
		}
		this.program = program;
		this.styledLines = new StyledLineRenderer(gl);
		this.pointLayer = null;
		this.locations = {
			surfaceStyle: gl.getUniformLocation(program, "surfaceStyle"),
			viewDirection: gl.getUniformLocation(program, "viewDirection"),
			position: gl.getAttribLocation(program, "position"),
			normal: gl.getAttribLocation(program, "normal"),
			buildingColor: gl.getAttribLocation(program, "buildingColor"),
			vertexHeight: gl.getAttribLocation(program, "vertexHeight"),
			heightTransform: gl.getUniformLocation(program, "heightTransform"),
			colorStops: gl.getUniformLocation(program, "colorStops[0]"),
			matrix: gl.getUniformLocation(program, "matrix"),
			kind: gl.getUniformLocation(program, "kind"),
			colorByBuilding: gl.getUniformLocation(program, "colorByBuilding")
		};
	}
	installEvents() {
		const listen = (name, fn, options) => {
			this.canvas.addEventListener(name, fn, options);
			this.listeners.push([
				name,
				fn,
				options
			]);
		};
		this.canvas.style.touchAction = "none";
		listen("contextmenu", (event) => event.preventDefault());
		mountTouchCamera(this, listen, { minElevation: 0 });
		listen("pointerdown", (event) => {
			if (this.fly?.active || event.pointerType === "touch") return;
			if (event.button !== 0 && event.button !== 2 && event.button !== 1) return;
			event.preventDefault();
			this.canvas.setPointerCapture(event.pointerId);
			this.beginOrbit(event.button !== 0 || event.shiftKey);
			this.drag = {
				pointerId: event.pointerId,
				x: event.clientX,
				y: event.clientY,
				pan: event.button !== 0 || event.shiftKey
			};
			this.canvas.style.cursor = "grabbing";
		});
		listen("pointermove", (event) => {
			if (this.fly?.active || event.pointerType === "touch") return;
			if (!this.drag || this.drag.pointerId !== event.pointerId) return;
			const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
			this.drag.x = event.clientX;
			this.drag.y = event.clientY;
			this.navigatePixels(dx, dy, this.drag.pan || event.shiftKey, event.ctrlKey || event.metaKey);
			this.requestRender();
		});
		const finish = (event) => {
			if (this.drag?.pointerId !== event.pointerId) return;
			this.drag = null;
			this.canvas.style.cursor = "grab";
			if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
		};
		listen("pointerup", finish);
		listen("pointercancel", finish);
		listen("lostpointercapture", finish);
		listen("dblclick", (event) => {
			if (this.fly?.active || event.button !== 0) return;
			const rect = this.canvas.getBoundingClientRect();
			this.focusOrbit(event.clientX - rect.left, event.clientY - rect.top);
		});
		listen("wheel", (event) => {
			event.preventDefault();
			const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.canvas.clientHeight : 1);
			this.zoomBy(Math.exp(-clamp(delta, -500, 500) * .0015));
		}, { passive: false });
		listen("webglcontextlost", (event) => {
			event.preventDefault();
			this.stopNavigation();
			this.contextLost = true;
			this.onError(t("WebGL 显示上下文暂时丢失，正在等待浏览器恢复。"));
		});
		listen("webglcontextrestored", () => {
			this.contextLost = false;
			try {
				this.buffers = {};
				this.initGL();
				this.setModels(this.models, this.sceneData);
				this.onError("");
			} catch (error) {
				this.onError(error.message);
			}
		});
	}
	makeBuffer(values) {
		const gl = this.gl, buffer = gl.createBuffer();
		if (!buffer) throw new Error(t("无法分配 WebGL 缓冲区，请减少同时查看的模型数量。"));
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
		if (gl.getError() === gl.OUT_OF_MEMORY) {
			gl.deleteBuffer(buffer);
			throw new Error(t("显存不足，请减少同时查看的模型数量。"));
		}
		return {
			buffer,
			count: values.length / 10,
			byteLength: values.length * 4
		};
	}
	setModels(models, { referenceModels = models, clouds = [] } = {}) {
		this.sceneData = {
			referenceModels,
			clouds
		};
		this.stopNavigation();
		if (!Array.isArray(models)) throw new TypeError(t("setModels 需要模型数组。"));
		const prepared = referenceModels.map((reference) => {
			const model = models.find((item) => String(item.id) === String(reference.id)) || {
				...reference,
				faces: []
			};
			if (!model.vertices?.length || !Array.isArray(model.faces)) throw new Error(t("模型 {0} 缺少有效网格。", [model.id]));
			const min = [
				Infinity,
				Infinity,
				Infinity
			], max = [
				-Infinity,
				-Infinity,
				-Infinity
			];
			for (const point of reference.vertices) {
				if (point.length < 3 || !point.slice(0, 3).every(Number.isFinite)) throw new Error(t("模型 {0} 包含无效坐标。", [model.id]));
				for (let i = 0; i < 3; i++) {
					min[i] = Math.min(min[i], point[i]);
					max[i] = Math.max(max[i], point[i]);
				}
			}
			const extent = Math.max(...max.map((value, i) => value - min[i]));
			const scale = this.options.scale === "normalized" && extent > 0 ? 30 / extent : 1;
			return {
				model,
				min,
				max,
				scale,
				width: (max[0] - min[0]) * scale,
				depth: (max[1] - min[1]) * scale
			};
		});
		const columns = Math.ceil(Math.sqrt(prepared.length)), rows = Math.ceil(prepared.length / (columns || 1));
		const widths = Array(columns).fill(0), depths = Array(rows).fill(0);
		for (let i = 0; i < prepared.length; i++) {
			widths[i % columns] = Math.max(widths[i % columns], prepared[i].width);
			depths[Math.floor(i / columns)] = Math.max(depths[Math.floor(i / columns)], prepared[i].depth);
		}
		const typical = prepared.map((item) => Math.max(item.width, item.depth)).sort((a, b) => a - b);
		const gap = Math.max(2, (typical[Math.floor(typical.length / 2)] || 10) * .35);
		const totalWidth = widths.reduce((sum, value) => sum + value, 0) + Math.max(0, columns - 1) * gap;
		const totalDepth = depths.reduce((sum, value) => sum + value, 0) + Math.max(0, rows - 1) * gap;
		const centers = (values) => {
			let offset = 0;
			return values.map((value) => {
				const center = offset + value / 2;
				offset += value + gap;
				return center;
			});
		};
		const xCenters = centers(widths), yCenters = centers(depths);
		const triangles = [], featureEdges = [], allEdges = [], labels = [];
		let maxHeight = 0, maxOriginalHeight = 0;
		const placements = /* @__PURE__ */ new Map();
		const vertexOut = (array, position, normal, color, height = 0) => array.push(...position, ...normal, ...color, height);
		const featureCosine = Math.cos(10 * DEG);
		for (let modelIndex = 0; modelIndex < prepared.length; modelIndex++) {
			const { model, min, max, scale } = prepared[modelIndex];
			const cx = xCenters[modelIndex % columns] - totalWidth / 2;
			const cy = totalDepth / 2 - yCenters[Math.floor(modelIndex / columns)];
			placements.set(String(model.id), {
				origin: [
					(min[0] + max[0]) / 2,
					(min[1] + max[1]) / 2,
					min[2]
				],
				center: [
					cx,
					cy,
					0
				],
				scale
			});
			const vertices = model.vertices.map((v) => [
				(v[0] - (min[0] + max[0]) / 2) * scale + cx,
				(v[1] - (min[1] + max[1]) / 2) * scale + cy,
				(v[2] - min[2]) * scale
			]);
			const height = (max[2] - min[2]) * scale;
			maxHeight = Math.max(maxHeight, height);
			let meshMinZ = Infinity, meshMaxZ = -Infinity;
			for (const point of model.vertices) {
				meshMinZ = Math.min(meshMinZ, point[2]);
				meshMaxZ = Math.max(meshMaxZ, point[2]);
			}
			const meshHeightOffset = min[2] - meshMinZ;
			if (model.faces.length) maxOriginalHeight = Math.max(maxOriginalHeight, meshMaxZ - meshMinZ);
			labels.push({
				id: model.id,
				bounds: [[
					cx - prepared[modelIndex].width / 2,
					cy - prepared[modelIndex].depth / 2,
					0
				], [
					cx + prepared[modelIndex].width / 2,
					cy + prepared[modelIndex].depth / 2,
					height
				]]
			});
			let hash = 0;
			for (const char of String(model.id)) hash = hash * 31 + char.charCodeAt(0) >>> 0;
			const color = PALETTE[hash % PALETTE.length];
			const unique = /* @__PURE__ */ new Map();
			const welded = vertices.map((v, index) => {
				const key = v.join(",");
				if (!unique.has(key)) unique.set(key, index);
				return unique.get(key);
			});
			const edges = /* @__PURE__ */ new Map();
			for (const face of model.faces) {
				if (face.length !== 3 || !face.every((index) => Number.isInteger(index) && index >= 0 && index < vertices.length)) throw new Error(t("模型 {0} 包含无效三角面。", [model.id]));
				const [a, b, c] = face.map((index) => vertices[index]);
				const ab = b.map((value, i) => value - a[i]), ac = c.map((value, i) => value - a[i]);
				const normal = [
					ab[1] * ac[2] - ab[2] * ac[1],
					ab[2] * ac[0] - ab[0] * ac[2],
					ab[0] * ac[1] - ab[1] * ac[0]
				];
				const length = Math.hypot(...normal);
				if (length < 1e-12) continue;
				for (let i = 0; i < 3; i++) normal[i] /= length;
				for (const point of [
					a,
					b,
					c
				]) vertexOut(triangles, point, normal, color, point[2] / scale + meshHeightOffset);
				for (let i = 0; i < 3; i++) {
					const ai = welded[face[i]], bi = welded[face[(i + 1) % 3]];
					const key = ai < bi ? `${ai}:${bi}` : `${bi}:${ai}`;
					if (!edges.has(key)) edges.set(key, {
						a: vertices[ai],
						b: vertices[bi],
						normals: []
					});
					edges.get(key).normals.push(normal);
				}
			}
			for (const edge of edges.values()) {
				vertexOut(allEdges, edge.a, [
					0,
					0,
					1
				], color, edge.a[2] / scale + meshHeightOffset);
				vertexOut(allEdges, edge.b, [
					0,
					0,
					1
				], color, edge.b[2] / scale + meshHeightOffset);
				const normals = edge.normals;
				if (normals.length !== 2 || Math.abs(dot(normals[0], normals[1])) < featureCosine) {
					vertexOut(featureEdges, edge.a, [
						0,
						0,
						1
					], color, edge.a[2] / scale + meshHeightOffset);
					vertexOut(featureEdges, edge.b, [
						0,
						0,
						1
					], color, edge.b[2] / scale + meshHeightOffset);
				}
			}
		}
		const nextBuffers = {};
		try {
			nextBuffers.triangles = this.makeBuffer(triangles);
			nextBuffers.featureEdges = this.makeBuffer(featureEdges);
			nextBuffers.allEdges = this.makeBuffer(allEdges);
			const grid = [], span = Math.max(totalWidth, totalDepth, 10) * .7 + gap;
			const roughStep = span / 15, power = Math.pow(10, Math.floor(Math.log10(roughStep)));
			const unit = roughStep / power;
			const step = (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
			const gridExtent = Math.ceil(span / step) * step;
			const z = -Math.max(.005, maxHeight * 1e-4);
			for (let k = -Math.floor(gridExtent / step); k <= Math.floor(gridExtent / step); k++) for (const point of [
				[
					k * step,
					-gridExtent,
					z
				],
				[
					k * step,
					gridExtent,
					z
				],
				[
					-gridExtent,
					k * step,
					z
				],
				[
					gridExtent,
					k * step,
					z
				]
			]) vertexOut(grid, point, [
				0,
				0,
				1
			], [
				1,
				1,
				1
			]);
			nextBuffers.grid = this.makeBuffer(grid);
		} catch (error) {
			for (const item of Object.values(nextBuffers)) this.gl.deleteBuffer(item.buffer);
			this.onError(error.message);
			throw error;
		}
		for (const item of Object.values(this.buffers)) this.gl.deleteBuffer(item.buffer);
		this.buffers = nextBuffers;
		const retainPositions = (values) => {
			const positions = new Float32Array(values.length / 10 * 3);
			for (let i = 0, j = 0; i < values.length; i += 10) for (let axis = 0; axis < 3; axis++) positions[j++] = values[i + axis];
			return positions;
		};
		this.edgePositions = {
			all: retainPositions(allEdges),
			feature: retainPositions(featureEdges)
		};
		this.navigationTriangles = retainPositions(triangles);
		if (clouds.length && !this.pointLayer) this.pointLayer = new MeshPointLayer(this.gl);
		this.pointLayer?.setItems(clouds, placements);
		this.pointLayer?.setOptions(this.options);
		this.pointCount = clouds.reduce((n, item) => n + item.cloud.count, 0);
		this.models = models;
		this.labelAnchors = labels;
		this.triangleCount = triangles.length / 30;
		this.heightRange = models.length ? {
			min: 0,
			max: maxOriginalHeight
		} : null;
		this.sceneBounds = prepared.length ? [[
			-totalWidth / 2,
			-totalDepth / 2,
			0
		], [
			totalWidth / 2,
			totalDepth / 2,
			maxHeight
		]] : [[
			-5,
			-5,
			0
		], [
			5,
			5,
			10
		]];
		this.target = prepared.length ? [
			0,
			0,
			maxHeight / 2
		] : [
			0,
			0,
			5
		];
		this.fit();
	}
	setOptions(options) {
		const next = {
			...this.options,
			...options
		};
		if (![
			"solid",
			"wire",
			"solid-wire"
		].includes(next.mode)) throw new Error(t("不支持的显示模式：{0}", [next.mode]));
		if (![
			"surface",
			"building",
			"height"
		].includes(next.colors)) throw new Error(t("不支持的配色模式：{0}", [next.colors]));
		if (!["real", "normalized"].includes(next.scale)) throw new Error(t("不支持的比例模式：{0}", [next.scale]));
		next.palette ||= "current";
		next.reverse = !!next.reverse;
		next.range = next.range ? { ...next.range } : null;
		validatePaletteOptions(next);
		if (next.lineStyle !== "native" && !this.styledLines?.ext) throw Error(t("此浏览器不支持立体线，请使用细线。"));
		const rebuild = next.scale !== this.options.scale;
		this.options = next;
		if (rebuild) this.setModels(this.models, this.sceneData);
		else {
			this.pointLayer?.setOptions(next);
			this.render();
		}
	}
	vectorSegments() {
		const values = this.options.mode === "wire" || this.options.mode === "solid-wire" ? this.edgePositions?.all : this.options.edges ? this.edgePositions?.feature : null;
		const segments = [];
		if (values) for (let i = 0; i < values.length; i += 6) segments.push([Array.from(values.subarray(i, i + 3)), Array.from(values.subarray(i + 3, i + 6))]);
		return segments;
	}
	setView(view) {
		this.stopNavigation();
		const views = {
			iso: [38, -55],
			top: [90, -90],
			front: [0, -90]
		};
		if (!views[view]) throw new Error(t("不支持的视角：{0}", [view]));
		[this.camera.elevation, this.camera.azimuth] = views[view];
		this.fit();
	}
	basis() {
		return navigationBasis(this);
	}
	fit() {
		this.resetNavigation();
		const [right, up] = this.basis(), [min, max] = this.sceneBounds;
		let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
		for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
			const point = [
				x,
				y,
				z
			], projectedX = dot(point, right), projectedY = dot(point, up);
			xMin = Math.min(xMin, projectedX);
			xMax = Math.max(xMax, projectedX);
			yMin = Math.min(yMin, projectedY);
			yMax = Math.max(yMax, projectedY);
		}
		const aspect = Math.max(1, this.canvas.clientWidth) / Math.max(1, this.canvas.clientHeight);
		this.baseHeight = Math.max(2, yMax - yMin, (xMax - xMin) / aspect) * 1.3;
		this.camera.zoom = 1;
		this.camera.pan = [0, 0];
		this.target = this.sceneBounds[0].map((v, i) => (v + this.sceneBounds[1][i]) / 2);
		this.distance = Math.max(.001, this.baseHeight, Math.hypot(...this.sceneBounds[1].map((v, i) => v - this.sceneBounds[0][i]))) * 2;
		this.near = Math.max(1e-6, this.distance * 1e-5);
		this.render();
	}
	zoomBy(factor, precision = false, repivot = true) {
		this.navigationZoom(factor, precision, repivot);
	}
	matrix() {
		if (this.projection === "perspective") return navigationMatrix(this);
		const [r, u, t] = this.basis();
		const aspect = (this.exportTarget?.width || this.canvas.width) / Math.max(1, this.exportTarget?.height || this.canvas.height);
		const height = this.baseHeight / this.camera.zoom, width = height * aspect;
		const cx = dot(this.target, r) + this.camera.pan[0], cy = dot(this.target, u) + this.camera.pan[1];
		const depth = Math.max(10, Math.hypot(...this.sceneBounds[1].map((v, i) => v - this.sceneBounds[0][i]))) * 4;
		return new Float32Array([
			2 * r[0] / width,
			2 * u[0] / height,
			-t[0] / depth,
			0,
			2 * r[1] / width,
			2 * u[1] / height,
			-t[1] / depth,
			0,
			2 * r[2] / width,
			2 * u[2] / height,
			-t[2] / depth,
			0,
			-2 * cx / width,
			-2 * cy / height,
			dot(this.target, t) / depth,
			1
		]);
	}
	requestRender() {
		if (this.frame !== null || this.disposed) return;
		this.frame = requestAnimationFrame(() => {
			this.frame = null;
			this.render();
		});
	}
	render() {
		if (this.disposed || this.contextLost) return;
		if (this.frame !== null) {
			cancelAnimationFrame(this.frame);
			this.frame = null;
		}
		this.stepNavigation();
		const canvas = this.canvas, gl = this.gl, rect = canvas.getBoundingClientRect();
		const dpr = this.exportTarget?.scale || Math.min(window.devicePixelRatio || 1, 2);
		const width = this.exportTarget?.width || Math.max(1, Math.round(rect.width * dpr)), height = this.exportTarget?.height || Math.max(1, Math.round(rect.height * dpr));
		if (!this.exportTarget && (canvas.width !== width || canvas.height !== height)) {
			canvas.width = width;
			canvas.height = height;
		}
		const matrix = this.matrix(), loc = this.locations;
		gl.viewport(0, 0, width, height);
		gl.depthMask(true);
		gl.clearColor(this.exportTarget?.transparent ? 0 : .951, this.exportTarget?.transparent ? 0 : .96, this.exportTarget?.transparent ? 0 : .965, this.exportTarget?.transparent ? 0 : 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.useProgram(this.program);
		gl.uniformMatrix4fv(loc.matrix, false, matrix);
		gl.uniform1i(loc.surfaceStyle, this.options.surfaceStyle === "unlit" ? 1 : this.options.surfaceStyle === "gloss" ? 2 : 0);
		gl.uniform3fv(loc.viewDirection, this.basis()[2]);
		gl.uniform1i(loc.colorByBuilding, this.options.colors === "height" ? 2 : this.options.colors === "building" ? 1 : 0);
		gl.uniform3fv(loc.colorStops, paletteUniforms(this.options.palette, this.options.reverse));
		const range = this.options.range || this.heightRange, span = range ? range.max - range.min : 0;
		gl.uniform2f(loc.heightTransform, span > 0 ? -range.min / span : .5, span > 0 ? 1 / span : 0);
		for (const location of [
			loc.position,
			loc.normal,
			loc.buildingColor,
			loc.vertexHeight
		]) gl.enableVertexAttribArray(location);
		gl.disable(gl.CULL_FACE);
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.enable(gl.BLEND);
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		const draw = (buffer, kind, primitive) => {
			if (!buffer?.count) return;
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
			gl.vertexAttribPointer(loc.position, 3, gl.FLOAT, false, 40, 0);
			gl.vertexAttribPointer(loc.normal, 3, gl.FLOAT, false, 40, 12);
			gl.vertexAttribPointer(loc.buildingColor, 3, gl.FLOAT, false, 40, 24);
			gl.vertexAttribPointer(loc.vertexHeight, 1, gl.FLOAT, false, 40, 36);
			gl.uniform1i(loc.kind, kind);
			gl.drawArrays(primitive, 0, buffer.count);
		};
		if (this.options.grid && this.models.length) draw(this.buffers.grid, 2, gl.LINES);
		if (this.options.showMesh !== false && this.options.mode !== "wire") {
			gl.enable(gl.POLYGON_OFFSET_FILL);
			gl.polygonOffset(1, 1);
			draw(this.buffers.triangles, 0, gl.TRIANGLES);
			gl.disable(gl.POLYGON_OFFSET_FILL);
		}
		const all = this.options.mode === "wire" || this.options.mode === "solid-wire";
		const edgeBuffer = this.options.showMesh === false ? null : all ? this.buffers.allEdges : this.options.edges ? this.buffers.featureEdges : null;
		if (this.options.lineStyle === "native") draw(edgeBuffer, all ? 3 : 1, gl.LINES);
		else this.styledLines.draw({
			buffer: edgeBuffer,
			stride: 40,
			matrix,
			radius: this.options.lineWidth / 2 * this.baseHeight / this.camera.zoom / Math.max(1, rect.height),
			style: this.options.lineStyle,
			color: [
				.23,
				.36,
				.43
			],
			endColor: this.options.lineGradient ? this.options.lineEndColor : null
		});
		this.pointLayer?.draw(matrix, dpr);
		if (this.exportTarget) return;
		updateSceneGuides(this);
		this.onLabels(this.options.labels ? this.labelAnchors.map(({ id, bounds: [min, max] }) => {
			let xMin = Infinity, xMax = -Infinity, yMin = Infinity;
			for (const px of [min[0], max[0]]) for (const py of [min[1], max[1]]) for (const pz of [min[2], max[2]]) {
				const w = matrix[3] * px + matrix[7] * py + matrix[11] * pz + matrix[15];
				if (w <= 0) continue;
				const x = (matrix[0] * px + matrix[4] * py + matrix[8] * pz + matrix[12]) / w;
				const y = (matrix[1] * px + matrix[5] * py + matrix[9] * pz + matrix[13]) / w;
				xMin = Math.min(xMin, x);
				xMax = Math.max(xMax, x);
				yMin = Math.min(yMin, y);
			}
			const x = (xMin + xMax) / 2;
			const screenY = (1 - yMin) * rect.height / 2 + 8;
			return {
				id,
				x: (x + 1) * rect.width / 2,
				y: screenY,
				visible: x > -.99 && x < .99 && screenY >= 0 && screenY < rect.height - 24
			};
		}) : []);
		this.onViewChange?.(this.getState());
	}
	getState() {
		return {
			buildingCount: this.models.length,
			triangleCount: this.triangleCount,
			pointCount: this.pointLayer?.entries.reduce((n, e) => n + e.count, 0) || 0,
			featureEdgeCount: (this.buffers.featureEdges?.count || 0) / 2,
			allEdgeCount: (this.buffers.allEdges?.count || 0) / 2,
			syntheticArrangement: true,
			heightMeaning: "height-above-building-min-z",
			dataRange: this.heightRange ? { ...this.heightRange } : null,
			colorRange: this.options.colors === "height" && this.heightRange ? { ...this.options.range || this.heightRange } : null,
			camera: {
				...this.camera,
				pan: [...this.camera.pan],
				baseHeight: this.baseHeight
			},
			options: { ...this.options },
			bounds: this.sceneBounds.map((point) => [...point])
		};
	}
	destroy() {
		this.fly?.dispose();
		if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onNavigationVisibility);
		this.disposed = true;
		if (this.frame !== null) cancelAnimationFrame(this.frame);
		this.resizeObserver.disconnect();
		for (const [name, fn, options] of this.listeners) this.canvas.removeEventListener(name, fn, options);
		for (const item of Object.values(this.buffers)) this.gl.deleteBuffer(item.buffer);
		this.styledLines?.dispose();
		this.pointLayer?.dispose();
		this.guideCanvas?.remove();
		this.gl.deleteProgram(this.program);
		this.onLabels([]);
	}
};
//#endregion
//#region src/lod/obj-parser.js
/** Parse triangular OBJ geometry without altering source coordinates. */
function parseOBJ(text, id, bytes = 0) {
	const vertices = [], faces = [];
	const bounds = [[
		Infinity,
		Infinity,
		Infinity
	], [
		-Infinity,
		-Infinity,
		-Infinity
	]];
	let lineNumber = 0;
	for (const line of text.split(/\r?\n/)) {
		lineNumber++;
		const tokens = line.split("#")[0].trim().split(/\s+/);
		if (tokens[0] === "v") {
			const vertex = tokens.slice(1, 4).map(Number);
			if (vertex.length !== 3 || vertex.some((v) => !Number.isFinite(v))) throw Error(t("第 {0} 行顶点坐标无效", [lineNumber]));
			vertices.push(vertex);
			vertex.forEach((value, axis) => {
				bounds[0][axis] = Math.min(bounds[0][axis], value);
				bounds[1][axis] = Math.max(bounds[1][axis], value);
			});
		} else if (tokens[0] === "f") {
			if (tokens.length !== 4) throw Error(t("第 {0} 行不是三角面，当前查看器需要三角化 OBJ", [lineNumber]));
			faces.push(tokens.slice(1).map((token) => {
				const index = Number(token.split("/")[0]);
				if (!Number.isSafeInteger(index) || index === 0) throw Error(t("第 {0} 行面索引无效", [lineNumber]));
				const resolved = index > 0 ? index - 1 : vertices.length + index;
				if (resolved < 0) throw Error(t("第 {0} 行面索引越界", [lineNumber]));
				return resolved;
			}));
		}
	}
	if (!vertices.length || !faces.length) throw Error(t("OBJ 中没有可显示的顶点和三角面"));
	if (faces.some((face) => face.some((index) => index >= vertices.length))) throw Error(t("OBJ 面索引超出顶点范围"));
	return {
		id,
		vertices,
		faces,
		bounds,
		stats: {
			vertices: vertices.length,
			triangles: faces.length,
			bytes
		}
	};
}
//#endregion
//#region src/lod/selection.js
/** Expand ranges against imported IDs, never allocate an arbitrary numeric interval. */
function parseLodIds(value, catalogById) {
	if (!value.trim()) return [];
	const tokens = value.trim().replace(/\s*[-–—~～]\s*/g, "-").split(/[\s,，;；、]+/).filter(Boolean);
	const result = /* @__PURE__ */ new Set();
	for (const token of tokens) {
		if (catalogById.has(token)) {
			result.add(token);
			continue;
		}
		const match = token.match(/^#?(\d+)(?:-(\d+))?$/);
		if (!match) throw Error(t("无法识别“{0}”。请使用编号或范围，例如 1, 3, 100-105。", [token]));
		const start = Number(match[1]), end = match[2] ? Number(match[2]) : start;
		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) throw Error(t("编号范围不正确：{0}", [token]));
		if (!match[2]) {
			result.add(String(start));
			continue;
		}
		const matches = [...catalogById.keys()].filter((id) => String(Number(id)) === id && Number(id) >= start && Number(id) <= end).sort((a, b) => Number(a) - Number(b));
		if (matches.length !== end - start + 1) throw Error(t("编号范围 {0} 包含未导入的模型，请检查编号。", [token]));
		for (const id of matches) result.add(id);
	}
	return [...result];
}
//#endregion
//#region src/lod/app.js
initializeLocale();
var $ = (id) => document.getElementById(id);
var animationControls = null;
var meshMode = "multiple";
var meshPreference = null;
var lastMeshId = null;
var meshPendingColorMode = null;
var meshPaneCount = 1;
var meshVariants = [
	null,
	null,
	null
];
var meshCloudPreference = null;
var meshCloudItems = [];
var paneModels = [
	[],
	[],
	[]
];
var meshViewers = [];
var meshFileCache = new CloudFileCache({ readWire: async (file) => parseOBJ(await file.text(), file.name, file.size) });
var activeMeshViewers = () => meshViewers.slice(0, meshPaneCount);
var meshComparison = createViewerComparison(activeMeshViewers, () => $("mesh-sync-camera").checked);
function meshCloudFiles(entry) {
	return (entry?.clouds || []).filter((file) => !entry.excludedFileKeys?.includes(entry.sourceKeys?.get(file)));
}
function paneOptions(i) {
	const layer = $(`mesh-layers-${i + 1}`).value;
	return {
		...options,
		showMesh: layer !== "cloud",
		showPoints: layer !== "mesh"
	};
}
function updateMeshDataControls() {
	const active = catalogById.get(lastMeshId), files = meshFiles(active), clouds = meshCloudFiles(active);
	$("mesh-compare-count").value = String(meshPaneCount);
	$("mesh-sync-camera").closest("label").hidden = meshPaneCount === 1;
	for (let i = 0; i < 3; i++) {
		const select = $(`mesh-variant-${i + 1}`), chosen = resolveObjectFile(files, i === 0 ? meshPreference : meshVariants[i], i);
		select.replaceChildren();
		if (!files.length) {
			const o = document.createElement("option");
			o.textContent = t("未加载模型");
			o.value = "";
			select.append(o);
		}
		files.forEach((file, index) => {
			const o = document.createElement("option");
			o.value = String(index);
			o.textContent = file.name;
			select.append(o);
		});
		select.value = chosen ? String(files.indexOf(chosen)) : "";
		select.disabled = !files.length;
		$(`mesh-slot-${i + 1}`).hidden = i >= meshPaneCount;
	}
	const select = $("mesh-cloud-file");
	select.replaceChildren();
	for (const [value, label] of [
		["auto", t("按 ID 自动配对")],
		["none", t("不加载点云")],
		...clouds.map((file, i) => [String(i), file.name])
	]) {
		const o = document.createElement("option");
		o.value = value;
		o.textContent = label;
		select.append(o);
	}
	const cloud = resolveObjectFile(clouds, meshCloudPreference);
	select.value = meshCloudPreference?.none ? "none" : meshCloudPreference && cloud ? String(clouds.indexOf(cloud)) : "auto";
}
function configureMeshPanes() {
	$("viewer-grid").dataset.panels = String(meshPaneCount);
	$("mesh-panel-heading-1").hidden = meshPaneCount === 1;
	for (let i = 1; i < 3; i++) {
		$(`mesh-panel-${i + 1}`).hidden = i >= meshPaneCount;
		if (i < meshPaneCount && !meshViewers[i]) {
			meshViewers[i] = new MeshViewer($(`mesh-scene-${i + 1}`), { onError: showError });
			meshComparison.install(meshViewers[i]);
		}
		if (i >= meshPaneCount && meshViewers[i]) {
			meshViewers[i].destroy();
			meshViewers[i] = null;
		}
	}
	updateMeshDataControls();
}
function meshPointFields() {
	const select = $("mesh-point-color-mode"), previous = meshPendingColorMode || select.value;
	meshPendingColorMode = null;
	select.replaceChildren();
	const keys = [...new Set(meshCloudItems.flatMap((item) => Object.keys(item.cloud.fields || {})))];
	for (const [value, label] of [
		["height", t("高度 Z")],
		["rgb", "RGB"],
		["solid", t("单色")],
		...keys.map((k) => ["field:" + k, k])
	]) {
		const o = document.createElement("option");
		o.value = value;
		o.textContent = label;
		select.append(o);
	}
	select.value = [...select.options].some((o) => o.value === previous) ? previous : "height";
}
var number = (value) => Number(value).toLocaleString("zh-CN");
var catalog = [];
var catalogById = /* @__PURE__ */ new Map();
var selected = /* @__PURE__ */ new Set();
var cache = /* @__PURE__ */ new Map();
var currentModels = [];
var viewer;
var generation = 0;
var controller;
var modelProject = new ViewerProject();
var modelTree = null;
var mobileSession = null;
var mobileKnownIds = [];
var labelElements = /* @__PURE__ */ new Map();
var latestLabels = [];
var localFiles = /* @__PURE__ */ new Map();
var cameraControls = null;
var paletteControls = null;
var options = {
	...currentPalettePreferences(),
	mode: "solid",
	edges: true,
	colors: "surface",
	scale: "real",
	labels: true,
	grid: true
};
function showError(message, retry = false) {
	$("error").hidden = false;
	$("error").querySelector("span").textContent = message;
	$("retry").hidden = !retry;
}
function clearError() {
	$("error").hidden = true;
}
function orderedIds() {
	return [...selected].sort((a, b) => a.localeCompare(b, void 0, { numeric: true }));
}
function sizeText(model) {
	return model.bounds[0].map((v, i) => model.bounds[1][i] - v).map((v) => v < .1 ? v.toPrecision(3) : v.toFixed(1)).join(" × ") + t("（原坐标单位）");
}
function renderLabels(labels) {
	latestLabels = labels;
	const active = new Set(labels.map((label) => String(label.id)));
	for (const [id, el] of labelElements) if (!active.has(id)) {
		el.remove();
		labelElements.delete(id);
	}
	for (const label of labels) {
		const id = String(label.id);
		let el = labelElements.get(id);
		if (!el) {
			el = document.createElement("button");
			el.className = "scene-label";
			el.textContent = "#" + id;
			el.setAttribute("aria-label", t("单独查看模型 ") + id);
			el.onclick = () => selectIds([id]);
			$("model-labels").append(el);
			labelElements.set(id, el);
		}
		el.style.left = `${label.x}px`;
		el.style.top = `${label.y}px`;
		el.hidden = !options.labels || !label.visible;
		const model = cache.get(id);
		el.title = model ? t("模型 {0} · {1} · 点击单独查看", [id, sizeText(model)]) : t("模型 {0}", [id]);
	}
}
function filteredModels() {
	return catalog.filter((model) => modelProject.matches(model, $("search").value.trim().replace(/^#/, "")));
}
function renderList() {
	$("filter-count").textContent = t("匹配 {0} 项 · 已勾选 {1}", [number(filteredModels().length), selected.size]);
	$("item-count").textContent = t("共 {0} 项", [number(catalog.length)]);
	for (const id of ["select-all-models", "invert-model-selection"]) $(id).disabled = meshMode !== "multiple" || !filteredModels().length;
	$("random-selection").disabled = !catalog.length;
	renderMeshMode();
	modelTree?.render();
}
function meshFiles(entry) {
	return (entry?.files?.length ? entry.files : entry?.file ? [entry.file] : []).filter((file) => !entry.excludedFileKeys?.includes(entry.sourceKeys?.get(file)));
}
function syncMeshFiles() {
	for (const entry of catalog) {
		const file = resolveObjectFile(meshFiles(entry), meshPreference);
		if (file !== entry.file) {
			cache.delete(entry.id);
			entry.file = file;
		}
		entry.bytes = file?.size || 0;
		localFiles.set(entry.id, file);
	}
}
function renderMeshMode() {
	const multiple = meshMode === "multiple", filtered = filteredModels();
	$("mesh-mode-select").value = meshMode;
	$("mesh-mode-note").textContent = multiple ? t("勾选多个 ID，以独立模型陈列；显示设置应用到所有已选 ID。") : t("单个 ID：← / → 或 [ / ] 切换；按自然编号顺序，遵循搜索筛选。");
	const active = catalogById.get(lastMeshId) || catalogById.get(orderedIds().at(-1));
	$("previous-mesh-id").parentElement.hidden = multiple;
	$("previous-group").hidden = !multiple;
	$("next-group").hidden = !multiple;
	for (const id of ["previous-mesh-id", "next-mesh-id"]) $(id).disabled = multiple || !filtered.length || adjacentObjectEntry(filtered, active, id === "previous-mesh-id" ? -1 : 1) === active;
	const files = meshFiles(active);
	$("mesh-file-select").replaceChildren();
	for (const [index, file] of files.entries()) {
		const option = document.createElement("option");
		option.value = String(index);
		option.textContent = file.name;
		$("mesh-file-select").append(option);
	}
	$("mesh-file-select").closest("label").hidden = files.length < 2;
	updateMeshDataControls();
	$("mesh-file-select").disabled = !files.length;
	$("mesh-file-select").value = String(Math.max(0, files.indexOf(active?.file)));
}
function navigateMesh(direction) {
	if (meshMode !== "single") return;
	const entry = adjacentObjectEntry(filteredModels(), catalogById.get(lastMeshId), direction);
	if (entry) selectIds([entry.id]);
}
$("mesh-mode-select").onchange = () => {
	meshMode = $("mesh-mode-select").value === "single" ? "single" : "multiple";
	if (meshMode === "single" && selected.size > 1) selectIds([selected.has(lastMeshId) ? lastMeshId : orderedIds().at(-1)]);
	else renderList();
};
$("mesh-file-select").onchange = () => {
	const entry = catalogById.get(lastMeshId);
	if (!entry) return;
	meshPreference = objectFilePreference(meshFiles(entry), $("mesh-file-select").value);
	syncMeshFiles();
	renderList();
	loadSelection();
};
$("previous-mesh-id").onclick = () => navigateMesh(-1);
$("next-mesh-id").onclick = () => navigateMesh(1);
document.addEventListener("keydown", (event) => {
	const direction = objectNavigationDirection(event, {
		multiple: meshMode !== "single",
		flying: !!viewer?.fly?.active
	});
	if (direction) {
		event.preventDefault();
		navigateMesh(direction);
	}
});
function renderSelection(syncInput = true) {
	$("selection-count").textContent = t("已勾选 {0} 个", [selected.size]);
	$("previous-group").disabled = !selected.size;
	$("next-group").disabled = !selected.size;
	$("previous-group").hidden = meshMode === "single";
	$("next-group").hidden = meshMode === "single";
	const fragment = document.createDocumentFragment();
	for (const id of orderedIds()) {
		const chip = document.createElement("span");
		chip.className = "model-chip";
		const focus = document.createElement("button");
		focus.textContent = `# ${id}`;
		focus.title = cache.has(id) ? t("{0} · 点击单独查看", [sizeText(cache.get(id))]) : t("单独查看模型 ") + id;
		focus.onclick = () => selectIds([id]);
		const remove = document.createElement("button");
		remove.className = "remove-chip";
		remove.textContent = "×";
		remove.setAttribute("aria-label", t("移除模型 {0}", [id]));
		remove.onclick = () => selectIds([...selected].filter((value) => value !== id));
		chip.append(focus, remove);
		fragment.append(chip);
	}
	if (!selected.size) {
		const hint = document.createElement("span");
		hint.className = "selected-empty";
		hint.textContent = t("尚未选择模型");
		fragment.append(hint);
	}
	$("selected-models").replaceChildren(fragment);
	if (syncInput) $("batch-ids").value = orderedIds().join(", ");
}
function selectIds(ids) {
	let unique = [...new Set(ids.map(String))];
	if (meshMode === "single" && unique.length > 1) unique = unique.slice(-1);
	const invalid = unique.filter((id) => !catalogById.has(id));
	if (invalid.length) {
		showError(t("找不到模型编号：{0}", [invalid.slice(0, 8).join("、")]));
		return false;
	}
	selected = new Set(unique);
	lastMeshId = unique.at(-1) || null;
	syncMeshFiles();
	clearError();
	renderSelection();
	renderList();
	loadSelection();
	return true;
}
function applyBatch(append) {
	try {
		const ids = parseLodIds($("batch-ids").value, catalogById);
		if (ids.length > 1) meshMode = "multiple";
		selectIds(append ? [...selected, ...ids] : ids);
	} catch (error) {
		showError(error.message);
	}
}
async function loadSelection() {
	const version = ++generation;
	controller?.abort();
	controller = new AbortController();
	const signal = controller.signal, ids = orderedIds();
	configureMeshPanes();
	if (!ids.length) {
		meshFileCache.setActive([]);
		currentModels = [];
		paneModels = [
			[],
			[],
			[]
		];
		meshCloudItems = [];
		meshComparison.pause(() => activeMeshViewers().forEach((v) => v.setModels([])));
		cameraControls?.refresh();
		animationControls?.refresh();
		renderLabels([]);
		updateHeightLegend();
		$("loading").hidden = true;
		$("empty-state").hidden = false;
		$("screenshot").disabled = true;
		$("scene-stats").textContent = t("未选择模型");
		for (let i = 1; i <= 3; i++) $(`mesh-panel-label-${i}`).textContent = "";
		return;
	}
	const plans = ids.map((id) => {
		const entry = catalogById.get(id), files = meshFiles(entry);
		return {
			id,
			entry,
			meshes: Array.from({ length: meshPaneCount }, (_, i) => resolveObjectFile(files, i === 0 ? meshPreference : meshVariants[i], i)),
			cloud: resolveObjectFile(meshCloudFiles(entry), meshCloudPreference)
		};
	});
	meshFileCache.setActive(plans.flatMap((plan) => [...plan.meshes, plan.cloud]));
	const sameIds = currentModels.map((m) => String(m.id)).sort().join("\0") === [...ids].sort().join("\0");
	const progress = createBatchProgress($("loading"), {
		total: ids.length,
		unit: "个对象",
		current: () => version === generation
	});
	$("loading").hidden = false;
	$("empty-state").hidden = true;
	$("screenshot").disabled = true;
	clearError();
	const results = /* @__PURE__ */ new Map(), failures = [];
	let next = 0, complete = 0, failed = 0;
	const read = async (file, kind) => file ? meshFileCache.read(file, kind, {
		maxPoints: 0,
		signal
	}) : null;
	async function worker() {
		while (next < plans.length && !signal.aborted) {
			const plan = plans[next++];
			const values = await Promise.allSettled([...plan.meshes.map((file) => read(file, "wire")), read(plan.cloud, "cloud")]);
			if (version !== generation) return;
			const data = values.map((r, i) => {
				if (r.status === "fulfilled") return r.value;
				if (r.reason?.name !== "AbortError") failures.push(`${plan.id} / ${(plan.meshes[i] || plan.cloud)?.name || ""}: ${r.reason?.message}`);
				return null;
			});
			results.set(plan.id, data);
			if (values.some((v) => v.status === "rejected")) failed++;
			progress.report(++complete, failed);
		}
	}
	try {
		await Promise.all(Array.from({ length: Math.min(3, plans.length) }, worker));
		if (version !== generation) return;
		progress.prepare();
		const saved = cameraControls?.preserveView && (meshMode === "multiple" || sameIds) ? cameraControls.capture() : null;
		paneModels = Array.from({ length: meshPaneCount }, () => []);
		meshCloudItems = [];
		cache.clear();
		for (const plan of plans) {
			const values = results.get(plan.id) || [];
			for (let i = 0; i < meshPaneCount; i++) if (values[i]) paneModels[i].push({
				...values[i],
				id: plan.id,
				name: plan.meshes[i].name
			});
			const cloud = values[meshPaneCount];
			if (cloud) meshCloudItems.push({
				id: plan.id,
				key: plan.cloud,
				name: plan.cloud.name,
				cloud
			});
		}
		currentModels = paneModels[0];
		for (const m of currentModels) cache.set(m.id, m);
		const referenceModels = meshReferenceModels(paneModels, meshCloudItems);
		meshPointFields();
		meshComparison.pause(() => activeMeshViewers().forEach((v, i) => {
			v.setModels(paneModels[i], {
				referenceModels,
				clouds: meshCloudItems
			});
			v.setOptions(paneOptions(i));
		}));
		if (saved && referenceModels.length) cameraControls.restore(saved, { checkScene: false });
		else meshComparison.sync();
		updateOptions();
		cameraControls?.refresh();
		animationControls?.refresh();
		const triangles = paneModels.flat().reduce((n, m) => n + m.faces.length, 0), points = meshCloudItems.reduce((n, item) => n + item.cloud.count, 0);
		$("scene-stats").textContent = t("{0} 个 ID · {1} 三角面 · {2} 点", [
			referenceModels.length,
			number(triangles),
			number(points)
		]);
		updateMeshPaneLabels();
		$("screenshot").disabled = !referenceModels.length;
		$("empty-state").hidden = !!referenceModels.length;
		if (failures.length) showError(failures.join("；"), true);
		renderSelection(false);
	} catch (error) {
		if (version === generation && error.name !== "AbortError") showError(t("显示失败：{0}", [error.message]), true);
	} finally {
		if (version === generation) {
			$("loading").hidden = true;
			mobileSession?.schedule();
		}
	}
}
function updateHeightLegend() {
	const legend = $("height-legend");
	if (!legend) return;
	const range = viewer?.getState().colorRange;
	const valid = range && Number.isFinite(range.min) && Number.isFinite(range.max);
	legend.hidden = !(options.colors === "height" && currentModels.length && valid);
	if (valid) {
		$("height-min").textContent = Number(range.min.toPrecision(6)).toString();
		$("height-max").textContent = Number(range.max.toPrecision(6)).toString();
		legend.querySelector("i").style.background = paletteGradient(options.palette, options.reverse);
		paletteControls?.setDataRange?.(range);
	}
}
function updateMeshPaneLabels() {
	for (let i = 0; i < meshPaneCount; i++) setNameSummary($(`mesh-panel-label-${i + 1}`), orderedIds().map((id) => {
		const model = paneModels[i]?.find((m) => String(m.id) === String(id));
		return `${id} / ${paneOptions(i).showMesh ? model?.name || t("仅点云") : t("仅点云")}`;
	}), t("未加载数据"));
}
function updateOptions() {
	const savedView = cameraControls?.preserveView && $("scale-mode").value !== options.scale ? cameraControls.capture() : null;
	options = {
		...options,
		mode: $("display-mode").value,
		scale: $("scale-mode").value,
		colors: $("color-mode").value,
		edges: $("show-edges").checked,
		labels: $("show-labels").checked,
		grid: $("show-grid").checked,
		...paletteControls?.getOptions()
	};
	options = {
		...options,
		pointColorMode: $("mesh-point-color-mode").value,
		pointColor: $("mesh-point-color").value,
		pointSize: Number($("mesh-point-size").value),
		pointOpacity: Number($("mesh-point-opacity").value),
		pointStyle: $("mesh-point-style").value
	};
	meshComparison.pause(() => activeMeshViewers().forEach((v, i) => v.setOptions(paneOptions(i))));
	$("mesh-point-size-value").value = options.pointSize;
	$("mesh-point-opacity-value").value = Math.round(options.pointOpacity * 100) + "%";
	updateMeshPaneLabels();
	$("mesh-point-note").textContent = [...new Set(activeMeshViewers().flatMap((v) => v.pointLayer?.fallbacks || []))].join(" ");
	if (savedView && currentModels.length) cameraControls.restore(savedView, { checkScene: false });
	paletteControls?.setScalarEnabled(options.colors === "height" || meshCloudItems.length > 0 && (options.pointColorMode === "height" || options.pointColorMode?.startsWith("field:")));
	if (options.colors !== "height") paletteControls?.setDataRange(viewer?.pointLayer?.colorRange);
	cameraControls?.refresh();
	animationControls?.refresh();
	updateHeightLegend();
	$("layout-title").textContent = options.scale === "real" ? t("等比例陈列") : t("统一展示大小");
	$("layout-note").textContent = options.scale === "real" ? t("独立模型重新排列 · 非实际地理位置") : t("各模型独立等比缩放 · 不可比较实际大小");
	$("legend").hidden = options.colors !== "surface" || options.mode === "wire";
	renderLabels(latestLabels);
}
function nextGroup(direction) {
	if (!catalog.length || !selected.size) return;
	const count = selected.size, ids = orderedIds();
	let start = direction > 0 ? catalog.findIndex((m) => m.id === ids.at(-1)) + 1 : catalog.findIndex((m) => m.id === ids[0]) - count;
	start = (start % catalog.length + catalog.length) % catalog.length;
	selectIds(Array.from({ length: Math.min(count, catalog.length) }, (_, i) => catalog[(start + i) % catalog.length].id));
}
$("replace-selection").onclick = () => applyBatch(false);
$("add-selection").onclick = () => applyBatch(true);
$("batch-ids").onkeydown = (event) => {
	if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) applyBatch(false);
};
$("search").oninput = () => {
	renderList();
};
$("clear-selection").onclick = () => selectIds([]);
$("random-selection").onclick = () => {
	meshMode = "multiple";
	const pool = catalog.map((m) => m.id);
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	selectIds(pool.slice(0, 6));
};
$("previous-group").onclick = () => nextGroup(-1);
$("next-group").onclick = () => nextGroup(1);
$("fit-view").onclick = () => meshComparison.pause(() => activeMeshViewers().forEach((v) => v.fit()));
$("zoom-in").onclick = () => meshComparison.pause(() => activeMeshViewers().forEach((v) => v.zoomBy(1.2)));
$("zoom-out").onclick = () => meshComparison.pause(() => activeMeshViewers().forEach((v) => v.zoomBy(1 / 1.2)));
$("retry").onclick = () => {
	clearError();
	if (!catalog.length || !viewer) init();
	else loadSelection();
};
$("dismiss-error").onclick = clearError;
for (const button of document.querySelectorAll("[data-view]")) button.onclick = () => {
	meshComparison.pause(() => activeMeshViewers().forEach((v) => v.setView(button.dataset.view)));
	for (const other of document.querySelectorAll("[data-view]")) {
		other.classList.toggle("active", other === button);
		other.setAttribute("aria-pressed", String(other === button));
	}
};
for (const id of [
	"display-mode",
	"scale-mode",
	"color-mode",
	"show-edges",
	"show-labels",
	"show-grid"
]) $(id).onchange = updateOptions;
document.addEventListener("keydown", (event) => {
	if ([
		"INPUT",
		"TEXTAREA",
		"SELECT",
		"BUTTON"
	].includes(event.target.tagName)) return;
	if (event.key.toLowerCase() === "f") {
		event.preventDefault();
		meshComparison.pause(() => activeMeshViewers().forEach((v) => v.fit()));
	}
});
function ensureViewer() {
	if (!viewer) {
		viewer = new MeshViewer($("scene"), {
			onLabels: renderLabels,
			onError: (message) => message ? showError(String(message), true) : clearError()
		});
		meshViewers = [viewer];
		meshComparison.install(viewer);
	}
	if (!paletteControls && $("palette-controls")) paletteControls = mountPaletteControls({
		container: $("palette-controls"),
		getOptions: () => options,
		onChange: updateOptions
	});
	if (!cameraControls && $("camera-controls")) cameraControls = mountCameraControls({
		container: $("camera-controls"),
		bookmarkContainer: $("bookmark-controls"),
		getViewers: activeMeshViewers,
		pauseSync: meshComparison.pause,
		space: "lod-arrangement",
		getScene: () => ({
			ids: (viewer?.sceneData?.referenceModels || currentModels).map((model) => String(model.id)),
			scale: options.scale
		})
	});
	options = {
		...options,
		...paletteControls?.getOptions()
	};
	viewer.setOptions(options);
	paletteControls?.setScalarEnabled(options.colors === "height");
}
function folderReady(fileList, paths = null) {
	const result = appendLodFiles(catalog, modelProject, [...fileList], paths);
	catalog.sort((a, b) => a.id.localeCompare(b.id, void 0, { numeric: true }));
	catalogById = new Map(catalog.map((model) => [model.id, model]));
	localFiles = new Map(catalog.map((model) => [model.id, model.file]));
	syncMeshFiles();
	$("search").value = "";
	$("source-path").textContent = t("文件留在本机 · 分组仅保留在本次页面");
	$("folder-status").textContent = t("{0} 个 ID · {1} 个 OBJ · 按需读取", [number(catalog.length), number(catalog.reduce((sum, entry) => sum + meshFiles(entry).length, 0))]);
	$("total-count").textContent = t("{0} 个模型", [number(catalog.length)]);
	if (!result.added && !result.duplicates) showError(t("未找到支持的模型或点云文件。"));
	else clearError();
	renderList();
	if (selected.size && result.added) loadSelection();
	return result;
}
function changeModelVisibility(members, checked) {
	const next = new Set(selected);
	if (checked && meshMode === "single") {
		if (members.length !== 1) return;
		next.clear();
	}
	for (const model of members) checked ? next.add(model.id) : next.delete(model.id);
	selectIds([...next]);
}
function removeModelEntries(members) {
	const removed = new Set(members);
	++generation;
	controller?.abort();
	for (const model of members) {
		for (const file of [...meshFiles(model), ...meshCloudFiles(model)]) meshFileCache.forget(file);
		cache.delete(model.id);
		localFiles.delete(model.id);
		catalogById.delete(model.id);
		selected.delete(model.id);
	}
	catalog = catalog.filter((model) => !removed.has(model));
	$("total-count").textContent = t("{0} 个模型", [number(catalog.length)]);
	$("folder-status").textContent = t("{0} 个 ID · {1} 个 OBJ · 按需读取", [number(catalog.length), number(catalog.reduce((sum, entry) => sum + meshFiles(entry).length, 0))]);
	selectIds([...selected]);
}
var importLodRecords = archiveImportQueue({
	accepts: (name) => /\.(obj|xyz|txt|csv|pts|ply|pcd)$/i.test(name),
	receive: (records) => folderReady(records.map((item) => item.file), new Map(records.map((item) => [item.file, item.path]))),
	onProgress: (message) => {
		$("drop-status").hidden = false;
		$("drop-status").textContent = message;
	},
	onError: showError
});
var pickLodFiles = (event) => {
	const records = Array.from(event.target.files, (file) => ({
		file,
		path: file.webkitRelativePath || file.name
	}));
	event.target.value = "";
	importLodRecords(records).catch(() => {});
};
$("choose-folder").onclick = () => $("folder-input").click();
$("folder-input").onchange = pickLodFiles;
function init() {
	try {
		ensureViewer();
		mountViewerLayout({
			getViewers: activeMeshViewers,
			pauseSync: meshComparison.pause
		});
		if (!isMobileApp() && !animationControls) animationControls = mountCameraAnimation({
			adapter: createMeshAnimationAdapter({
				getViewer: () => viewer,
				getModels: () => currentModels,
				getScene: () => ({
					ids: currentModels.map((m) => String(m.id)),
					scale: options.scale
				})
			}),
			toolbar: document.querySelector(".viewer-toolbar"),
			anchor: $("viewport")
		});
		if (!modelTree) modelTree = mountProjectTree({
			project: modelProject,
			container: $("model-list"),
			root: $("project-root"),
			controls: $("project-controls"),
			getEntries: () => catalog,
			getSelected: () => new Set(catalog.filter((model) => selected.has(model.id))),
			getMode: () => meshMode,
			getQuery: () => $("search").value.trim().replace(/^#/, ""),
			onToggle: (model) => changeModelVisibility([model], !selected.has(model.id)),
			onGroupSelection: (members, checked) => {
				if (meshMode === "multiple") changeModelVisibility(members, checked);
			},
			onVisibility: changeModelVisibility,
			onRemove: removeModelEntries,
			onChange: renderList,
			detail: (model) => `${meshFiles(model).length} OBJ · ${meshCloudFiles(model).length} PC`
		});
		mountPointDrop({
			zone: document.querySelector(".sidebar"),
			status: $("drop-status"),
			accepts: (name) => /\.(obj|xyz|txt|csv|pts|ply|pcd|zip)$/i.test(name),
			onFiles: importLodRecords
		});
		$("select-all-models").onclick = () => selectIds([...selected, ...filteredModels().map((model) => model.id)]);
		$("invert-model-selection").onclick = () => {
			const next = new Set(selected);
			for (const model of filteredModels()) next.has(model.id) ? next.delete(model.id) : next.add(model.id);
			selectIds([...next]);
		};
		$("choose-file").onclick = () => $("file-input").click();
		$("file-input").onchange = pickLodFiles;
		$("total-count").textContent = t("尚未选择文件夹");
		$("source-path").textContent = t("尚未选择文件夹。关闭或刷新网页后，请手动重新选择。");
		$("folder-status").textContent = t("导入模型或点云 · 文件仅在本机读取");
		selectIds([]);
		mountMobileProject({
			receive: importLodRecords,
			getState: () => ({
				objectImportVersion: 2,
				mode: meshMode,
				meshPreference,
				pointColorMode: meshPendingColorMode || $("mesh-point-color-mode").value,
				comparison: {
					count: meshPaneCount,
					variants: meshVariants,
					cloud: meshCloudPreference
				},
				tree: {
					...snapshotProjectTree(modelProject, catalog),
					knownIds: mobileKnownIds
				},
				selected: [...selected],
				inputs: captureMobileInputs(),
				camera: currentModels.length || meshCloudItems.length ? cameraControls?.capture() : null
			}),
			restoreState: async (state, records) => {
				state = migrateObjectImportState(state, records, catalog, "mesh");
				mobileKnownIds = [.../* @__PURE__ */ new Set([...state?.tree?.knownIds || [], ...catalog.map((e) => e.id)])];
				if (state) {
					meshPendingColorMode = typeof state.pointColorMode === "string" ? state.pointColorMode : null;
					meshPaneCount = [2, 3].includes(state.comparison?.count) ? state.comparison.count : 1;
					meshVariants = Array.from({ length: 3 }, (_, i) => state.comparison?.variants?.[i] || null);
					meshCloudPreference = state.comparison?.cloud || null;
					configureMeshPanes();
					meshMode = state.mode === "single" ? "single" : "multiple";
					meshPreference = state.meshPreference?.none ? null : state.meshPreference || null;
					catalog = restoreProjectTree(modelProject, catalog, state.tree);
					catalogById = new Map(catalog.map((e) => [e.id, e]));
					localFiles = new Map(catalog.map((e) => [e.id, e.file]));
					selected = new Set((state.selected || []).filter((id) => catalogById.has(id)));
					lastMeshId = [...selected].at(-1) || null;
					syncMeshFiles();
					restoreMobileInputs(state.inputs);
					updateOptions();
					renderSelection();
					renderList();
					await loadSelection();
					if (state.camera && (currentModels.length || meshCloudItems.length)) cameraControls.restore(state.camera, { checkScene: false });
				}
				$("source-path").textContent = t("项目自动保存在此设备");
			},
			onBackground: () => {
				meshFileCache.trim();
				for (const id of cache.keys()) if (!selected.has(id)) cache.delete(id);
			}
		}).then((session) => {
			mobileSession = session;
		});
	} catch (error) {
		$("scene-stats").textContent = t("查看器暂时无法启动");
		$("loading").hidden = true;
		showError(t("查看器启动失败：{0}。请使用支持 WebGL 的浏览器。", [error.message]), true);
		$("empty-state").hidden = false;
	}
}
$("mesh-compare-count").onchange = async () => {
	meshPaneCount = Number($("mesh-compare-count").value);
	await loadSelection();
	const version = generation;
	requestAnimationFrame(() => {
		if (version !== generation) return;
		meshComparison.pause(() => activeMeshViewers().forEach((v) => v.fit()));
		meshComparison.sync();
	});
};
$("mesh-sync-camera").onchange = () => {
	if ($("mesh-sync-camera").checked) meshComparison.sync();
};
$("mesh-cloud-file").onchange = () => {
	const value = $("mesh-cloud-file").value;
	meshCloudPreference = value === "auto" ? null : value === "none" ? { none: true } : objectFilePreference(meshCloudFiles(catalogById.get(lastMeshId)), value);
	loadSelection();
};
for (let i = 0; i < 3; i++) {
	$(`mesh-variant-${i + 1}`).onchange = () => {
		const pref = objectFilePreference(meshFiles(catalogById.get(lastMeshId)), $(`mesh-variant-${i + 1}`).value);
		if (i === 0) meshPreference = pref;
		else meshVariants[i] = pref;
		syncMeshFiles();
		renderList();
		loadSelection();
	};
	$(`mesh-layers-${i + 1}`).onchange = updateOptions;
}
for (const id of [
	"mesh-point-color-mode",
	"mesh-point-color",
	"mesh-point-style"
]) $(id).onchange = updateOptions;
for (const id of ["mesh-point-size", "mesh-point-opacity"]) $(id).oninput = updateOptions;
init();
//#endregion
