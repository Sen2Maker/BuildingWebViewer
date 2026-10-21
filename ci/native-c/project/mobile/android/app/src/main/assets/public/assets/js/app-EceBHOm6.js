import { a as t, n as initializeLocale } from "./i18n-B_brH6cQ.js";
import { a as setNameSummary, d as projectFileKey, f as projectUniqueId, n as mountProjectTree, o as createBatchProgress, p as ViewerProject, r as archiveImportQueue, t as mountPointDrop } from "./point-drop-ESGt26lE.js";
import { C as cameraNavigationScale, O as gsProjectPosition, S as CameraNavigation, T as mountFlyCameraControls, a as serializeCameraBookmarks, b as mountCameraNavigationControls, c as gsOrbitRotate, d as mountViewerLayout, f as setViewerProjection, g as currentPresentation, h as updateSceneGuides, i as parseCameraBookmarks, j as gsViewSpec, k as gsTrainingPose, l as gsReanchorOrbit, n as captureCameraSnapshot, r as mountCameraControls, s as mountTouchCamera, t as applyCameraSnapshot, u as gsSetOrbitBasis, w as cameraNavigationSettings, x as CAMERA_NAV_STORAGE, y as saveLocalBlob } from "./camera-controls-De9mw6p_.js";
import { c as restoreMobileInputs, i as mobileProjects, l as restoreProjectTree, n as captureMobileInputs, r as isMobileApp, u as snapshotProjectTree } from "./mobile-project-DOywSnqd.js";
import { t as mountRenderDiagnostics } from "./render-diagnostics-BtjERr8K.js";
import { t as openWorkspaceSession } from "./workspace-session-vn65Bnnx.js";
var GAUSSIAN_MIGRATION_KEY = "BuildingWebViewer.gaussian.camera.migrated.v1";
var SHARED_BOOKMARK_KEY = "BuildingWebViewer.camera-bookmarks.v1.raw-world";
var mounted = /* @__PURE__ */ new WeakMap();
/** Convert the saved local origin and calibrated pose into the common world-coordinate format. */
function legacyGaussianBookmark(record, index = 0, canvas = null) {
	if (!record || typeof record !== "object") throw Error("Invalid Gaussian bookmark");
	const snapshot = captureCameraSnapshot({
		...record,
		canvas: canvas || {
			clientWidth: record.trainingPose?.width || 640,
			clientHeight: record.trainingPose?.height || 480
		}
	}, { space: "raw-world" });
	const source = JSON.stringify(record);
	let hash = 2166136261;
	for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619) >>> 0;
	return {
		id: `gaussian-legacy-${index}-${hash.toString(16)}`,
		name: (typeof record.name === "string" && record.name.trim() ? record.name.trim() : `Gaussian ${index + 1}`).slice(0, 80),
		snapshot
	};
}
/** Keep the original key as a backup. A receipt prevents deleted migrated views from reappearing. */
function migrateGaussianBookmarks(storage, canvas = null) {
	const result = {
		records: [],
		migrated: 0,
		remaining: 0,
		invalid: 0,
		error: null
	};
	try {
		const raw = JSON.parse(storage?.getItem("BuildingWebViewer.gaussian.camera.v1") || "[]");
		if (!Array.isArray(raw) || raw.length > 50) throw Error("Invalid legacy Gaussian bookmarks");
		raw.forEach((record, index) => {
			try {
				result.records.push(legacyGaussianBookmark(record, index, canvas));
			} catch {
				result.invalid++;
			}
		});
		if (!result.records.length) return result;
		const text = storage?.getItem(SHARED_BOOKMARK_KEY), saved = text ? parseCameraBookmarks(text, "raw-world") : {
			preserveView: true,
			bookmarks: []
		};
		const receipt = JSON.parse(storage?.getItem("BuildingWebViewer.gaussian.camera.migrated.v1") || "[]");
		const known = new Set(Array.isArray(receipt) ? receipt.filter((value) => typeof value === "string") : []), ids = new Set(saved.bookmarks.map((record) => record.id));
		for (const record of result.records) {
			if (known.has(record.id)) continue;
			if (ids.has(record.id)) {
				known.add(record.id);
				continue;
			}
			if (saved.bookmarks.length >= 100) {
				result.remaining++;
				continue;
			}
			let name = record.name, suffix = 2;
			while (saved.bookmarks.some((value) => value.name === name)) {
				const end = ` (${suffix++})`;
				name = record.name.slice(0, 80 - end.length) + end;
			}
			saved.bookmarks.push({
				...record,
				name
			});
			ids.add(record.id);
			known.add(record.id);
			result.migrated++;
		}
		if (!storage?.setItem) throw Error("Browser storage unavailable");
		if (result.migrated) storage.setItem(SHARED_BOOKMARK_KEY, serializeCameraBookmarks(saved.bookmarks, "raw-world", saved.preserveView));
		storage.setItem(GAUSSIAN_MIGRATION_KEY, JSON.stringify([...known]));
	} catch (error) {
		result.error = error;
	}
	return result;
}
/** Compose shared camera, bookmarks and navigation with only Gaussian-specific lens controls. */
function mountGaussianCameraControls({ viewer, root = document, onError = () => {} }) {
	const cameraPanel = root.getElementById("camera-controls"), bookPanel = root.getElementById("bookmark-controls");
	if (!cameraPanel || !bookPanel) return null;
	if (mounted.has(cameraPanel)) return mounted.get(cameraPanel);
	const en = root.documentElement.lang === "en", text = (zh, english) => en ? english : zh;
	const make = (tag, label, cls) => {
		const node = root.createElement(tag);
		if (label) node.textContent = label;
		if (cls) node.className = cls;
		return node;
	};
	const sharedCamera = make("div", null, "gaussian-shared-camera"), sharedBookmarks = make("div", null, "gaussian-shared-bookmarks");
	cameraPanel.append(sharedCamera);
	bookPanel.append(sharedBookmarks);
	let storage;
	try {
		storage = root.defaultView?.localStorage || globalThis.localStorage;
	} catch {}
	const migration = migrateGaussianBookmarks(storage, viewer.canvas);
	const shared = mountCameraControls({
		container: sharedCamera,
		bookmarkContainer: sharedBookmarks,
		getViewers: () => [viewer],
		space: "raw-world"
	});
	mountFlyCameraControls(viewer, cameraPanel);
	mountCameraNavigationControls(cameraPanel, viewer);
	const lensPanel = make("section", null, "inspector-section gaussian-lens-controls");
	lensPanel.append(make("h3", text("镜头与投影", "Lens and projection")));
	cameraPanel.append(lensPanel);
	const projectionLabel = make("label", text("投影模式", "Projection")), projection = make("select");
	projection.setAttribute("aria-label", text("投影模式", "Projection"));
	for (const [value, zh, english] of [[
		"perspective",
		"透视",
		"Perspective"
	], [
		"orthographic",
		"正交",
		"Orthographic"
	]]) {
		const option = make("option", text(zh, english));
		option.value = value;
		projection.append(option);
	}
	projection.value = viewer.projection;
	projection.onchange = () => {
		try {
			setViewerProjection([viewer], projection.value);
		} catch (error) {
			projection.value = viewer.projection;
			onError(error.message);
		}
	};
	projectionLabel.append(projection);
	lensPanel.append(projectionLabel);
	const fovLabel = make("label", text("视野角（°）", "Field of view (°)"), "gs-camera-field"), range = make("input"), number = make("input");
	range.type = "range";
	number.type = "number";
	for (const input of [range, number]) {
		input.min = 10;
		input.max = 120;
		input.step = 1;
		input.value = viewer.fov;
		input.setAttribute("aria-label", text("视野角", "Field of view") + (input === range ? " slider" : " number"));
	}
	const changeFov = (input) => {
		const value = Number(input.value);
		if (input.value === "" || !Number.isFinite(value) || value < 10 || value > 120) return;
		viewer.stopNavigation();
		viewer.leaveTraining();
		viewer.orbitLens = null;
		viewer.fov = value;
		range.value = number.value = value;
		viewer.requestRender();
	};
	range.oninput = () => changeFov(range);
	number.onchange = () => {
		changeFov(number);
		number.value = viewer.fov;
	};
	fovLabel.append(range, number);
	lensPanel.append(fovLabel);
	const nearLabel = make("label", text("近裁剪距离（坐标单位）", "Near clip (coordinate units)"), "gs-camera-field"), near = make("input");
	near.type = "number";
	near.min = 1e-5;
	near.step = .01;
	near.value = viewer.near;
	near.setAttribute("aria-label", text("近裁剪距离", "Near clip"));
	near.onchange = () => {
		const value = Number(near.value);
		if (near.value !== "" && Number.isFinite(value) && value >= 1e-5) {
			viewer.near = value;
			viewer.requestRender();
		} else near.value = viewer.near;
	};
	nearLabel.append(near);
	lensPanel.append(nearLabel);
	lensPanel.append(make("p", text("训练机位保留原始姿态和焦距。调整视野角时改用普通镜头；其他相机、书签与漫游设置在各工具间共用。", "Training views retain their pose and calibrated lens. Changing field of view switches to an ordinary lens; camera, bookmark and navigation modules are shared across tools."), "presentation-help"));
	const poseInfo = make("p", null, "presentation-help");
	lensPanel.append(poseInfo);
	const previous = viewer.onViewChange;
	let lastUpdate = -Infinity;
	viewer.onViewChange = (...args) => {
		previous?.(...args);
		if (cameraPanel.closest("[hidden]") || performance.now() - lastUpdate < 80) return;
		lastUpdate = performance.now();
		projection.value = viewer.projection;
		if (root.activeElement !== number) number.value = viewer.fov;
		if (root.activeElement !== range) range.value = viewer.fov;
		if (root.activeElement !== near) near.value = viewer.near;
		const width = viewer.canvas.clientWidth, height = viewer.canvas.clientHeight;
		if (width > 0 && height > 0) {
			const spec = gsViewSpec(viewer, width, height);
			poseInfo.textContent = "XYZ: " + spec.eye.map((v, i) => (v + (viewer.origin?.[i] || 0)).toFixed(3)).join(" / ");
		}
	};
	if (migration.records.length) {
		const legacy = make("details", null, "gaussian-legacy-bookmarks");
		legacy.append(make("summary", text("旧版高斯书签备份", "Legacy Gaussian bookmark backup")));
		legacy.append(make("p", text(migration.error || migration.remaining ? "原书签仍保留，可直接加载或导出；浏览器存储可用后会继续合并到共享书签。" : "旧书签已合并到共享书签，原始备份保留。", "Original views remain available for loading and export. Shared bookmarks use world coordinates."), "presentation-help"));
		const select = make("select");
		select.setAttribute("aria-label", text("旧版高斯书签", "Legacy Gaussian bookmarks"));
		migration.records.forEach((record, index) => {
			const option = make("option", record.name);
			option.value = String(index);
			select.append(option);
		});
		select.value = "0";
		legacy.append(select);
		const load = make("button", text("加载旧书签", "Load legacy view"));
		load.type = "button";
		load.onclick = () => {
			try {
				shared.restore(migration.records[Number(select.value) || 0].snapshot, { checkScene: false });
			} catch (error) {
				onError(error.message);
			}
		};
		const backup = make("button", text("导出旧书签 JSON", "Export legacy JSON"));
		backup.type = "button";
		backup.onclick = () => saveLocalBlob(new Blob([serializeCameraBookmarks(migration.records, "raw-world")], { type: "application/json" }), "BWV-Gaussian-legacy-bookmarks.json").catch((error) => onError(error.message));
		legacy.append(load, backup);
		bookPanel.append(legacy);
	}
	const result = Object.assign(shared, { migration });
	mounted.set(cameraPanel, result);
	return result;
}
//#endregion
//#region src/gaussian/native-view.js
async function openNativeGaussianPage() {
	if (!isMobileApp()) return false;
	const api = mobileProjects();
	if (!(await api.runtimeInfo()).nativeGaussianWorkspace) return false;
	const id = new URL(location.href).searchParams.get("project");
	if (!id) {
		location.replace("assets/mobile/index.html");
		return true;
	}
	await api.openNativeGaussian({
		id,
		keys: [],
		lang: document.documentElement.lang === "en" ? "en" : "zh"
	});
	location.replace("assets/mobile/index.html?lang=" + document.documentElement.lang);
	return true;
}
//#endregion
//#region src/gaussian/project-state.js
function gsEntryFlags(entry) {
	return entry.parsed?.preview ? entry.savedFlags : entry.parsed?.editFlags || entry.savedFlags;
}
/** Native Gaussian edits reference immutable original PLY files; only one flag byte per point is saved. */
function gsProjectBlob(entries) {
	const records = [], blocks = [];
	let offset = 0;
	for (const e of entries) {
		const flags = gsEntryFlags(e);
		if (!flags) continue;
		records.push({
			id: e.id,
			count: flags.length,
			offset
		});
		blocks.push(flags.slice());
		offset += flags.length;
	}
	const header = new TextEncoder().encode(JSON.stringify({
		format: "BuildingWebViewer.gaussian-edits",
		version: 1,
		records
	}));
	const length = /* @__PURE__ */ new Uint8Array(4);
	new DataView(length.buffer).setUint32(0, header.length, true);
	return new Blob([
		length,
		header,
		...blocks
	]);
}
async function gsReadProjectBlob(file) {
	if (file.size < 4 || file.size > 536870912) throw Error("Invalid Gaussian snapshot size");
	const n = new DataView(await file.slice(0, 4).arrayBuffer()).getUint32(0, true);
	if (n > 4194304 || n + 4 > file.size) throw Error("Invalid Gaussian snapshot header");
	const data = JSON.parse(await file.slice(4, 4 + n).text());
	if (data.format !== "BuildingWebViewer.gaussian-edits" || data.version !== 1 || !Array.isArray(data.records)) throw Error("Invalid Gaussian snapshot");
	let offset = 0;
	const result = /* @__PURE__ */ new Map();
	for (const r of data.records) {
		if (typeof r.id !== "string" || result.has(r.id) || !Number.isSafeInteger(r.count) || r.count < 0 || r.offset !== offset || 4 + n + offset + r.count > file.size) throw Error("Invalid Gaussian flags");
		const flags = new Uint8Array(await file.slice(4 + n + offset, 4 + n + offset + r.count).arrayBuffer());
		if (flags.some((v) => v > 7)) throw Error("Invalid Gaussian edit flag");
		result.set(r.id, flags);
		offset += r.count;
	}
	if (n + 4 + offset !== file.size) throw Error("Unexpected Gaussian snapshot bytes");
	return result;
}
var GaussianEdits = class {
	constructor(onChange = () => {}) {
		this.undoStack = [];
		this.redoStack = [];
		this.onChange = onChange;
		this.bytes = 0;
		this.budget = 67108864;
	}
	attach(model) {
		if (!model.editFlags) model.editFlags = new Uint8Array(model.count);
		return model;
	}
	apply(models, operation) {
		const changes = [];
		for (const model of models) {
			this.attach(model);
			const ids = [], before = [], after = [];
			for (let i = 0; i < model.count; i++) {
				const a = model.editFlags[i], b = operation(a, i, model);
				if (a !== b) {
					ids.push(i);
					before.push(a);
					after.push(b);
				}
			}
			if (ids.length) changes.push({
				model,
				ids: Uint32Array.from(ids),
				before: Uint8Array.from(before),
				after: Uint8Array.from(after)
			});
		}
		if (!changes.length) return false;
		const bytes = changes.reduce((n, c) => n + c.ids.byteLength + c.before.byteLength + c.after.byteLength, 0);
		if (bytes > this.budget) throw Error("本次编辑超过撤销内存预算，请分批选择 / Edit exceeds undo budget");
		this.redoStack = [];
		this.bytes = this.undoStack.reduce((n, c) => n + c.bytes, 0);
		while (this.undoStack.length && this.bytes + bytes > this.budget) this.bytes -= this.undoStack.shift().bytes;
		const command = {
			changes,
			bytes
		};
		this.write(command, "after");
		this.undoStack.push(command);
		this.bytes += bytes;
		this.onChange();
		return true;
	}
	write(command, key) {
		for (const c of command.changes) for (let j = 0; j < c.ids.length; j++) c.model.editFlags[c.ids[j]] = c[key][j];
	}
	undo() {
		const c = this.undoStack.pop();
		if (!c) return;
		this.write(c, "before");
		this.redoStack.push(c);
		this.onChange();
	}
	redo() {
		const c = this.redoStack.pop();
		if (!c) return;
		this.write(c, "after");
		this.undoStack.push(c);
		this.onChange();
	}
	releaseGeometry(model) {
		for (const command of [...this.undoStack, ...this.redoStack]) for (const c of command.changes) if (c.model === model) c.model = { editFlags: model.editFlags };
	}
	clear() {
		this.undoStack = [];
		this.redoStack = [];
		this.bytes = 0;
	}
};
function gsEditStats(models) {
	const s = {
		total: 0,
		selected: 0,
		hidden: 0,
		deleted: 0
	};
	for (const m of models) {
		s.total += m.count;
		for (const f of m.editFlags || []) if (f & 4) s.deleted++;
		else if (f & 2) s.hidden++;
		else if (f & 1) s.selected++;
	}
	return s;
}
function gsExportPly(model, { selectedOnly = false, includeHidden = false } = {}) {
	if (model.preview) throw Error("请先加载完整数据再编辑或导出 / Load full data before editing or exporting");
	if (!model.source) throw Error("Missing original PLY records");
	const { bytes, headerEnd, stride, header } = model.source, flags = model.editFlags || new Uint8Array(model.count);
	const ids = [];
	for (let i = 0; i < model.count; i++) {
		const f = flags[i];
		if (!(f & 4) && (includeHidden || !(f & 2)) && (!selectedOnly || f & 1)) ids.push(i);
	}
	if (!ids.length) throw Error("没有符合条件的高斯 / No Gaussians to export");
	const text = header.replace(/element vertex \d+/, `element vertex ${ids.length}`);
	const chunks = [new TextEncoder().encode(text)];
	let chunk = new Uint8Array(Math.min(ids.length, 8192) * stride), used = 0;
	for (const id of ids) {
		if (used + stride > chunk.length) {
			chunks.push(chunk);
			chunk = new Uint8Array(Math.min(ids.length, 8192) * stride);
			used = 0;
		}
		chunk.set(bytes.subarray(headerEnd + id * stride, headerEnd + (id + 1) * stride), used);
		used += stride;
	}
	if (used) chunks.push(chunk.subarray(0, used));
	return new Blob(chunks, { type: "application/octet-stream" });
}
//#endregion
//#region src/gaussian/editor-controls.js
function mountGaussianEditor({ viewer, getModels, onError, onStatus, onChange = () => {}, loadFull = async () => {} }) {
	const en = document.documentElement.lang === "en", text = (zh, eng) => en ? eng : zh;
	const make = (tag, label, cls) => {
		const el = document.createElement(tag);
		if (label) el.textContent = label;
		if (cls) el.className = cls;
		return el;
	};
	const tools = make("div", null, "gs-edit-toolbar"), stats = make("span", null, "gs-edit-status");
	const section = make("section");
	section.id = "settings-panel-edit";
	section.dataset.settingsPanel = "edit";
	section.hidden = true;
	section.setAttribute("role", "tabpanel");
	section.setAttribute("aria-labelledby", "settings-tab-edit");
	const tab = make("button", text("编辑", "Edit"));
	tab.id = "settings-tab-edit";
	tab.type = "button";
	tab.dataset.settingsTab = "edit";
	tab.setAttribute("role", "tab");
	tab.setAttribute("aria-controls", section.id);
	tab.setAttribute("aria-selected", "false");
	tab.tabIndex = -1;
	document.querySelector(".inspector-tabs").append(tab);
	document.getElementById("settings-panel-data").parentElement.append(section);
	const launch = make("button", text("编辑", "Edit"));
	launch.type = "button";
	launch.dataset.openSettings = "edit";
	launch.setAttribute("aria-controls", "viewer-inspector");
	launch.setAttribute("aria-expanded", "false");
	document.querySelector(".inspector-shortcuts").append(launch);
	const enable = make("button", text("加载完整数据以修订", "Load full data to edit")), note = make("p", text("手机默认先查看。编辑将加载完整数据，可能需要更多时间和内存。", "Mobile opens in viewing mode. Editing loads full data and needs more time and memory."), "presentation-help");
	enable.type = "button";
	enable.onclick = () => loadFull().catch((e) => onError(e.message));
	const fieldset = make("fieldset", null, "gs-edit-fields");
	section.append(note, enable, fieldset);
	fieldset.append(tools);
	const activeTool = make("button", null, "gs-active-edit");
	activeTool.type = "button";
	activeTool.hidden = true;
	document.querySelector(".viewer-toolbar").append(activeTool);
	let loading = false;
	const editable = () => !loading && !getModels().some((m) => m.preview);
	const stopEditing = () => {
		viewer.editMode = "orbit";
		viewer.canvas.style.cursor = "grab";
		activeTool.hidden = true;
		if (gesture && viewer.canvas.hasPointerCapture(gesture.id)) viewer.canvas.releasePointerCapture(gesture.id);
		gesture = null;
		for (const [m, b] of modeButtons) {
			b.classList.toggle("active", m === "orbit");
			b.setAttribute("aria-pressed", String(m === "orbit"));
		}
	};
	activeTool.onclick = stopEditing;
	document.addEventListener("bwv-inspector-change", (e) => {
		if (e.detail.open && e.detail.tab !== "edit") stopEditing();
	});
	const statsLine = make("div", null, "gs-edit-stats");
	statsLine.append(stats);
	tools.after(statsLine);
	const edits = new GaussianEdits(() => {
		viewer.syncFlags();
		refresh();
		onChange();
	});
	let busy = false, gesture = null, revision = 0;
	const button = (parent, zh, eng, fn) => {
		const b = make("button", text(zh, eng));
		b.type = "button";
		b.onclick = () => {
			if (!busy) try {
				viewer.fly?.leave();
				fn();
			} catch (e) {
				onError(e.message);
			}
		};
		parent.append(b);
		return b;
	};
	const modes = make("div", null, "segmented");
	tools.append(modes);
	const modeButtons = [];
	for (const [mode, zh, eng] of [
		[
			"orbit",
			"浏览",
			"Navigate"
		],
		[
			"rectangle",
			"框选",
			"Rectangle"
		],
		[
			"brush",
			"画刷",
			"Brush"
		]
	]) {
		const b = button(modes, zh, eng, () => {
			viewer.stopNavigation();
			viewer.editMode = mode;
			activeTool.hidden = mode === "orbit";
			activeTool.textContent = text(zh + "中 · 结束", eng + " · Done");
			viewer.canvas.style.cursor = mode === "orbit" ? "grab" : "crosshair";
			for (const [m, el] of modeButtons) {
				el.classList.toggle("active", m === mode);
				el.setAttribute("aria-pressed", String(m === mode));
			}
		});
		modeButtons.push([mode, b]);
		b.setAttribute("aria-pressed", String(mode === "orbit"));
		b.classList.toggle("active", mode === "orbit");
	}
	const brushLabel = make("label", text("画刷半径", "Brush radius"));
	const radius = make("input");
	radius.type = "range";
	radius.min = 5;
	radius.max = 120;
	radius.value = 30;
	radius.setAttribute("aria-label", text("画刷半径", "Brush radius"));
	const radiusValue = make("output", "30 px");
	radius.oninput = () => radiusValue.textContent = radius.value + " px";
	brushLabel.append(radius, radiusValue);
	tools.append(brushLabel);
	button(tools, "全选", "Select all", () => act("all"));
	button(tools, "清空", "Clear", () => act("clear"));
	button(tools, "反选", "Invert", () => act("invert"));
	const undo = button(tools, "↶ 撤销", "↶ Undo", () => edits.undo()), redo = button(tools, "↷ 重做", "↷ Redo", () => edits.redo());
	button(tools, "隐藏选区", "Hide selected", () => act("hide"));
	button(tools, "显示全部", "Unhide all", () => act("unhide"));
	button(tools, "删除选区", "Delete selected", () => act("delete"));
	button(tools, "导出 PLY", "Export PLY", () => exportData());
	const hint = make("span", text("按高斯中心穿透选择 · Shift 添加 · Ctrl/Cmd 减选 · Alt 拖动浏览", "Through-selection of Gaussian centers · Shift add · Ctrl/Cmd subtract · Alt drag to navigate"), "gs-edit-hint");
	statsLine.append(hint);
	const overlay = make("canvas", null, "gs-selection-overlay");
	viewer.canvas.parentElement.append(overlay);
	const ctx = overlay.getContext("2d");
	function refresh() {
		fieldset.disabled = !editable();
		enable.hidden = editable();
		enable.disabled = loading;
		const s = gsEditStats(getModels());
		stats.textContent = text(`选择 ${s.selected.toLocaleString()} · 隐藏 ${s.hidden.toLocaleString()} · 删除 ${s.deleted.toLocaleString()}`, `Selected ${s.selected.toLocaleString()} · Hidden ${s.hidden.toLocaleString()} · Deleted ${s.deleted.toLocaleString()}`);
		undo.disabled = !edits.undoStack.length || busy;
		redo.disabled = !edits.redoStack.length || busy;
	}
	function act(action) {
		const f = {
			all: (a) => a & 6 ? a : a | 1,
			clear: (a) => a & -2,
			invert: (a) => a & 6 ? a : a ^ 1,
			hide: (a) => a & 1 ? (a | 2) & -2 : a,
			unhide: (a) => a & -3,
			delete: (a) => a & 1 ? (a | 4) & -2 : a
		}[action];
		edits.apply(getModels(), f);
	}
	function local(event) {
		const r = viewer.canvas.getBoundingClientRect();
		return [event.clientX - r.left, event.clientY - r.top];
	}
	function paint() {
		const r = viewer.canvas.getBoundingClientRect();
		overlay.width = r.width;
		overlay.height = r.height;
		ctx.clearRect(0, 0, r.width, r.height);
		if (!gesture) return;
		ctx.strokeStyle = "#f1b76b";
		ctx.fillStyle = "#f1b76b22";
		ctx.lineWidth = 1.5;
		const p = gesture.points;
		if (gesture.mode === "rectangle") {
			const a = p[0], b = p[p.length - 1];
			ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
			ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
		} else {
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.strokeStyle = "#f1b76b44";
			ctx.lineWidth = gesture.radius * 2;
			ctx.beginPath();
			p.forEach((v, i) => i ? ctx.lineTo(...v) : ctx.moveTo(...v));
			if (p.length === 1) ctx.lineTo(p[0][0] + .01, p[0][1]);
			ctx.stroke();
			ctx.lineWidth = 1;
			ctx.strokeStyle = "#e4a954";
			ctx.beginPath();
			ctx.arc(...p[p.length - 1], gesture.radius, 0, Math.PI * 2);
			ctx.stroke();
		}
	}
	function distance2(p, a, b) {
		const dx = b[0] - a[0], dy = b[1] - a[1], n = dx * dx + dy * dy;
		const t = n ? Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / n)) : 0;
		return (p.x - a[0] - t * dx) ** 2 + (p.y - a[1] - t * dy) ** 2;
	}
	async function select(g) {
		if (busy) return;
		busy = true;
		refresh();
		const serial = revision, models = getModels(), hits = new Map(models.map((m) => [m, new Uint8Array(m.count)]));
		const r = viewer.canvas.getBoundingClientRect(), spec = gsViewSpec(viewer, r.width, r.height), origin = [...viewer.origin], source = [...viewer.sourceMap];
		const xs = g.points.map((p) => p[0]), ys = g.points.map((p) => p[1]), padding = g.mode === "brush" ? g.radius : 0;
		const x0 = Math.min(...xs) - padding, x1 = Math.max(...xs) + padding, y0 = Math.min(...ys) - padding, y1 = Math.max(...ys) + padding;
		onStatus(text("正在选择…", "Selecting…"));
		try {
			for (let j = 0; j < source.length; j++) {
				const [m, i] = source[j];
				if ((m.editFlags?.[i] || 0) & 6 || m.opacity[i] < viewer.gauss.opacityCutoff) continue;
				const p = gsProjectPosition([
					m.centers[i * 3] - origin[0],
					m.centers[i * 3 + 1] - origin[1],
					m.centers[i * 3 + 2] - origin[2]
				], spec);
				if (p && p.x >= 0 && p.x <= r.width && p.y >= 0 && p.y <= r.height && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) {
					let hit = g.mode === "rectangle";
					if (!hit) {
						if (g.points.length === 1) hit = distance2(p, g.points[0], g.points[0]) <= g.radius ** 2;
						else for (let k = 1; k < g.points.length; k++) if (distance2(p, g.points[k - 1], g.points[k]) <= g.radius ** 2) {
							hit = true;
							break;
						}
					}
					if (hit) hits.get(m)[i] = 1;
				}
				if ((j & 16383) === 0) {
					await new Promise((resolve) => setTimeout(resolve, 0));
					if (serial !== revision) return;
				}
			}
			if (serial === revision) edits.apply(models, (a, i, m) => {
				if (a & 6) return a;
				const hit = hits.get(m)[i];
				return g.subtract ? hit ? a & -2 : a : g.add ? hit ? a | 1 : a : hit ? a | 1 : a & -2;
			});
		} catch (e) {
			onError(e.message);
		} finally {
			busy = false;
			onStatus("");
			refresh();
		}
	}
	const down = (e) => {
		if (!editable() || viewer.fly?.active || !getModels().length || viewer.editMode === "orbit" || e.altKey || e.button !== 0 || busy) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		viewer.canvas.setPointerCapture(e.pointerId);
		gesture = {
			id: e.pointerId,
			mode: viewer.editMode,
			points: [local(e)],
			radius: Number(radius.value),
			add: e.shiftKey,
			subtract: e.ctrlKey || e.metaKey
		};
		paint();
	};
	const move = (e) => {
		if (!gesture || gesture.id !== e.pointerId) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		const p = local(e), last = gesture.points[gesture.points.length - 1];
		if (gesture.mode === "rectangle") gesture.points[1] = p;
		else if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 4) gesture.points.push(p);
		paint();
	};
	const up = (e) => {
		if (!gesture || gesture.id !== e.pointerId) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		const g = gesture;
		gesture = null;
		paint();
		if (viewer.canvas.hasPointerCapture(e.pointerId)) viewer.canvas.releasePointerCapture(e.pointerId);
		if (e.type === "pointerup") select(g);
	};
	viewer.canvas.addEventListener("pointerdown", down, true);
	viewer.canvas.addEventListener("pointermove", move, true);
	for (const name of ["pointerup", "pointercancel"]) viewer.canvas.addEventListener(name, up, true);
	document.addEventListener("keydown", (e) => {
		if (!editable() || viewer.fly?.active || [
			"INPUT",
			"TEXTAREA",
			"SELECT"
		].includes(e.target.tagName) || busy) return;
		const cmd = e.ctrlKey || e.metaKey;
		if (cmd && e.key.toLowerCase() === "z") {
			e.preventDefault();
			e.shiftKey ? edits.redo() : edits.undo();
		} else if (cmd && e.key.toLowerCase() === "y") {
			e.preventDefault();
			edits.redo();
		} else if (e.key === "Delete") {
			e.preventDefault();
			act("delete");
		} else if (e.key === "Escape") {
			if (gesture && viewer.canvas.hasPointerCapture(gesture.id)) viewer.canvas.releasePointerCapture(gesture.id);
			gesture = null;
			paint();
			if (viewer.editMode !== "orbit") {
				stopEditing();
				e.preventDefault();
			}
		}
	});
	const panel = fieldset;
	const exportHeading = make("h3", text("高斯导出", "Gaussian export"));
	panel.append(exportHeading);
	const scope = make("select");
	scope.setAttribute("aria-label", text("导出范围", "Export scope"));
	for (const [value, zh, eng] of [
		[
			"visible",
			"可见且未删除的高斯",
			"Visible, undeleted Gaussians"
		],
		[
			"selected",
			"仅选中的高斯",
			"Selected Gaussians only"
		],
		[
			"all",
			"所有未删除高斯（含隐藏）",
			"All undeleted, including hidden"
		]
	]) {
		const o = make("option", text(zh, eng));
		o.value = value;
		scope.append(o);
	}
	panel.append(scope);
	const exportTarget = make("select");
	exportTarget.setAttribute("aria-label", text("导出文件", "Export file"));
	panel.append(exportTarget);
	panel.append(make("p", text("按原始数据导出，不受显示抽样影响。每次导出一个源文件，保留全部原始属性。", "Export full-resolution source records, independent of viewport sampling. One source file per export; all original properties are retained."), "presentation-help"));
	button(panel, "导出高斯 PLY", "Export Gaussian PLY", () => exportData());
	async function exportData() {
		try {
			const m = getModels()[Number(exportTarget.value) || 0];
			if (!m) throw Error(text("请先勾选文件", "Select a file first"));
			const blob = gsExportPly(m, {
				selectedOnly: scope.value === "selected",
				includeHidden: scope.value === "all"
			});
			await saveLocalBlob(blob, (m.name || "gaussians").replace(/\.ply$/i, "") + "-edited.ply");
			onStatus(text("已导出高斯 PLY，原文件未修改。", "Gaussian PLY exported; source file unchanged."));
		} catch (e) {
			onError(e.message);
		}
	}
	refresh();
	return {
		edits,
		refresh,
		setLoading(value) {
			loading = value;
			if (value) stopEditing();
			refresh();
		},
		sceneChanged() {
			revision++;
			gesture = null;
			paint();
			const value = exportTarget.value;
			exportTarget.replaceChildren();
			getModels().forEach((m, i) => {
				edits.attach(m);
				const o = make("option", m.name || `PLY ${i + 1}`);
				o.value = i;
				exportTarget.append(o);
			});
			exportTarget.value = value !== "" && Number(value) < getModels().length ? value : "0";
			refresh();
		},
		get busy() {
			return busy;
		}
	};
}
function gsOpacityRadius(opacity) {
	if (opacity < .00392156862745098) return 0;
	return Math.min(3, Math.sqrt(Math.max(0, 2 * Math.log(opacity * 255))) + .02);
}
var GS_PROJECTED_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 aClip;
layout(location=2) in vec2 aAxisX;
layout(location=3) in vec2 aAxisY;
layout(location=4) in vec4 aColor;
out vec4 vColor;
out vec2 vPos;
void main(){gl_Position=vec4(aClip.xy+aCorner.x*aAxisX+aCorner.y*aAxisY,0.0,1.0);vColor=aColor;vPos=aCorner*aClip.z;}`;
function gsProjectionCapacity(count) {
	return Number.isSafeInteger(count) && count > 0 && count * 44 <= 100663296;
}
var GaussianProjectionPass = class {
	constructor(gl, vertex, fragment, corners) {
		this.gl = gl;
		this.count = 0;
		this.programs = [];
		this.buffers = [];
		this.vaos = [];
		const shader = (type, source) => {
			const s = gl.createShader(type);
			gl.shaderSource(s, source);
			gl.compileShader(s);
			if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
				const error = gl.getShaderInfoLog(s);
				gl.deleteShader(s);
				throw Error(error);
			}
			return s;
		};
		const program = (vs, feedback) => {
			const p = gl.createProgram();
			this.programs.push(p);
			const shaders = [];
			try {
				shaders.push(shader(gl.VERTEX_SHADER, vs));
				shaders.push(shader(gl.FRAGMENT_SHADER, fragment));
				for (const s of shaders) gl.attachShader(p, s);
				if (feedback) gl.transformFeedbackVaryings(p, [
					"gClip",
					"gAxisX",
					"gAxisY",
					"vColor"
				], gl.INTERLEAVED_ATTRIBS);
				gl.linkProgram(p);
				if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
				return p;
			} finally {
				for (const s of shaders) gl.deleteShader(s);
			}
		};
		try {
			this.project = program(vertex, true);
			this.draw = program(GS_PROJECTED_VERTEX, false);
			this.output = gl.createBuffer();
			this.buffers.push(this.output);
			this.feedback = gl.createTransformFeedback();
			this.projectVAO = gl.createVertexArray();
			this.drawVAO = gl.createVertexArray();
			this.vaos.push(this.projectVAO, this.drawVAO);
			gl.bindVertexArray(this.drawVAO);
			gl.bindBuffer(gl.ARRAY_BUFFER, corners);
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.output);
			for (const [index, size, offset] of [
				[
					1,
					3,
					0
				],
				[
					2,
					2,
					12
				],
				[
					3,
					2,
					20
				],
				[
					4,
					4,
					28
				]
			]) {
				gl.enableVertexAttribArray(index);
				gl.vertexAttribPointer(index, size, gl.FLOAT, false, 44, offset);
				gl.vertexAttribDivisor(index, 1);
			}
			gl.bindVertexArray(null);
			gl.bindBuffer(gl.ARRAY_BUFFER, null);
		} catch (e) {
			this.dispose();
			throw e;
		}
	}
	prepare(count) {
		if (!gsProjectionCapacity(count)) return false;
		if (this.count === count) return true;
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.output);
		gl.bufferData(gl.ARRAY_BUFFER, count * 44, gl.DYNAMIC_COPY);
		const valid = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) === count * 44;
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		if (valid) this.count = count;
		return valid;
	}
	projectAndDraw(count) {
		const gl = this.gl;
		gl.bindVertexArray(this.projectVAO);
		gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.feedback);
		gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.output);
		gl.enable(gl.RASTERIZER_DISCARD);
		gl.beginTransformFeedback(gl.POINTS);
		gl.drawArrays(gl.POINTS, 0, count);
		gl.endTransformFeedback();
		gl.disable(gl.RASTERIZER_DISCARD);
		gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
		gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
		gl.useProgram(this.draw);
		gl.bindVertexArray(this.drawVAO);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
		gl.bindVertexArray(null);
	}
	get allocatedBytes() {
		return this.count * 44;
	}
	release() {
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.output);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, 0, this.gl.DYNAMIC_COPY);
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
		this.count = 0;
	}
	dispose() {
		const gl = this.gl;
		gl.bindVertexArray(null);
		gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
		for (const p of this.programs) gl.deleteProgram(p);
		for (const b of this.buffers) gl.deleteBuffer(b);
		for (const v of this.vaos) gl.deleteVertexArray(v);
		if (this.feedback) gl.deleteTransformFeedback(this.feedback);
	}
};
//#endregion
//#region src/gaussian/covariance.js
/** Symmetric R diag(scale²) Rᵀ, packed as xx, xy, xz, yy, yz, zz. */
function gsCovariance(sx, sy, sz, w, x, y, z) {
	const a = 1 - 2 * (y * y + z * z), b = 2 * (x * y - w * z), c = 2 * (x * z + w * y);
	const d = 2 * (x * y + w * z), e = 1 - 2 * (x * x + z * z), f = 2 * (y * z - w * x);
	const g = 2 * (x * z - w * y), h = 2 * (y * z + w * x), i = 1 - 2 * (x * x + y * y);
	sx *= sx;
	sy *= sy;
	sz *= sz;
	return [
		a * a * sx + b * b * sy + c * c * sz,
		a * d * sx + b * e * sy + c * f * sz,
		a * g * sx + b * h * sy + c * i * sz,
		d * d * sx + e * e * sy + f * f * sz,
		d * g * sx + e * h * sy + f * i * sz,
		g * g * sx + h * h * sy + i * i * sz
	];
}
//#endregion
//#region src/gaussian/quality.js
/** Quality changes pixels and shading only; never the source population. */
function gsFrameQuality({ pixelRatio = 1, devicePixelRatio = 1, moving = false, interactionScale = 1, interactionDegree = 3, degree = 3, exporting = false } = {}) {
	const active = moving && !exporting;
	return {
		dpr: Math.min(devicePixelRatio, pixelRatio) * (active ? interactionScale : 1),
		degree: active ? Math.min(degree, interactionDegree) : degree
	};
}
//#endregion
//#region src/gaussian/sort-worker.js
var GS_SORT_WORKER = `
let centers=null, generation=0,keys,src,dst,recycled=null;const counts=new Uint32Array(2048);
const f=new Float32Array(1),u=new Uint32Array(f.buffer);
onmessage=e=>{
 const m=e.data;
 if(m.type==='recycle'){if(m.generation===generation&&centers&&m.order.byteLength===centers.length/3*4)recycled=m.order;return;}
 if(m.type==='data'){centers=new Float32Array(m.centers);generation=m.generation;const n=centers.length/3;keys=new Uint32Array(n);src=new Uint32Array(n);dst=new Uint32Array(n);recycled=null;return;}
 if(!centers||m.generation!==generation)return;
 const started=performance.now(), n=centers.length/3;
 for(let i=0;i<n;i++){f[0]=centers[i*3]*m.forward[0]+centers[i*3+1]*m.forward[1]+centers[i*3+2]*m.forward[2];const b=u[0];keys[i]=(b&0x80000000?~b:b|0x80000000)>>>0;src[i]=i;}
 for(let s=0;s<32;s+=11){const mask=s===22?1023:2047, buckets=mask+1;counts.fill(0);for(let i=0;i<n;i++)counts[(keys[src[i]]>>>s)&mask]++;let sum=0;for(let b=0;b<buckets;b++){const c=counts[b];counts[b]=sum;sum+=c;}for(let i=0;i<n;i++){const id=src[i];dst[counts[(keys[id]>>>s)&mask]++]=id;}const t=src;src=dst;dst=t;}
 const order=recycled?new Uint32Array(recycled):new Uint32Array(n);recycled=null;order.set(src);postMessage({generation,forward:m.forward,sortMs:performance.now()-started,order:order.buffer},[order.buffer]);
};`;
//#endregion
//#region src/gaussian/renderer.js
var GS_DEG = Math.PI / 180;
var GS_DOT = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var GS_CLAMP = (value, low, high) => Math.max(low, Math.min(high, value));
var GS_BACKGROUNDS = {
	gray: [
		.951,
		.96,
		.965,
		1
	],
	black: [
		0,
		0,
		0,
		1
	],
	white: [
		1,
		1,
		1,
		1
	]
};
var GS_SORT_F32 = /* @__PURE__ */ new Float32Array(1);
var GS_SORT_U32 = new Uint32Array(GS_SORT_F32.buffer);
var GS_VERTEX = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
#ifdef GS_PROJECT_ONCE
const vec2 aCorner=vec2(0.0);
out vec3 gClip;
out vec2 gAxisX;
out vec2 gAxisY;
#else
layout(location=0) in vec2 aCorner;
#endif
uniform usampler2D uOrder;
uniform sampler2D uCenter;
uniform sampler2D uScale;
uniform sampler2D uQuat;
uniform sampler2D uDc;
uniform sampler2D uRest;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uView;
uniform vec3 uEye;
uniform vec2 uFocal;
uniform float uNear;
uniform bool uPerspective;
uniform sampler2D uFlags;
uniform vec3 uTarget;
uniform vec2 uPan;
uniform vec2 uViewport;
uniform float uBaseHeight;
uniform float uZoom;
uniform float uScaleMul;
uniform float uCutoff;
uniform int uWidth;
uniform int uRestWidth;
uniform int uDegree;
uniform bool uPointPreview;
uniform float uFar;
out vec4 vColor;
out vec2 vPos;
float gsRadius=3.0;
// SH coefficients are packed four per texel. Fetch each texel once per channel.
vec4 gsBands(int id, int channel, int group) {
  int texel=id*12+channel*4+group;
  return texelFetch(uRest,ivec2(texel&2047,texel>>11),0);
}
vec3 gsShade(vec3 dc, int id, vec3 direction) {
  vec3 color=0.28209479177387814*dc;
  if(uDegree>0){
    float x=direction.x,y=direction.y,z=direction.z;
    float xx=x*x,yy=y*y,zz=z*z,xy=x*y,yz=y*z,xz=x*z;
    vec4 b0=vec4(-0.4886025119029199*y,0.4886025119029199*z,-0.4886025119029199*x,uDegree>1?1.0925484305920792*xy:0.0);
    vec4 b1=vec4(0.0),b2=vec4(0.0),b3=vec4(0.0);
    if(uDegree>1)b1=vec4(-1.0925484305920792*yz,0.31539156525252005*(2.0*zz-xx-yy),-1.0925484305920792*xz,0.5462742152960396*(xx-yy));
    if(uDegree>2){b2=vec4(-0.5900435899266435*y*(3.0*xx-yy),2.890611442640554*xy*z,-0.4570457994644658*y*(4.0*zz-xx-yy),0.3731763325901154*z*(2.0*zz-3.0*xx-3.0*yy));
    b3=vec4(-0.4570457994644658*x*(4.0*zz-xx-yy),1.445305721320277*z*(xx-yy),-0.5900435899266435*x*(xx-3.0*yy),0.0);}
    for(int c=0;c<3;c++){
      color[c]+=dot(gsBands(id,c,0),b0);
      if(uDegree>1)color[c]+=dot(gsBands(id,c,1),b1);
      if(uDegree>2)color[c]+=dot(gsBands(id,c,2),b2)+dot(gsBands(id,c,3),b3);
    }
  }
  return clamp(color+vec3(0.5),0.0,1.0);
}

void projectGaussian() {
#ifdef GS_PROJECT_ONCE
  gAxisX=vec2(0.0);gAxisY=vec2(0.0);
  int instance=gl_VertexID;
#else
  int instance=gl_InstanceID;
#endif
  ivec2 orderUv = ivec2(instance & 2047, instance >> 11);
  int id = int(texelFetch(uOrder, orderUv, 0).r);
  ivec2 uv = ivec2(id & 2047, id >> 11);
  vec4 centerA = texelFetch(uCenter, uv, 0);
  vec3 center = centerA.xyz;
  float opacity = centerA.w;
  if(uFar>0.0)opacity*=clamp((uFar-length(center-uEye))/(uFar*.1),0.0,1.0);
  vPos = aCorner * 3.0;
  int flags = int(texelFetch(uFlags, uv, 0).r * 255.0 + 0.5);
  float depth = -dot(center - uEye, -uView);
  if (opacity < 1.0/255.0 || opacity < uCutoff || (flags & 6) != 0 || (uPerspective && depth <= uNear)) { vColor = vec4(0.0); gl_Position = vec4(2.0, 2.0, 0.0, 1.0); return; }
  if (uPointPreview) {
    vec3 rel = center - uEye;
    float h = uBaseHeight / uZoom;
    vec2 clip = vec2((dot(center-uTarget,uRight)-uPan.x)/(h*uViewport.x/uViewport.y), (dot(center-uTarget,uUp)-uPan.y)/h)*2.0;
    if(uPerspective) clip=vec2(dot(rel,uRight),dot(rel,uUp))/depth*uFocal*2.0/uViewport;
    gl_Position=vec4(clip+aCorner*4.0/uViewport,0.0,1.0);
    vec3 rgb=clamp(texelFetch(uDc,uv,0).xyz*0.28209479177387814+0.5,0.0,1.0);
    vColor=vec4(rgb*opacity,opacity);vPos=aCorner;return;
  }
  // Outside this support every original fragment already fails alpha >= 1/255.
  // A small guard avoids removing threshold pixels through float rounding.

  vec4 shapeA=texelFetch(uScale,uv,0);
  vec3 shapeB=texelFetch(uQuat,uv,0).xyz;
  gsRadius=shapeB.z;
  if(uFar>0.0)gsRadius=min(3.0,sqrt(max(0.0,2.0*log(opacity*255.0)))+0.02);
  vPos=aCorner*gsRadius;
  mat3 covariance=mat3(shapeA.x,shapeA.y,shapeA.z,shapeA.y,shapeA.w,shapeB.x,shapeA.z,shapeB.x,shapeB.y)*(uScaleMul*uScaleMul);
  float worldHeight = uBaseHeight / uZoom;
  float worldWidth = worldHeight * uViewport.x / max(uViewport.y, 1.0);
  float pixelsPerWorld = uViewport.y / worldHeight;
  vec3 relative = center - uEye;
  float vx = dot(relative, uRight), vy = dot(relative, uUp);
  // Bound the off-screen Jacobian: perspective linearization diverges near
  // the eye plane. This changes projection stability, never source scales.
  vec2 slopeLimit = 0.65 * uViewport / uFocal;
  vec2 slope = clamp(vec2(vx, vy) / max(depth, uNear), -slopeLimit, slopeLimit);
  vec3 jx = uPerspective ? uFocal.x / depth * (uRight + slope.x * (-uView)) : uRight * pixelsPerWorld;
  vec3 jy = uPerspective ? uFocal.y / depth * (uUp + slope.y * (-uView)) : uUp * pixelsPerWorld;
  float cov00=dot(jx,covariance*jx)+0.3;
  vec3 covarianceY=covariance*jy;
  float cov11=dot(jy,covarianceY)+0.3;
  float cov01=dot(jx,covarianceY);
  float cx = dot(uTarget, uRight) + uPan.x;
  float cy = dot(uTarget, uUp) + uPan.y;
  vec2 clip = vec2((dot(center, uRight) - cx) / worldWidth, (dot(center, uUp) - cy) / worldHeight) * 2.0;
  if (uPerspective) clip = vec2(vx, vy) / depth * uFocal * 2.0 / uViewport;
  // Cauchy-Schwarz bounds both original rotated-quad axes by sqrt(2*variance).
  bool outsideCenter=any(greaterThan(abs(clip),vec2(1.0)));
  if(outsideCenter){
    vec2 conservative=gsRadius*sqrt(2.0*max(vec2(cov00,cov11),vec2(0.0)))*2.0/uViewport;
    if(any(greaterThan(abs(clip)-conservative,vec2(1.0)))){vColor=vec4(0.0);gl_Position=vec4(2.0,2.0,0.0,1.0);return;}
  }
  float mid = 0.5 * (cov00 + cov11);
  float disc = sqrt(max(0.0, mid * mid - (cov00 * cov11 - cov01 * cov01)));
  float lambda1 = mid + disc;
  float lambda2 = max(mid - disc, 1e-4);
  vec2 eigen = abs(cov01) < 1e-4 ? (cov00 >= cov11 ? vec2(1.0, 0.0) : vec2(0.0, 1.0)) : normalize(vec2(cov01, lambda1 - cov00));
  vec2 ortho = vec2(-eigen.y, eigen.x);
  vec2 axisX=eigen*(gsRadius*sqrt(lambda1))*2.0/uViewport;
  vec2 axisY=ortho*(gsRadius*sqrt(lambda2))*2.0/uViewport;
  vec2 offset=aCorner.x*axisX+aCorner.y*axisY;

  // Cull only when the entire original quad lies beyond the viewport.
  // Center-only culling would incorrectly remove wide edge-overlapping splats.
  vec2 support=abs(axisX)+abs(axisY);
  if(outsideCenter&&any(greaterThan(abs(clip)-support,vec2(1.0)))){vColor=vec4(0.0);gl_Position=vec4(2.0,2.0,0.0,1.0);return;}
#ifdef GS_PROJECT_ONCE
  gAxisX=axisX;gAxisY=axisY;
#endif
  clip += offset;
  gl_Position = vec4(clip, 0.0, 1.0);
  vec3 rgb = gsShade(texelFetch(uDc, uv, 0).xyz, id, uPerspective ? normalize(center - uEye) : uView);
  if ((flags & 1) != 0) rgb = mix(rgb, vec3(1.0, 0.55, 0.08), 0.65);
  vColor = vec4(rgb * opacity, opacity);
}
void main(){projectGaussian();
#ifdef GS_PROJECT_ONCE
  gClip=vec3(gl_Position.xy,gsRadius);
#endif
}`;
var GS_FRAGMENT = `#version 300 es
precision highp float;
in vec4 vColor;
in vec2 vPos;
out vec4 fragColor;
void main() {
  float weight = exp(-0.5 * dot(vPos, vPos));
  float alpha = vColor.a * weight;
  if (alpha < 1.0 / 255.0) discard;
  fragColor = vec4(vColor.rgb * weight, alpha);
}`;
function gsFloatSortKey(value) {
	GS_SORT_F32[0] = value;
	const bits = GS_SORT_U32[0];
	return (bits & 2147483648 ? ~bits : bits | 2147483648) >>> 0;
}
function gsRadixSort(keys, order, temp) {
	const count = order.length, counts = /* @__PURE__ */ new Uint32Array(256);
	let src = order, dst = temp;
	for (let shift = 0; shift < 32; shift += 8) {
		counts.fill(0);
		for (let index = 0; index < count; index += 1) counts[keys[src[index]] >>> shift & 255] += 1;
		let sum = 0;
		for (let bin = 0; bin < 256; bin += 1) {
			const next = counts[bin];
			counts[bin] = sum;
			sum += next;
		}
		for (let index = 0; index < count; index += 1) {
			const id = src[index];
			dst[counts[keys[id] >>> shift & 255]++] = id;
		}
		const swap = src;
		src = dst;
		dst = swap;
	}
	if (src !== order) order.set(src);
}
/** Drop the outer 5% on each side so distant floaters do not shrink the trained subject. */
function gsDisplayBounds(models, min, max) {
	let total = 0;
	for (const model of models) total += model.count;
	if (total < 64) return [min, max];
	const values = new Float32Array(total);
	const low = Math.floor(.05 * (total - 1));
	const high = total - 1 - low;
	const bounds = [[
		0,
		0,
		0
	], [
		0,
		0,
		0
	]];
	for (let axis = 0; axis < 3; axis += 1) {
		let write = 0;
		for (const model of models) for (let index = 0; index < model.count; index += 1) values[write++] = model.centers[index * 3 + axis];
		values.sort();
		bounds[0][axis] = values[low];
		bounds[1][axis] = values[high];
		if (!(bounds[1][axis] > bounds[0][axis])) return [min, max];
	}
	return bounds;
}
var GaussianViewer = class {
	constructor(canvas, { onError = () => {} } = {}) {
		this.canvas = canvas;
		this.onError = onError;
		this.options = {
			...currentPresentation(),
			showPoints: true,
			pointRatio: 100,
			legend: false
		};
		this.gauss = {
			scale: 1,
			opacityCutoff: 0,
			background: "black",
			shDegree: 3
		};
		this.projection = "perspective";
		this.fov = 55;
		this.distance = 10;
		this.near = .001;
		this.trainingPose = null;
		this.editMode = "orbit";
		this.generation = 0;
		this.sortedReady = false;
		this.sortBusy = false;
		this.workerUrl = URL.createObjectURL(new Blob([GS_SORT_WORKER], { type: "text/javascript" }));
		try {
			this.sortWorker = new Worker(this.workerUrl);
			this.sortWorker.onmessage = (event) => this.receiveSort(event.data);
			this.sortWorker.onerror = () => {
				this.sortWorker.terminate();
				this.sortWorker = null;
				this.sortBusy = false;
				this.sortDirty = true;
				this.requestRender();
			};
		} catch {
			this.sortWorker = null;
		}
		this.camera = {
			elevation: 38,
			azimuth: -55,
			zoom: 1,
			pan: [0, 0],
			roll: 0
		};
		let navigationSettings = {};
		try {
			navigationSettings = JSON.parse(localStorage.getItem("BuildingWebViewer.camera.navigation.v2") || "{}");
		} catch {}
		this.navigation = new CameraNavigation(navigationSettings);
		this.target = [
			0,
			0,
			0
		];
		this.origin = [
			0,
			0,
			0
		];
		this.baseHeight = 10;
		this.bounds = null;
		this.buffers = {};
		this.models = [];
		this.activeClouds = [];
		this.pointCount = 0;
		this.edgeCount = 0;
		this.triangleCount = 0;
		this.count = 0;
		this.exportTarget = null;
		this.disposed = false;
		this.frame = null;
		this.contextLost = false;
		this.interacting = false;
		this.gpuProjection = false;
		this.sortDirty = true;
		this.listeners = [];
		try {
			this.gl = canvas.getContext("webgl2", {
				antialias: false,
				alpha: false,
				preserveDrawingBuffer: false,
				depth: false
			});
			if (!this.gl) throw Error(t("无法启用 WebGL2，请使用 Chrome 或 Edge，并打开硬件加速。"));
			const rendererInfo = this.gl.getExtension("WEBGL_debug_renderer_info");
			this.softwareRendering = Boolean(rendererInfo && /swiftshader|llvmpipe|softpipe|software/i.test(this.gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) || ""));
			this.initGL();
		} catch (error) {
			this.onError(error.message);
			throw error;
		}
		this.installEvents();
		this.onNavVisibility = () => {
			if (document.hidden) this.stopNavigation();
		};
		document.addEventListener("visibilitychange", this.onNavVisibility);
		this.viewportSize = canvas.getBoundingClientRect();
		this.resizeObserver = new ResizeObserver((entries) => {
			const rect = entries[0]?.contentRect;
			if (rect) this.viewportSize = {
				width: rect.width,
				height: rect.height
			};
			this.requestRender();
		});
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
				const message = gl.getShaderInfoLog(shader) || "";
				gl.deleteShader(shader);
				throw Error(t("WebGL 着色器编译失败：{0}", [message]));
			}
			return shader;
		};
		const vertex = compile(gl.VERTEX_SHADER, GS_VERTEX);
		let fragment;
		try {
			fragment = compile(gl.FRAGMENT_SHADER, GS_FRAGMENT);
		} catch (error) {
			gl.deleteShader(vertex);
			throw error;
		}
		const program = gl.createProgram();
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		gl.linkProgram(program);
		gl.deleteShader(vertex);
		gl.deleteShader(fragment);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			const message = gl.getProgramInfoLog(program) || "";
			gl.deleteProgram(program);
			throw Error(t("WebGL 程序链接失败：{0}", [message]));
		}
		if (this.program) gl.deleteProgram(this.program);
		this.program = program;
		this.locations = {};
		for (const name of [
			"uOrder",
			"uCenter",
			"uScale",
			"uQuat",
			"uDc",
			"uRest",
			"uRight",
			"uUp",
			"uView",
			"uTarget",
			"uPan",
			"uViewport",
			"uBaseHeight",
			"uZoom",
			"uScaleMul",
			"uCutoff",
			"uWidth",
			"uRestWidth",
			"uDegree",
			"uPointPreview",
			"uFar",
			"uEye",
			"uFocal",
			"uNear",
			"uPerspective",
			"uFlags"
		]) this.locations[name] = gl.getUniformLocation(program, name);
		const corners = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, corners);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
			-1,
			-1,
			1,
			-1,
			-1,
			1,
			1,
			1
		]), gl.STATIC_DRAW);
		this.cornerBuffer = corners;
		this.projectionPass?.dispose();
		this.projectionPass = null;
		this.projectionFallback = null;
		this.projectionBlockedCount = null;
		this.projectionInitTried = false;
		this.textures = {};
		for (const name of [
			"order",
			"center",
			"scale",
			"quat",
			"dc",
			"rest",
			"flags"
		]) this.textures[name] = gl.createTexture();
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
	}
	ensureProjectionPass() {
		if (this.projectionInitTried) return;
		this.projectionInitTried = true;
		const gl = this.gl;
		try {
			this.projectionPass = new GaussianProjectionPass(gl, GS_VERTEX.replace("#version 300 es", "#version 300 es\n#define GS_PROJECT_ONCE"), GS_FRAGMENT, this.cornerBuffer);
			this.projectLocations = {};
			for (const name of Object.keys(this.locations)) this.projectLocations[name] = gl.getUniformLocation(this.projectionPass.project, name);
		} catch (error) {
			this.projectionFallback = "GPU projection initialization failed";
		}
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
		this.canvas.style.cursor = "grab";
		listen("contextmenu", (event) => event.preventDefault());
		for (const name of ["pointermove", "wheel"]) listen(name, (event) => {
			if (name === "wheel" || event.buttons || event.pointerType === "touch") this.diagnosticProbe?.input(performance.now(), event.timeStamp);
		}, { passive: true });
		mountTouchCamera(this, listen);
		listen("pointerdown", (event) => {
			if (this.fly?.active) return;
			if (this.editMode !== "orbit" && event.button === 0 && !event.altKey && event.pointerType !== "touch") return;
			this.interacting = true;
			if (event.pointerType === "touch" || ![
				0,
				1,
				2
			].includes(event.button)) return;
			event.preventDefault();
			this.canvas.setPointerCapture(event.pointerId);
			this.beginOrbit(event.button !== 0 || event.shiftKey);
			this.drag = {
				id: event.pointerId,
				x: event.clientX,
				y: event.clientY,
				pan: event.button !== 0 || event.shiftKey
			};
			this.canvas.style.cursor = "grabbing";
		});
		listen("pointermove", (event) => {
			if (this.fly?.active || event.pointerType === "touch" || !this.drag || this.drag.id !== event.pointerId) return;
			const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
			this.drag.x = event.clientX;
			this.drag.y = event.clientY;
			this.navigatePixels(dx, dy, this.drag.pan || event.shiftKey, event.ctrlKey || event.metaKey);
			this.requestRender();
		});
		const finish = (event) => {
			this.interacting = false;
			if (this.drag?.id === event.pointerId) {
				this.drag = null;
				this.canvas.style.cursor = "grab";
				if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
			}
			this.requestRender();
		};
		for (const name of [
			"pointerup",
			"pointercancel",
			"lostpointercapture"
		]) listen(name, finish);
		listen("dblclick", (event) => {
			if (this.fly?.active || this.editMode !== "orbit" || event.button !== 0) return;
			const rect = this.canvas.getBoundingClientRect();
			this.focusOrbit(event.clientX - rect.left, event.clientY - rect.top);
		});
		listen("wheel", (event) => {
			event.preventDefault();
			if (this.fly?.active) return;
			const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.canvas.clientHeight : 1);
			this.zoomBy(Math.exp(-GS_CLAMP(delta, -500, 500) * .0015), event.ctrlKey || event.metaKey);
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
				this.initGL();
				this.sortedReady = false;
				this.sortDirty = true;
				this.upload(true);
				this.render();
				this.onError("");
			} catch (error) {
				this.onError(error.message);
			}
		});
	}
	basis() {
		if (this.flyPose) return this.flyPose.basis;
		if (this.trainingPose) return this.trainingPose.basis;
		const elevation = this.camera.elevation * GS_DEG, azimuth = this.camera.azimuth * GS_DEG;
		const right = [
			-Math.sin(azimuth),
			Math.cos(azimuth),
			0
		];
		const up = [
			-Math.cos(azimuth) * Math.sin(elevation),
			-Math.sin(azimuth) * Math.sin(elevation),
			Math.cos(elevation)
		];
		const back = [
			Math.cos(azimuth) * Math.cos(elevation),
			Math.sin(azimuth) * Math.cos(elevation),
			Math.sin(elevation)
		];
		const roll = (this.camera.roll || 0) * GS_DEG, c = Math.cos(roll), sn = Math.sin(roll);
		return [
			right.map((v, i) => v * c + up[i] * sn),
			up.map((v, i) => v * c - right[i] * sn),
			back
		];
	}
	worldCenter() {
		if (!this.bounds) return [
			0,
			0,
			0
		];
		return this.bounds[0].map((value, axis) => (value + this.bounds[1][axis]) / 2);
	}
	fit() {
		this.fly?.leave();
		this.stopNavigation();
		this.leaveTraining();
		this.orbitLens = null;
		const bounds = this.bounds ? this.bounds.map((point) => point.map((value, axis) => value - this.origin[axis])) : [[
			-1,
			-1,
			-1
		], [
			1,
			1,
			1
		]];
		this.target = bounds[0].map((value, axis) => value + (bounds[1][axis] - value) / 2);
		const [right, up] = this.basis();
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
		for (const x of [bounds[0][0], bounds[1][0]]) for (const y of [bounds[0][1], bounds[1][1]]) for (const z of [bounds[0][2], bounds[1][2]]) {
			const point = [
				x,
				y,
				z
			], px = GS_DOT(point, right), py = GS_DOT(point, up);
			minX = Math.min(minX, px);
			maxX = Math.max(maxX, px);
			minY = Math.min(minY, py);
			maxY = Math.max(maxY, py);
		}
		const aspect = Math.max(1, this.canvas.clientWidth) / Math.max(1, this.canvas.clientHeight);
		this.baseHeight = Math.max(.001, maxY - minY, (maxX - minX) / aspect) * 1.22;
		this.trainingPose = null;
		const extent = Math.hypot(...bounds[0].map((v, i) => bounds[1][i] - v));
		this.distance = Math.max(.001, extent / (2 * Math.sin(Math.min(this.fov * Math.PI / 180, 2 * Math.atan(Math.tan(this.fov * Math.PI / 360) * aspect)) / 2))) * 1.1;
		this.near = Math.max(1e-5, extent * 1e-5);
		this.camera.zoom = 1;
		this.camera.pan = [0, 0];
		this.render();
	}
	setView(view) {
		this.fly?.leave();
		this.stopNavigation();
		this.trainingPose = null;
		this.camera.roll = 0;
		const values = {
			iso: [38, -55],
			top: [90, -90],
			front: [0, -90]
		}[view];
		if (!values) throw Error(t("不支持的视角：{0}", [view]));
		[this.camera.elevation, this.camera.azimuth] = values;
		this.fit();
	}
	stopNavigation() {
		this.fly?.leave();
		this.navigation?.reset();
	}
	setNavigation(options) {
		this.stopNavigation();
		this.navigation.settings = cameraNavigationSettings({
			...this.navigation.settings,
			...options
		});
		if (options.pivot && this.count) {
			if (options.pivot === "model") gsReanchorOrbit(this, { model: true });
			this.requestRender();
		}
		try {
			localStorage.setItem(CAMERA_NAV_STORAGE, JSON.stringify(this.navigation.settings));
		} catch {}
	}
	applyNavigation(delta) {
		const [azimuth, elevation, x, y, zoom] = delta;
		if (azimuth || elevation) {
			const basis = this.basis(), yaw = basis.map((v) => gsOrbitRotate(v, basis[1], azimuth * GS_DEG));
			const turned = yaw.map((v) => gsOrbitRotate(v, yaw[0], -elevation * GS_DEG));
			gsSetOrbitBasis(this, turned);
		}
		this.camera.pan[0] += x;
		this.camera.pan[1] += y;
		this.camera.zoom = GS_CLAMP(this.camera.zoom * Math.exp(zoom), .02, 100);
		if (this.camera.zoom === .02 || this.camera.zoom === 100) this.navigation.pending[4] = 0;
	}
	queueNavigation(delta) {
		this.navigation.enqueue(delta, performance.now());
		if (!this.navigation.settings.smoothing) this.applyNavigation(this.navigation.step(performance.now()));
		this.requestRender();
	}
	beginOrbit(pan = false) {
		if (!this.count || this.fly?.active) return;
		this.navigation.reset();
		const mode = this.navigation.settings.pivot;
		if (!pan && mode !== "fixed") gsReanchorOrbit(this, { model: mode === "model" });
		this.leaveTraining();
	}
	focusOrbit(x = null, y = null) {
		if (!this.count) return false;
		this.stopNavigation();
		const hit = gsReanchorOrbit(this, {
			x,
			y
		});
		if (hit) this.setNavigation({ pivot: "fixed" });
		this.onOrbitAnchor?.(hit);
		this.requestRender();
		return hit;
	}
	navigatePixels(dx, dy, pan = false, precision = false) {
		if (!this.count) return;
		this.leaveTraining();
		const scale = cameraNavigationScale(this, this.navigation.settings), fine = precision ? .2 : 1;
		this.queueNavigation(pan ? [
			0,
			0,
			-dx * scale.pan * fine,
			dy * scale.pan * fine,
			0
		] : [
			-dx * scale.rotateX * fine,
			dy * scale.rotateY * fine,
			0,
			0,
			0
		]);
	}
	zoomBy(factor, precision = false, repivot = true) {
		if (!Number.isFinite(factor) || factor <= 0 || !this.count) return;
		const now = performance.now();
		if (repivot && (!this.lastOrbitWheel || now - this.lastOrbitWheel > 180)) this.beginOrbit(false);
		this.lastOrbitWheel = now;
		this.leaveTraining();
		this.queueNavigation([
			0,
			0,
			0,
			0,
			Math.log(factor) * this.navigation.settings.zoomSpeed * (precision ? .2 : 1)
		]);
	}
	setOptions(options = {}) {
		for (const key of [
			"axes",
			"ruler",
			"legend",
			"pointCountLabel"
		]) if (key in options) this.options[key] = Boolean(options[key]);
		this.render();
	}
	setGaussianOptions(options = {}) {
		if (Number.isFinite(options.scale)) this.gauss.scale = GS_CLAMP(options.scale, .05, 8);
		if (Number.isFinite(options.opacityCutoff)) this.gauss.opacityCutoff = GS_CLAMP(options.opacityCutoff, 0, .99);
		if (options.background && GS_BACKGROUNDS[options.background]) this.gauss.background = options.background;
		if (Number.isInteger(options.shDegree)) this.gauss.shDegree = GS_CLAMP(options.shDegree, 0, this.packed?.rest ? 3 : 0);
		this.render();
	}
	clearSplats() {
		this.fly?.leave();
		this.stopNavigation();
		this.models = [];
		this.sourceMap = [];
		this.trainingPose = null;
		this.packed = null;
		this.generation++;
		this.sortBusy = false;
		this.sortedReady = false;
		this.count = 0;
		this.pointCount = 0;
		this.bounds = null;
		this.projectionPass?.release();
		this.projectionBlockedCount = null;
		this.buffers = {};
		this.activeClouds = [];
		this.sortDirty = true;
		this.render();
	}
	setModels(models, { preserveView = false, maxSplats = 0, shDegree = this.gauss.shDegree } = {}) {
		this.fly?.leave();
		this.stopNavigation();
		preserveView = preserveView && this.count > 0;
		const list = (models || []).filter((model) => model?.count > 0);
		this.models = list;
		if (!list.length) {
			this.clearSplats();
			return;
		}
		const min = [
			Infinity,
			Infinity,
			Infinity
		], max = [
			-Infinity,
			-Infinity,
			-Infinity
		];
		let total = 0, sourceCount = 0;
		for (const model of list) {
			total += model.count;
			sourceCount += model.sourceCount || model.count;
			for (let axis = 0; axis < 3; axis += 1) {
				min[axis] = Math.min(min[axis], model.bounds.min[axis]);
				max[axis] = Math.max(max[axis], model.bounds.max[axis]);
			}
		}
		const stride = maxSplats > 0 && total > maxSplats ? Math.ceil(total / maxSplats) : 1;
		const displayed = Math.ceil(total / stride);
		const origin = min.map((value, axis) => (value + max[axis]) / 2);
		const frame = gsDisplayBounds(list, min, max);
		const previousOrigin = [...this.origin], previousTarget = [...this.target];
		const centers = new Float32Array(displayed * 3), dc = new Float32Array(displayed * 3), opacity = new Float32Array(displayed);
		const scale = new Float32Array(displayed * 3), quat = new Float32Array(displayed * 4);
		const withRest = shDegree > 0 && list.some((model) => model.rest);
		const rest = withRest ? new Float32Array(displayed * 45) : null;
		this.sourceMap = [];
		const flags = new Float32Array(displayed);
		let write = 0, global = 0;
		for (const model of list) for (let index = 0; index < model.count; index += 1, global += 1) {
			if (global % stride) continue;
			centers.set([
				model.centers[index * 3] - origin[0],
				model.centers[index * 3 + 1] - origin[1],
				model.centers[index * 3 + 2] - origin[2]
			], write * 3);
			dc.set(model.dc.subarray(index * 3, index * 3 + 3), write * 3);
			opacity[write] = model.opacity[index];
			const sx = model.scale[index * 3], sy = model.scale[index * 3 + 1], sz = model.scale[index * 3 + 2];
			const coverage = model.preview ? Math.sqrt(model.sampleStep || 1) : 1;
			scale.set([
				sx * coverage,
				sy * coverage,
				sz * coverage
			], write * 3);
			this.sourceMap.push([model, index]);
			flags[write] = model.editFlags?.[index] || 0;
			quat.set(model.quat.subarray(index * 4, index * 4 + 4), write * 4);
			if (rest && model.rest) rest.set(model.rest.subarray(index * 45, index * 45 + 45), write * 45);
			write += 1;
		}
		this.origin = origin;
		this.bounds = frame;
		this.pointCount = sourceCount;
		this.count = write;
		this.packed = {
			centers: centers.subarray(0, write * 3),
			dc: dc.subarray(0, write * 3),
			opacity: opacity.subarray(0, write),
			scale: scale.subarray(0, write * 3),
			quat: quat.subarray(0, write * 4),
			rest: rest ? rest.subarray(0, write * 45) : null
		};
		this.flags = flags;
		this.buffers = { ...this.packed };
		this.activeClouds = [{
			count: write,
			item: { displayColor: "#888888" }
		}];
		this.gauss.shDegree = withRest ? shDegree : 0;
		this.sortDirty = true;
		this.generation++;
		this.sortBusy = false;
		this.sortedReady = false;
		if (this.sortWorker) {
			const copy = this.packed.centers.slice();
			this.sortWorker.postMessage({
				type: "data",
				generation: this.generation,
				centers: copy.buffer
			}, [copy.buffer]);
		}
		this.upload(false);
		if (preserveView) {
			this.target = previousTarget.map((value, axis) => value + previousOrigin[axis] - origin[axis]);
			if (this.trainingPose) this.trainingPose.eye = this.trainingPose.eye.map((value, axis) => value + previousOrigin[axis] - origin[axis]);
		} else {
			this.fit();
			return;
		}
		this.render();
	}
	upload(force) {
		if (!this.packed || !force && this.uploaded === this.packed) return;
		const gl = this.gl, count = this.count, width = 2048, height = Math.max(1, Math.ceil(count / width));
		const pixels = (channels, fill) => {
			const data = new Float32Array(width * height * 4);
			for (let index = 0; index < count; index += 1) fill(data, index, index * 4);
			return data;
		};
		const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
		if (height > maxTexture || this.packed.rest && Math.ceil(count * 12 / width) > maxTexture) throw Error("超出当前 GPU 纹理容量，请减少同时载入的模型或使用容量更大的设备 / GPU texture capacity exceeded");
		const center = pixels(4, (data, index, at) => {
			data.set(this.packed.centers.subarray(index * 3, index * 3 + 3), at);
			data[at + 3] = this.packed.opacity[index];
		});
		const scale = new Float32Array(width * height * 4), quat = new Float32Array(width * height * 4);
		for (let i = 0; i < count; i++) {
			const a = i * 3, b = i * 4, p = this.packed;
			const cov = gsCovariance(p.scale[a], p.scale[a + 1], p.scale[a + 2], p.quat[b], p.quat[b + 1], p.quat[b + 2], p.quat[b + 3]);
			scale[b] = cov[0];
			scale[b + 1] = cov[1];
			scale[b + 2] = cov[2];
			scale[b + 3] = cov[3];
			quat[b] = cov[4];
			quat[b + 1] = cov[5];
			quat[b + 2] = gsOpacityRadius(p.opacity[i]);
		}
		const dc = pixels(4, (data, index, at) => data.set(this.packed.dc.subarray(index * 3, index * 3 + 3), at));
		this.textureSize = {
			width,
			height
		};
		this.orderPixels = new Uint32Array(width * height);
		gl.bindTexture(gl.TEXTURE_2D, this.textures.order);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32UI, width, height, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, null);
		this.putFloat(this.textures.center, width, height, center);
		this.putFloat(this.textures.scale, width, height, scale);
		this.putFloat(this.textures.quat, width, height, quat);
		this.putFloat(this.textures.dc, width, height, dc);
		if (this.packed.rest) {
			const texelCount = count * 12, restWidth = 2048, restHeight = Math.ceil(texelCount / restWidth);
			const rest = new Float32Array(restWidth * restHeight * 4);
			for (let index = 0; index < count; index += 1) for (let channel = 0; channel < 3; channel += 1) for (let band = 0; band < 15; band += 1) {
				const texel = index * 12 + channel * 4 + (band >> 2);
				rest[texel * 4 + (band & 3)] = this.packed.rest[index * 45 + channel * 15 + band];
			}
			this.restSize = {
				width: restWidth,
				height: restHeight
			};
			this.putFloat(this.textures.rest, restWidth, restHeight, rest);
		} else {
			this.restSize = {
				width: 1,
				height: 1
			};
			this.putFloat(this.textures.rest, 1, 1, /* @__PURE__ */ new Float32Array(4));
		}
		this.syncFlags(false);
		this.uploaded = this.packed;
		const error = gl.getError();
		if (error === gl.OUT_OF_MEMORY) throw Error(t("显存不足，请减少同时载入的模型或使用容量更大的设备。"));
		if (error && error !== gl.NO_ERROR) throw Error(t("WebGL 缓冲区上传失败（{0}）。", [error]));
	}
	receiveSort(message) {
		try {
			if (message.generation !== this.generation) return;
			this.sortBusy = false;
			this.diagnosticProbe?.sort(message.sortMs, performance.now() - this.diagnosticSortStart);
			if (!this.packed || this.contextLost) return;
			this.uploadOrder(new Uint32Array(message.order));
			this.sortForward = message.forward;
			this.sortTarget = [...this.target];
			this.sortDirty = false;
			this.sortedReady = true;
			this.requestRender();
		} finally {
			if (this.sortWorker && message.order instanceof ArrayBuffer) this.sortWorker.postMessage({
				type: "recycle",
				generation: message.generation,
				order: message.order
			}, [message.order]);
		}
	}
	uploadOrder(order) {
		const started = performance.now(), gl = this.gl, { width, height } = this.textureSize;
		this.orderPixels.set(order);
		gl.bindTexture(gl.TEXTURE_2D, this.textures.order);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED_INTEGER, gl.UNSIGNED_INT, this.orderPixels);
		this.diagnosticProbe?.upload(performance.now() - started);
	}
	syncFlags(redraw = true) {
		if (!this.packed) return;
		const { width, height } = this.textureSize, data = new Uint8Array(width * height);
		for (let i = 0; i < this.sourceMap.length; i++) {
			const [model, id] = this.sourceMap[i];
			data[i] = model.editFlags?.[id] || 0;
			this.flags[i] = data[i];
		}
		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D, this.textures.flags);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, data);
		if (redraw) this.requestRender();
	}
	applyTraining(camera) {
		this.fly?.leave();
		this.stopNavigation();
		this.orbitLens = null;
		this.trainingPose = gsTrainingPose(camera, this.origin);
		this.near = .2;
		this.projection = "perspective";
		this.camera.zoom = 1;
		this.camera.pan = [0, 0];
		this.fov = 2 * Math.atan(camera.height / (2 * camera.fy)) * 180 / Math.PI;
		const center = this.worldCenter().map((v, i) => v - this.origin[i]);
		const distance = Math.max(.01, Math.abs(GS_DOT(center.map((v, i) => v - this.trainingPose.eye[i]), this.trainingPose.basis[2])));
		this.distance = distance;
		this.target = this.trainingPose.eye.map((v, i) => v - this.trainingPose.basis[2][i] * distance);
		this.sortDirty = true;
		this.requestRender();
	}
	leaveTraining() {
		if (!this.trainingPose) return;
		const pose = this.trainingPose, back = pose.basis[2];
		this.camera.elevation = Math.asin(Math.max(-1, Math.min(1, back[2]))) / GS_DEG;
		this.camera.azimuth = Math.atan2(back[1], back[0]) / GS_DEG;
		this.trainingPose = null;
		this.camera.roll = 0;
		this.camera.pan = [0, 0];
		const [right, up] = this.basis();
		this.camera.roll = Math.atan2(GS_DOT(pose.basis[0], up), GS_DOT(pose.basis[0], right)) / GS_DEG;
		const fit = Math.min(this.canvas.clientWidth / pose.width, this.canvas.clientHeight / pose.height);
		this.orbitLens = {
			fx: pose.fx * fit / this.canvas.clientHeight,
			fy: pose.fy * fit / this.canvas.clientHeight
		};
		if (fit > 0) this.fov = 2 * Math.atan(this.canvas.clientHeight / (2 * pose.fy * fit)) / GS_DEG;
	}
	projectSource(model, index) {
		const rect = this.canvas.getBoundingClientRect();
		return gsProjectPosition(Array.from(model.centers.subarray(index * 3, index * 3 + 3), (v, a) => v - this.origin[a]), gsViewSpec(this, rect.width, rect.height));
	}
	dispose() {
		this.fly?.dispose();
		this.stopNavigation();
		document.removeEventListener("visibilitychange", this.onNavVisibility);
		clearTimeout(this.qualityTimer);
		this.diagnosticProbe?.stop();
		this.disposed = true;
		this.sortWorker?.terminate();
		URL.revokeObjectURL(this.workerUrl);
		this.resizeObserver.disconnect();
		for (const [name, fn, options] of this.listeners) this.canvas.removeEventListener(name, fn, options);
		if (this.frame !== null) cancelAnimationFrame(this.frame);
		for (const texture of Object.values(this.textures)) this.gl.deleteTexture(texture);
		this.projectionPass?.dispose();
		this.gl.deleteProgram(this.program);
		this.gl.deleteBuffer(this.cornerBuffer);
	}
	putFloat(texture, width, height, data) {
		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
	}
	sort(forceSync = false) {
		if (this.sortWorker && !forceSync) {
			if (this.sortBusy) return;
			this.sortBusy = true;
			this.diagnosticSortStart = performance.now();
			this.sortWorker.postMessage({
				type: "sort",
				generation: this.generation,
				forward: this.basis()[2]
			});
			return;
		}
		const count = this.count;
		if (!count || !this.packed) return;
		if (!this.sortKeys || this.sortKeys.length !== count) {
			this.sortKeys = new Uint32Array(count);
			this.sortOrder = new Uint32Array(count);
			this.sortTemp = new Uint32Array(count);
		}
		const [, , forward] = this.basis(), target = this.target, centers = this.packed.centers;
		for (let index = 0; index < count; index += 1) {
			const depth = (centers[index * 3] - target[0]) * forward[0] + (centers[index * 3 + 1] - target[1]) * forward[1] + (centers[index * 3 + 2] - target[2]) * forward[2];
			this.sortKeys[index] = gsFloatSortKey(depth);
			this.sortOrder[index] = index;
		}
		gsRadixSort(this.sortKeys, this.sortOrder, this.sortTemp);
		this.uploadOrder(this.sortOrder.subarray(0, count));
		this.sortedReady = true;
		this.sortForward = forward;
		this.sortTarget = [...target];
		this.sortDirty = false;
	}
	needsSort() {
		if (this.sortDirty || !this.sortForward) return true;
		const [, , forward] = this.basis();
		return GS_DOT(forward, this.sortForward) < (this.interacting ? .999 : .999999);
	}
	requestRender() {
		if (this.frame !== null || this.disposed) return;
		const requested = performance.now();
		this.frame = requestAnimationFrame(() => {
			this.frame = null;
			this.diagnosticProbe?.raf(performance.now() - requested);
			this.render();
		});
	}
	render() {
		if (this.disposed || this.contextLost || !this.gl || !this.exportTarget && globalThis.document?.hidden) return;
		if (this.frame !== null) {
			cancelAnimationFrame(this.frame);
			this.frame = null;
		}
		const frameStarted = performance.now();
		this.diagnosticProbe?.motion(frameStarted);
		if (!this.exportTarget && this.navigation.active) {
			this.applyNavigation(this.navigation.step(performance.now()));
			if (this.navigation.active) this.requestRender();
		}
		const gl = this.gl, canvas = this.canvas, rect = this.viewportSize || canvas.getBoundingClientRect();
		const phases = {}, mark = () => performance.now();
		let phaseStart = frameStarted;
		const specNow = gsViewSpec(this, rect.width, rect.height);
		const signature = [
			...specNow.eye,
			...specNow.basis.flat(),
			specNow.fx,
			specNow.fy,
			this.camera.zoom,
			...this.camera.pan
		];
		const changed = this.qualityPose && signature.some((n, i) => Math.abs(n - this.qualityPose[i]) > 1e-9);
		if (!this.exportTarget) {
			this.qualityPose = signature;
			if (changed) {
				this.motionUntil = frameStarted + 450;
				clearTimeout(this.qualityTimer);
				this.qualityTimer = setTimeout(() => this.requestRender(), 470);
			}
		}
		const moving = !this.exportTarget && frameStarted < (this.motionUntil || 0);
		const quality = gsFrameQuality({
			pixelRatio: this.pixelRatioLimit || 2,
			devicePixelRatio: globalThis.devicePixelRatio || 1,
			moving,
			interactionScale: this.interactionScale ?? 1,
			interactionDegree: this.interactionDegree ?? 3,
			degree: this.gauss.shDegree,
			exporting: Boolean(this.exportTarget)
		});
		this.effectiveQuality = {
			...quality,
			moving
		};
		const dpr = this.exportTarget?.scale || quality.dpr;
		const width = this.exportTarget?.width || Math.max(1, Math.round(rect.width * dpr));
		const height = this.exportTarget?.height || Math.max(1, Math.round(rect.height * dpr));
		phases.cameraAndLayout = mark() - phaseStart;
		phaseStart = mark();
		if (!this.exportTarget && (canvas.width !== width || canvas.height !== height)) {
			canvas.width = width;
			canvas.height = height;
			this.diagnosticProbe?.resize();
		}
		phases.resize = mark() - phaseStart;
		phaseStart = mark();
		gl.viewport(0, 0, width, height);
		const clear = this.exportTarget?.transparent ? [
			0,
			0,
			0,
			0
		] : GS_BACKGROUNDS[this.gauss.background];
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		if (this.count && this.packed && this.needsSort()) {
			this.sort(Boolean(this.exportTarget));
			if (!this.sortedReady) return;
		}
		gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
		gl.clear(gl.COLOR_BUFFER_BIT);
		if (this.count && this.packed) {
			const spec = gsViewSpec(this, width, height);
			if ((this.pointPreview || this.gpuProjection === false) && this.projectionPass?.count) this.projectionPass.release();
			let useProjected = false;
			if (!this.pointPreview && this.gpuProjection === true) this.ensureProjectionPass();
			if (!this.pointPreview && this.gpuProjection !== false && this.projectionPass && this.projectionBlockedCount !== this.count) try {
				useProjected = this.projectionPass.prepare(this.count);
				if (!useProjected) {
					this.projectionFallback = "Projection buffer capacity/allocation limit";
					this.projectionBlockedCount = this.count;
				}
			} catch (error) {
				this.projectionFallback = "GPU projection allocation failed";
				this.projectionBlockedCount = this.count;
			}
			this.activePipeline = useProjected ? "project-once" : "direct";
			if (useProjected) this.projectionFallback = null;
			const [right, up, forward] = spec.basis, loc = useProjected ? this.projectLocations : this.locations;
			gl.useProgram(useProjected ? this.projectionPass.project : this.program);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuffer);
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
			gl.vertexAttribDivisor(0, 0);
			const bind = (unit, name) => {
				gl.activeTexture(gl.TEXTURE0 + unit);
				gl.bindTexture(gl.TEXTURE_2D, this.textures[name]);
			};
			bind(0, "order");
			bind(1, "center");
			bind(2, "scale");
			bind(3, "quat");
			bind(4, "dc");
			bind(5, "rest");
			bind(6, "flags");
			gl.uniform1i(loc.uOrder, 0);
			gl.uniform1i(loc.uCenter, 1);
			gl.uniform1i(loc.uScale, 2);
			gl.uniform1i(loc.uQuat, 3);
			gl.uniform1i(loc.uDc, 4);
			gl.uniform1i(loc.uRest, 5);
			gl.uniform1i(loc.uFlags, 6);
			gl.uniform3fv(loc.uEye, spec.eye);
			gl.uniform2f(loc.uFocal, spec.fx, spec.fy);
			gl.uniform1f(loc.uNear, spec.near);
			gl.uniform1i(loc.uPerspective, spec.perspective ? 1 : 0);
			gl.uniform3fv(loc.uRight, right);
			gl.uniform3fv(loc.uUp, up);
			gl.uniform3fv(loc.uView, [
				-forward[0],
				-forward[1],
				-forward[2]
			]);
			gl.uniform3fv(loc.uTarget, this.target);
			gl.uniform2fv(loc.uPan, this.camera.pan);
			gl.uniform2f(loc.uViewport, width, height);
			gl.uniform1f(loc.uBaseHeight, this.baseHeight);
			gl.uniform1f(loc.uZoom, this.camera.zoom);
			gl.uniform1f(loc.uScaleMul, this.gauss.scale);
			gl.uniform1f(loc.uCutoff, this.gauss.opacityCutoff);
			gl.uniform1i(loc.uWidth, this.textureSize.width);
			gl.uniform1i(loc.uRestWidth, this.restSize.width);
			gl.uniform1i(loc.uDegree, this.packed.rest ? quality.degree : 0);
			gl.uniform1i(loc.uPointPreview, this.pointPreview ? 1 : 0);
			gl.uniform1f(loc.uFar, this.viewDistance || 0);
			phases.glPrepare = mark() - phaseStart;
			phaseStart = mark();
			if (!this.exportTarget) this.diagnosticProbe?.begin();
			if (useProjected) this.projectionPass.projectAndDraw(this.count);
			else gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
			if (!this.exportTarget) this.diagnosticProbe?.end();
		}
		if (this.exportTarget) return;
		phaseStart = mark();
		updateSceneGuides(this, rect);
		phases.guides = mark() - phaseStart;
		phaseStart = mark();
		this.onViewChange?.();
		phases.controls = mark() - phaseStart;
		this.diagnosticProbe?.frame(frameStarted, performance.now() - frameStarted, moving, phases);
	}
};
//#endregion
//#region src/gaussian/ply.js
var GS_PLY_TYPES = {
	char: 1,
	uchar: 1,
	int8: 1,
	uint8: 1,
	short: 2,
	ushort: 2,
	int16: 2,
	uint16: 2,
	int: 4,
	uint: 4,
	int32: 4,
	uint32: 4,
	float: 4,
	float32: 4,
	double: 8,
	float64: 8
};
function gsSigmoid(value) {
	if (value >= 0) return 1 / (1 + Math.exp(-value));
	const e = Math.exp(value);
	return e / (1 + e);
}
function gsPlyBytes(buffer) {
	if (buffer instanceof Uint8Array) return buffer;
	if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
	throw Error(t("只支持二进制小端、float 属性的高斯 PLY。"));
}
function gsPlyHeader(bytes) {
	const probe = Math.min(bytes.length, 262144);
	const head = new TextDecoder("latin1").decode(bytes.subarray(0, probe));
	const marker = head.indexOf("end_header");
	if (marker < 0) throw Error(t("只支持二进制小端、float 属性的高斯 PLY。"));
	let end = marker + 10;
	if (head.charCodeAt(end) === 13) end += 1;
	if (head.charCodeAt(end) === 10) end += 1;
	const lines = head.slice(0, marker).split(/\r?\n/);
	if (lines[0]?.trim() !== "ply") throw Error(t("只支持二进制小端、float 属性的高斯 PLY。"));
	if (lines.find((line) => line.startsWith("format "))?.trim() !== "format binary_little_endian 1.0") throw Error(t("只支持二进制小端、float 属性的高斯 PLY。"));
	let count = 0, inVertex = false, stride = 0;
	const fields = /* @__PURE__ */ new Map();
	for (const line of lines) {
		if (line.startsWith("element ")) {
			inVertex = line.startsWith("element vertex ");
			if (!inVertex && Number(line.trim().split(/\s+/)[2]) > 0) throw Error("仅支持高斯 vertex PLY，不支持附加网格元素 / Non-vertex elements are not supported");
			if (inVertex) count = Number(line.slice(15));
			continue;
		}
		if (!inVertex || !line.startsWith("property ")) continue;
		const parts = line.trim().split(/\s+/);
		if (parts[1] === "list") throw Error(t("这个 PLY 不是三维高斯泼溅结果（需要 opacity、scale、rot 和 f_dc）。普通点云请使用点云查看器。"));
		const size = GS_PLY_TYPES[parts[1]];
		if (!size) throw Error(t("只支持二进制小端、float 属性的高斯 PLY。"));
		fields.set(parts[2], {
			offset: stride,
			size,
			type: parts[1]
		});
		stride += size;
	}
	if (!Number.isInteger(count) || count < 0) throw Error(t("高斯 PLY 为空。"));
	return {
		headerEnd: end,
		count,
		stride,
		fields,
		header: head.slice(0, end)
	};
}
function gsPlyFloat(fields, name) {
	const field = fields.get(name);
	if (!field || field.type !== "float" && field.type !== "float32") throw Error(t("这个 PLY 不是三维高斯泼溅结果（需要 opacity、scale、rot 和 f_dc）。普通点云请使用点云查看器。"));
	return field.offset;
}
function gsParseCameras(text) {
	const value = JSON.parse(text);
	if (!Array.isArray(value)) throw Error(t("不是训练相机 JSON（需要 position 数组）。"));
	const cameras = [];
	for (const item of value) {
		if (!item || !Array.isArray(item.position) || item.position.length < 3 || item.position.slice(0, 3).some((number) => !Number.isFinite(Number(number)))) continue;
		cameras.push({
			id: item.id ?? cameras.length,
			name: String(item.img_name || item.id || cameras.length + 1),
			width: Number(item.width) || 0,
			height: Number(item.height) || 0,
			position: item.position.slice(0, 3).map(Number),
			rotation: item.rotation,
			fx: Number(item.fx),
			fy: Number(item.fy)
		});
	}
	if (!cameras.length) throw Error(t("不是训练相机 JSON（需要 position 数组）。"));
	return cameras;
}
/** Parse an Inria-style binary PLY into compact Gaussian arrays. `vertexLimit` is for truncated test buffers. */
async function gsParseGaussianPly(buffer, { includeRest = true, vertexLimit = 0, onProgress = () => {} } = {}) {
	const bytes = gsPlyBytes(buffer);
	const header = gsPlyHeader(bytes);
	const fields = header.fields;
	const x = gsPlyFloat(fields, "x"), y = gsPlyFloat(fields, "y"), z = gsPlyFloat(fields, "z");
	const dc = [
		0,
		1,
		2
	].map((index) => gsPlyFloat(fields, `f_dc_${index}`));
	const opacity = gsPlyFloat(fields, "opacity");
	const scale = [
		0,
		1,
		2
	].map((index) => gsPlyFloat(fields, `scale_${index}`));
	const rot = [
		0,
		1,
		2,
		3
	].map((index) => gsPlyFloat(fields, `rot_${index}`));
	const restOffsets = [];
	for (let index = 0; index < 45; index += 1) {
		const field = fields.get(`f_rest_${index}`);
		if (!field || field.type !== "float" && field.type !== "float32") break;
		restOffsets.push(field.offset);
	}
	const hasRest = restOffsets.length === 45;
	let count = header.count;
	if (vertexLimit > 0) count = Math.min(count, vertexLimit);
	const available = Math.floor((bytes.length - header.headerEnd) / header.stride);
	if (count > available) throw Error(t("高斯 PLY 比文件头声明的更短，文件可能不完整。"));
	if (!count) throw Error(t("高斯 PLY 为空。"));
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const centers = new Float32Array(count * 3), colors = new Float32Array(count * 3), alpha = new Float32Array(count);
	const scales = new Float32Array(count * 3), quat = new Float32Array(count * 4);
	const rest = includeRest && hasRest ? new Float32Array(count * 45) : null;
	const min = [
		Infinity,
		Infinity,
		Infinity
	], max = [
		-Infinity,
		-Infinity,
		-Infinity
	];
	for (let index = 0; index < count; index += 1) {
		const base = header.headerEnd + index * header.stride;
		const position = [
			view.getFloat32(base + x, true),
			view.getFloat32(base + y, true),
			view.getFloat32(base + z, true)
		];
		if (!position.every(Number.isFinite)) throw Error("PLY 包含无效坐标 / Invalid PLY coordinates");
		centers.set(position, index * 3);
		if (position.every(Number.isFinite)) for (let axis = 0; axis < 3; axis += 1) {
			min[axis] = Math.min(min[axis], position[axis]);
			max[axis] = Math.max(max[axis], position[axis]);
		}
		colors[index * 3] = view.getFloat32(base + dc[0], true);
		colors[index * 3 + 1] = view.getFloat32(base + dc[1], true);
		colors[index * 3 + 2] = view.getFloat32(base + dc[2], true);
		alpha[index] = gsSigmoid(view.getFloat32(base + opacity, true));
		for (let axis = 0; axis < 3; axis += 1) {
			const value = Math.exp(view.getFloat32(base + scale[axis], true));
			if (!Number.isFinite(value) || value > 3402823466e29) throw Error("PLY scale exceeds float32 range");
			scales[index * 3 + axis] = value;
		}
		let w = view.getFloat32(base + rot[0], true), qx = view.getFloat32(base + rot[1], true);
		let qy = view.getFloat32(base + rot[2], true), qz = view.getFloat32(base + rot[3], true);
		let length = Math.hypot(w, qx, qy, qz);
		if (!(length > 0)) {
			w = 1;
			qx = qy = qz = 0;
			length = 1;
		}
		quat.set([
			w / length,
			qx / length,
			qy / length,
			qz / length
		], index * 4);
		if (rest) for (let band = 0; band < 45; band += 1) {
			const coefficient = view.getFloat32(base + restOffsets[band], true);
			if (!Number.isFinite(coefficient)) throw Error("PLY contains invalid SH coefficients");
			rest[index * 45 + band] = coefficient;
		}
		if (![
			colors[index * 3],
			colors[index * 3 + 1],
			colors[index * 3 + 2],
			alpha[index],
			scales[index * 3],
			scales[index * 3 + 1],
			scales[index * 3 + 2],
			...quat.subarray(index * 4, index * 4 + 4)
		].every(Number.isFinite)) throw Error("PLY contains non-finite Gaussian attributes");
		if ((index & 32767) === 0) {
			onProgress(index, count);
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	}
	onProgress(count, count);
	if (!min.every(Number.isFinite)) throw Error(t("高斯 PLY 没有有效坐标。"));
	return {
		count,
		sourceCount: header.count,
		centers,
		dc: colors,
		opacity: alpha,
		scale: scales,
		quat,
		rest,
		hasRest,
		bounds: {
			min,
			max
		},
		source: {
			bytes,
			headerEnd: header.headerEnd,
			stride: header.stride,
			header: header.header
		}
	};
}
//#endregion
//#region src/gaussian/preview.js
function gsViewingProfile(mode, mobile = false, software = false) {
	if (mode === "auto") mode = mobile || software ? "balanced" : "full";
	return {
		limit: 0,
		dpr: mode === "full" ? 2 : 1,
		points: mode === "points",
		interactionScale: mode === "full" ? 1 : .65,
		interactionDegree: mode === "full" ? 3 : 1
	};
}
//#endregion
//#region src/gaussian/app.js
async function gsBoot() {
	initializeLocale();
	if (await openNativeGaussianPage()) return;
	if (!isMobileApp() && matchMedia("(pointer: coarse)").matches) {
		const note = document.createElement("p");
		note.className = "presentation-help";
		note.textContent = document.documentElement.lang === "en" ? "For smoother Gaussian viewing on mobile, use the Android App." : "手机上查看三维高斯，推荐使用 Android App。";
		document.querySelector(".viewport").after(note);
	}
	const gs$ = (id) => document.getElementById(id);
	const en = document.documentElement.lang === "en", label = (zh, english) => en ? english : zh;
	const mobileView = isMobileApp() || matchMedia("(pointer: coarse)").matches;
	const profileLabel = document.createElement("label"), profileSelect = document.createElement("select");
	profileSelect.id = "gs-profile";
	profileLabel.textContent = label("查看性能", "Viewing performance");
	profileSelect.setAttribute("aria-label", profileLabel.textContent);
	for (const [value, zh, english] of [
		[
			"auto",
			"自动 · 全量",
			"Auto · all splats"
		],
		[
			"balanced",
			"流畅画质 · 全量",
			"Responsive · all splats"
		],
		[
			"full",
			"精细画质 · 全量",
			"Detailed · all splats"
		],
		[
			"points",
			"中心点显示 · 全量",
			"Centers · all splats"
		]
	]) {
		const o = document.createElement("option");
		o.value = value;
		o.textContent = label(zh, english);
		profileSelect.append(o);
	}
	profileLabel.append(profileSelect);
	const controls = gs$("settings-panel-display").querySelector(".render-controls");
	controls.prepend(profileLabel);
	const pipelineLabel = document.createElement("label"), pipelineToggle = document.createElement("input");
	pipelineToggle.type = "checkbox";
	pipelineToggle.checked = false;
	pipelineToggle.id = "gs-gpu-projection";
	pipelineLabel.append(pipelineToggle, document.createTextNode(label("试用投影复用（全量）", "Try projection reuse (all splats)")));
	controls.append(pipelineLabel);
	pipelineToggle.setAttribute("aria-label", label("试用投影复用（全量）", "Try projection reuse (all splats)"));
	pipelineLabel.title = label("不同 GPU 效果不同，可开关对比；两种方式都保留全部高斯。", "Results vary by GPU. Compare on/off; both retain all splats.");
	pipelineToggle.onchange = () => {
		if (gsViewer) {
			gsViewer.gpuProjection = pipelineToggle.checked;
			gsViewer.projectionBlockedCount = null;
			gsViewer.requestRender();
		}
	};
	const performanceNote = document.createElement("p");
	performanceNote.className = "presentation-help";
	performanceNote.textContent = label("始终保留全部高斯。交互降质仅降低像素与颜色阶数，停止移动后恢复；不会抽稀。截图导出使用设定的完整颜色。", "All splats are retained. Interaction quality changes pixels and color bands only, restoring after motion stops. Image export uses the selected full color quality.");
	profileLabel.after(performanceNote);
	const qualityField = (id, zh, eng, type, min, max, step, value) => {
		const labelEl = document.createElement("label");
		labelEl.textContent = label(zh, eng);
		const input = document.createElement("input");
		input.id = id;
		input.type = type;
		if (min != null) {
			input.min = min;
			input.max = max;
			input.step = step;
		}
		input.value = value;
		input.setAttribute("aria-label", label(zh, eng));
		labelEl.append(input);
		controls.append(labelEl);
		return input;
	};
	const resolution = qualityField("gs-resolution", "渲染像素倍率", "Render pixel ratio", "range", .5, 2, .25, 1), resolutionValue = document.createElement("output");
	resolution.after(resolutionValue);
	const interaction = qualityField("gs-interaction-quality", "移动时降低画质", "Reduce quality during motion", "checkbox", null, null, null, "on");
	const motionLabel = document.createElement("label");
	motionLabel.textContent = label("移动时颜色阶数", "Color bands during motion");
	const motionDegree = document.createElement("select");
	motionDegree.id = "gs-motion-sh";
	motionDegree.setAttribute("aria-label", motionLabel.textContent);
	for (const n of [
		0,
		1,
		2,
		3
	]) {
		const o = document.createElement("option");
		o.value = n;
		o.textContent = String(n);
		motionDegree.append(o);
	}
	motionLabel.append(motionDegree);
	controls.append(motionLabel);
	const profile = () => gsViewingProfile(profileSelect.value, mobileView, gsViewer?.softwareRendering);
	function applyQuality() {
		if (!gsViewer) return;
		gsViewer.gpuProjection = pipelineToggle.checked;
		gsViewer.pixelRatioLimit = Number(resolution.value);
		gsViewer.interactionScale = interaction.checked ? .65 : 1;
		gsViewer.interactionDegree = interaction.checked ? Number(motionDegree.value) : 3;
		gsViewer.pointPreview = profile().points;
		resolutionValue.value = Number(resolution.value).toFixed(2) + "×";
		motionDegree.disabled = !interaction.checked;
		gsViewer.requestRender();
	}
	function presetQuality() {
		const q = profile();
		resolution.value = q.dpr;
		interaction.checked = q.interactionScale < 1;
		motionDegree.value = q.interactionDegree;
		applyQuality();
	}
	resolution.oninput = interaction.onchange = motionDegree.onchange = applyQuality;
	const initialQuality = gsViewingProfile("auto", mobileView);
	resolution.value = initialQuality.dpr;
	interaction.checked = initialQuality.interactionScale < 1;
	motionDegree.value = initialQuality.interactionDegree;
	const gsProject = new ViewerProject();
	const gsEntries = [], gsSelected = /* @__PURE__ */ new Set(), gsCatalogs = [];
	let nativeSession = null, preservedWebCamera = null, editRevision = 0, knownIds = [];
	const nativeApp = isMobileApp();
	let gsEditor = null, gsViewer = null, gsCameraControls = null, gsSerial = 0, gsMode = "multiple";
	const gsAccept = (name) => /\.(ply|json|zip)$/i.test(name);
	const gsBytes = (bytes) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
	const gsSay = (message) => {
		const note = gs$("data-notes");
		note.textContent = message || "";
	};
	const gsError = (message) => {
		const box = gs$("error");
		box.hidden = !message;
		box.querySelector("span").textContent = message || "";
	};
	const gsLoading = (message, fraction = null) => {
		const box = gs$("loading");
		box.hidden = !message;
		if (message) box.querySelector("span").textContent = message;
		let progress = box.querySelector("progress");
		if (!progress) {
			progress = document.createElement("progress");
			progress.max = 1;
			progress.setAttribute("aria-label", label("文件解析进度", "File parsing progress"));
			box.append(progress);
		}
		const known = Number.isFinite(fraction);
		progress.hidden = !known;
		box.classList.toggle("has-progress", known);
		if (known) progress.value = Math.max(0, Math.min(1, fraction));
	};
	const distanceLabel = document.createElement("label"), distanceToggle = document.createElement("input"), distanceRange = document.createElement("input"), distanceValue = document.createElement("output");
	distanceToggle.type = "checkbox";
	distanceToggle.id = "gs-distance-enabled";
	distanceToggle.setAttribute("aria-label", label("限制视距", "Limit viewing distance"));
	distanceRange.type = "range";
	distanceRange.id = "gs-distance";
	distanceRange.min = .25;
	distanceRange.max = 10;
	distanceRange.step = .05;
	distanceRange.value = 3;
	distanceRange.disabled = true;
	distanceRange.setAttribute("aria-label", label("视距范围", "Viewing distance"));
	distanceLabel.append(distanceToggle, document.createTextNode(label("限制视距", "Limit viewing distance")), distanceRange, distanceValue);
	gs$("settings-panel-display").querySelector(".render-controls").append(distanceLabel);
	const distanceHint = document.createElement("p");
	distanceHint.className = "presentation-help";
	distanceHint.textContent = label("默认不裁切。视距以相机为中心，远处逐渐淡出；若看不到模型，请增大距离或关闭。只影响显示。", "No clipping by default. Distant splats fade out around the camera. Increase the distance or disable if the model disappears. Display only.");
	distanceLabel.after(distanceHint);
	function updateDistance() {
		const bounds = gsViewer?.bounds, extent = bounds ? Math.hypot(...bounds[0].map((v, i) => bounds[1][i] - v)) : 1;
		const distance = Math.max(.001, extent) * Number(distanceRange.value);
		distanceRange.disabled = !distanceToggle.checked;
		distanceValue.value = distanceToggle.checked ? distance.toFixed(2) + label(" 坐标单位", " coordinate units") : label("不限", "Unlimited");
		if (gsViewer) {
			gsViewer.viewDistance = distanceToggle.checked ? distance : 0;
			gsViewer.requestRender();
		}
	}
	distanceToggle.onchange = distanceRange.oninput = updateDistance;
	updateDistance();
	function gsCatalogFor(entry) {
		const dir = (entry.path || "").split("/").slice(0, -1).join("/");
		let best = null, bestLength = -1;
		for (const catalog of gsCatalogs) {
			const catalogDir = catalog.path.split("/").slice(0, -1).join("/");
			if (catalogDir === "" || dir === catalogDir || dir.startsWith(`${catalogDir}/`)) {
				if (catalogDir.length >= bestLength) {
					best = catalog;
					bestLength = catalogDir.length;
				}
			}
		}
		return best;
	}
	function gsList() {
		const query = gs$("search").value;
		const matched = gsEntries.filter((entry) => gsProject.matches(entry, query));
		gs$("filter-count").textContent = t("匹配 {0} 项 · 已勾选 {1}", [matched.length, gsSelected.size]);
		gs$("item-count").textContent = t("共 {0} 项", [gsEntries.length]);
		gs$("select-all-splats").disabled = gsMode !== "multiple" || !matched.length;
		gs$("invert-splat-selection").disabled = gsMode !== "multiple" || !matched.length;
		gs$("gs-mode").value = gsMode;
		gsTree?.render();
		gsRefreshCameras();
	}
	function gsRefreshCameras() {
		const select = gs$("gs-camera"), previous = select.value, catalogs = [];
		for (const entry of gsSelected) {
			const catalog = gsCatalogFor(entry);
			if (catalog && !catalogs.includes(catalog)) catalogs.push(catalog);
		}
		select.replaceChildren();
		const empty = document.createElement("option");
		empty.value = "";
		empty.textContent = t("不使用训练相机");
		select.append(empty);
		catalogs.forEach((catalog, catalogIndex) => catalog.cameras.forEach((camera, index) => {
			const option = document.createElement("option");
			option.value = `${catalogIndex}:${index}`;
			option.textContent = camera.name;
			select.append(option);
		}));
		select.dataset.catalogs = String(catalogs.length);
		select.disabled = catalogs.length === 0;
		select._catalogs = catalogs;
		if ([...select.options].some((option) => option.value === previous)) select.value = previous;
		else select.value = "";
		gs$("gs-camera-note").textContent = catalogs.length ? t("已记录 {0} 个训练相机。使用完整旋转、位置和焦距。", [catalogs.reduce((sum, catalog) => sum + catalog.cameras.length, 0)]) : t("把 cameras.json 和 point_cloud.ply 一起导入后，可以跳到训练机位。");
	}
	async function gsApply({ preserveView = gsCameraControls?.preserveView ?? true } = {}) {
		const serial = ++gsSerial;
		const selected = [...gsSelected];
		if (!selected.length) {
			gsLoading("");
			gs$("empty-state").hidden = false;
			gs$("screenshot").disabled = true;
			setNameSummary(gs$("current-title"), [], t("未选择数据"));
			gs$("scene-stats").textContent = t("从左侧选择要查看的数据");
			gs$("geometry-note").textContent = t("未选择数据时保持空白");
			gsViewer?.clearSplats();
			gsEditor?.setLoading(false);
			gsEditor?.sceneChanged();
			gsList();
			return;
		}
		gsLoading(t("正在读取文件…"));
		const batchProgress = createBatchProgress(gs$("loading"), {
			total: selected.length,
			unit: "个高斯文件",
			current: () => serial === gsSerial
		});
		gs$("empty-state").hidden = true;
		gsError("");
		const degree = Number(gs$("gs-sh").value);
		gs$("gs-sh").disabled = false;
		gsEditor?.setLoading(true);
		const models = [];
		let missingRest = false;
		try {
			for (const entry of selected) {
				if (serial !== gsSerial) return;
				if (!entry.parsed || entry.parsed.preview) {
					if (entry.parsed && !entry.parsed.preview) {
						entry.savedFlags = entry.parsed.editFlags;
						gsEditor?.edits.releaseGeometry(entry.parsed);
					}
					const parsed = await gsParseGaussianPly(await entry.file.arrayBuffer(), { includeRest: true });
					if (serial !== gsSerial) return;
					if (entry.savedFlags) {
						if (entry.savedFlags.length !== parsed.sourceCount) throw Error("Gaussian snapshot does not match source");
						parsed.editFlags = parsed.preview ? Uint8Array.from({ length: parsed.count }, (_, i) => entry.savedFlags[i * parsed.sampleStep]) : entry.savedFlags;
					}
					entry.parsed = parsed;
				}
				if (!entry.parsed.hasRest) missingRest = true;
				entry.parsed.name = entry.treeName || entry.file.name;
				gsEditor?.edits.attach(entry.parsed);
				models.push(entry.parsed);
				batchProgress.report(models.length);
			}
			if (serial !== gsSerial) return;
			batchProgress.prepare();
			const useDegree = degree;
			applyQuality();
			gsViewer.setModels(models, {
				preserveView,
				maxSplats: 0,
				shDegree: 3
			});
			updateDistance();
			gsEditor?.sceneChanged();
			gsViewer.setGaussianOptions({
				scale: Number(gs$("gs-scale").value),
				opacityCutoff: Number(gs$("gs-cutoff").value) / 100,
				background: gs$("gs-background").value,
				shDegree: useDegree
			});
			const shown = gsViewer.count, source = gsViewer.pointCount;
			setNameSummary(gs$("current-title"), selected.map((entry) => entry.treeName || entry.id));
			gs$("scene-stats").textContent = t("已显示 {0} / {1} 个高斯", [shown.toLocaleString("zh-CN"), source.toLocaleString("zh-CN")]);
			gs$("geometry-note").textContent = t("原始尺度 · 可撤销编辑 · 本地处理");
			gs$("screenshot").disabled = false;
			gsLoading("");
			gsSay(missingRest ? t("此文件没有球谐系数，已保持 0 阶。") : "");
		} catch (error) {
			if (serial !== gsSerial) return;
			gsLoading("");
			gsError(error.message);
			gs$("screenshot").disabled = !gsViewer?.count;
		}
		if (serial === gsSerial) gsEditor?.setLoading(false);
		gsList();
	}
	function gsToggle(entry) {
		if (gsMode === "single") {
			if (gsSelected.has(entry)) gsSelected.delete(entry);
			else {
				gsSelected.clear();
				gsSelected.add(entry);
			}
		} else if (gsSelected.has(entry)) gsSelected.delete(entry);
		else gsSelected.add(entry);
		gsApply();
	}
	const gsTree = mountProjectTree({
		project: gsProject,
		container: gs$("splat-list"),
		root: gs$("project-root"),
		controls: gs$("project-controls"),
		getEntries: () => gsEntries,
		getSelected: () => gsSelected,
		getMode: () => gsMode,
		getQuery: () => gs$("search").value,
		onToggle: gsToggle,
		onChange: gsList,
		selectionHint: "勾选后显示高斯",
		detail: (entry) => entry.parsed ? t("{0} 个高斯", [entry.parsed.sourceCount.toLocaleString("zh-CN")]) : gsBytes(entry.file.size),
		onRemove: (removed) => {
			for (const entry of removed) {
				gsSelected.delete(entry);
				const index = gsEntries.indexOf(entry);
				if (index >= 0) gsEntries.splice(index, 1);
			}
			gsApply();
		},
		onVisibility: (members, checked) => {
			if (gsMode === "single") {
				gsSelected.clear();
				if (checked && members.length === 1) gsSelected.add(members[0]);
			} else for (const entry of members) checked ? gsSelected.add(entry) : gsSelected.delete(entry);
			gsApply();
		},
		onGroupSelection: (members, checked) => {
			if (gsMode !== "multiple") return;
			for (const entry of members) checked ? gsSelected.add(entry) : gsSelected.delete(entry);
			gsApply();
		}
	});
	async function gsReceive(records) {
		const keys = new Set(gsEntries.map((entry) => entry.key)), names = new Set(gsEntries.map((entry) => entry.id));
		const cameraKeys = new Set(gsCatalogs.map((catalog) => catalog.key));
		let added = 0, duplicates = 0, camerasAdded = 0;
		const warnings = [];
		for (const record of records) {
			const path = (record.path || record.file.webkitRelativePath || record.file.name).replaceAll("\\", "/");
			const key = projectFileKey(record.file, path);
			if (/\.json$/i.test(record.file.name)) {
				if (cameraKeys.has(key)) {
					duplicates += 1;
					continue;
				}
				try {
					const cameras = gsParseCameras(await record.file.text());
					gsCatalogs.push({
						key,
						path,
						cameras
					});
					cameraKeys.add(key);
					camerasAdded += cameras.length;
					added += 1;
				} catch (error) {
					warnings.push(error.message);
				}
				continue;
			}
			if (!/\.ply$/i.test(record.file.name)) continue;
			if (keys.has(key)) {
				duplicates += 1;
				continue;
			}
			const entry = {
				id: projectUniqueId(path.replace(/\.ply$/i, ""), names),
				key,
				file: record.file,
				path
			};
			gsProject.assign(entry, path);
			gsEntries.push(entry);
			keys.add(key);
			added += 1;
		}
		gs$("search").value = "";
		gs$("source-note").textContent = t("文件留在本机 · 分组仅保留在本次页面");
		gsList();
		if (warnings.length) gsSay(warnings.join(" "));
		else if (camerasAdded) gsSay(t("已记录 {0} 个训练相机。使用完整旋转、位置和焦距。", [camerasAdded]));
		if (!added && !gsEntries.length) gsError(t("没有找到高斯 PLY。请选择 point_cloud.ply，或包含它的结果文件夹。"));
		return {
			added,
			duplicates
		};
	}
	const gsImport = archiveImportQueue({
		accepts: (name) => /\.(ply|json)$/i.test(name),
		receive: gsReceive,
		onProgress: (message) => {
			gs$("drop-status").hidden = false;
			gs$("drop-status").textContent = message;
		},
		onError: gsError
	});
	const gsPick = (event) => {
		const records = [...event.target.files].map((file) => ({
			file,
			path: file.webkitRelativePath || file.name
		}));
		event.target.value = "";
		gsImport(records).catch(() => {});
	};
	mountPointDrop({
		zone: gs$("point-drop-zone"),
		status: gs$("drop-status"),
		accepts: gsAccept,
		onFiles: gsImport
	});
	gs$("choose-file").onclick = () => gs$("file-input").click();
	gs$("choose-folder").onclick = () => gs$("folder-input").click();
	gs$("file-input").onchange = gsPick;
	gs$("folder-input").onchange = gsPick;
	gs$("search").oninput = gsList;
	gs$("clear-selection").onclick = () => {
		gsSelected.clear();
		gsApply();
	};
	gs$("select-all-splats").onclick = () => {
		for (const entry of gsEntries.filter((entry) => gsProject.matches(entry, gs$("search").value))) gsSelected.add(entry);
		gsApply();
	};
	gs$("invert-splat-selection").onclick = () => {
		for (const entry of gsEntries.filter((entry) => gsProject.matches(entry, gs$("search").value))) gsSelected.has(entry) ? gsSelected.delete(entry) : gsSelected.add(entry);
		gsApply();
	};
	gs$("gs-mode").onchange = () => {
		gsMode = gs$("gs-mode").value === "single" ? "single" : "multiple";
		if (gsMode === "single" && gsSelected.size > 1) {
			const keep = [...gsSelected].at(-1);
			gsSelected.clear();
			gsSelected.add(keep);
		}
		gsApply({ preserveView: true });
	};
	gs$("dismiss-error").onclick = () => gsError("");
	profileSelect.onchange = presetQuality;
	gs$("gs-sh").onchange = () => gsViewer?.setGaussianOptions({ shDegree: Number(gs$("gs-sh").value) });
	const gsAppearance = () => gsViewer?.setGaussianOptions({
		scale: Number(gs$("gs-scale").value),
		opacityCutoff: Number(gs$("gs-cutoff").value) / 100,
		background: gs$("gs-background").value
	});
	gs$("gs-scale").oninput = () => {
		gs$("gs-scale-value").value = Number(gs$("gs-scale").value).toFixed(2);
		gsAppearance();
	};
	gs$("gs-cutoff").oninput = () => {
		gs$("gs-cutoff-value").value = `${gs$("gs-cutoff").value}%`;
		gsAppearance();
	};
	gs$("gs-background").onchange = gsAppearance;
	gs$("gs-camera").onchange = () => {
		const [catalogIndex, cameraIndex] = gs$("gs-camera").value.split(":").map(Number);
		const camera = gs$("gs-camera")._catalogs?.[catalogIndex]?.cameras[cameraIndex];
		if (!camera || !gsViewer?.bounds) return;
		try {
			gsViewer.applyTraining(camera);
		} catch (error) {
			gsError(error.message);
		}
	};
	gs$("fit-view").onclick = () => gsViewer?.fit();
	gs$("zoom-in").onclick = () => gsViewer?.zoomBy(1.2);
	gs$("zoom-out").onclick = () => gsViewer?.zoomBy(1 / 1.2);
	for (const button of document.querySelectorAll("[data-view]")) button.onclick = () => {
		gsViewer?.setView(button.dataset.view);
		gs$("gs-camera").value = "";
		for (const other of document.querySelectorAll("[data-view]")) {
			const active = other === button;
			other.classList.toggle("active", active);
			other.setAttribute("aria-pressed", String(active));
		}
	};
	document.addEventListener("keydown", (event) => {
		if (![
			"INPUT",
			"SELECT",
			"TEXTAREA"
		].includes(event.target.tagName) && event.key.toLowerCase() === "f") {
			event.preventDefault();
			gsViewer?.fit();
		}
	});
	try {
		gsViewer = new GaussianViewer(gs$("scene"), { onError: gsError });
		applyQuality();
		mountRenderDiagnostics(gsViewer, gs$("settings-panel-display").querySelector(".render-controls"));
		const quickDiagnostic = document.createElement("button");
		quickDiagnostic.type = "button";
		quickDiagnostic.textContent = label("诊断", "Diagnostics");
		quickDiagnostic.onclick = () => gs$("gs-diagnostics").click();
		document.querySelector(".inspector-shortcuts").append(quickDiagnostic);
		gsEditor = mountGaussianEditor({
			loadFull: async () => {
				profileSelect.value = "full";
				await gsApply({ preserveView: true });
			},
			viewer: gsViewer,
			getModels: () => gsViewer.models,
			onError: gsError,
			onStatus: gsSay,
			onChange: () => {
				editRevision++;
				nativeSession?.schedule();
			}
		});
		gsCameraControls = mountGaussianCameraControls({
			viewer: gsViewer,
			onError: gsError
		});
		mountViewerLayout({ getViewers: () => gsViewer ? [gsViewer] : [] });
	} catch (error) {
		gsError(error.message);
	}
	window.addEventListener("beforeunload", (event) => {
		if (!nativeApp && gsEntries.some((e) => gsEntryFlags(e)?.some((flag) => flag & 6))) {
			event.preventDefault();
			event.returnValue = "";
		}
	});
	if (nativeApp && gsViewer) try {
		nativeSession = await openWorkspaceSession({
			tool: "gaussian",
			restore: async ({ state, records, snapshot }) => {
				await gsReceive(records);
				knownIds = [.../* @__PURE__ */ new Set([...state?.tree?.knownIds || [], ...gsEntries.map((e) => e.id)])];
				if (state?.tree) {
					const restored = restoreProjectTree(gsProject, gsEntries, state.tree);
					gsEntries.splice(0, gsEntries.length, ...restored);
				}
				const flags = snapshot ? await gsReadProjectBlob(snapshot) : /* @__PURE__ */ new Map();
				for (const entry of gsEntries) entry.savedFlags = flags.get(entry.id) || null;
				gsMode = state?.mode === "single" ? "single" : "multiple";
				gsSelected.clear();
				for (const id of state?.selected || []) {
					const entry = gsEntries.find((e) => e.id === id);
					if (entry) gsSelected.add(entry);
				}
				preservedWebCamera = state?.camera || null;
				restoreMobileInputs(state?.display);
				await gsApply();
				if (state?.camera && gsViewer.count) applyCameraSnapshot([gsViewer], state.camera, {
					space: "raw-world",
					checkScene: false
				});
				return { snapshotUnchanged: Boolean(snapshot) };
			},
			capture: () => ({
				revision: editRevision,
				blob: () => gsProjectBlob(gsEntries),
				state: {
					schemaVersion: 1,
					tree: {
						...snapshotProjectTree(gsProject, gsEntries),
						knownIds
					},
					selected: [...gsSelected].map((e) => e.id),
					mode: gsMode,
					display: captureMobileInputs(),
					camera: gsViewer.count ? captureCameraSnapshot(gsViewer, { space: "raw-world" }) : preservedWebCamera
				}
			}),
			onStatus: (kind, e) => {
				if (e) gsError(e.message);
				else gs$("source-note").textContent = t(kind === "saved" ? "项目自动保存在此设备" : kind === "dirty" ? "待自动保存" : "保存中…");
			},
			onBackground: () => {
				gsViewer.fly?.leave();
				gsViewer.stopNavigation();
			},
			onForeground: () => gsViewer.requestRender()
		});
		if (nativeSession?.redirecting) return;
		await nativeSession.flush();
		for (const id of ["choose-file", "choose-folder"]) gs$(id).onclick = () => nativeSession.pick().catch((e) => gsError(e.message));
	} catch (e) {
		gsError(e.message);
	}
	gsList();
}
gsBoot();
//#endregion
