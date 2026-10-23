import { a as t, r as localizeHTML } from "./i18n-CQYkw1yO.js";
import { c as appendLegacyWireFiles, p as ViewerProject, s as appendLegacyLodFiles } from "./point-drop-blJQM5I1.js";
import { I as rememberPalettePreferences, L as samplePalette, N as currentPalettePreferences, P as normalizePaletteOptions } from "./camera-controls-kT0RzZel.js";
import { n as readPointCloud, r as samplePointCloud, t as parseWireOBJ } from "./point-io-B3vnI3Pb.js";
//#region src/shared/viewer-comparison.js
/** Camera synchronization shared by Mesh and Wireframe. Call pause during data rebuild/export. */
function copyViewerCamera(source, target) {
	target.navigation?.reset();
	target.camera = {
		...source.camera,
		pan: [...source.camera.pan]
	};
	target.target = [...source.target];
	target.baseHeight = source.baseHeight;
	for (const key of [
		"projection",
		"distance",
		"fov",
		"near"
	]) target[key] = source[key];
	target.flyPose = source.flyPose ? {
		eye: [...source.flyPose.eye],
		basis: source.flyPose.basis.map((v) => [...v])
	} : null;
}
function createViewerComparison(getViewers, isEnabled = () => true) {
	let paused = 0, guard = false;
	const originals = /* @__PURE__ */ new WeakMap();
	const pause = (fn) => {
		paused++;
		try {
			return fn();
		} finally {
			paused--;
		}
	};
	function install(viewer) {
		if (originals.has(viewer)) return;
		const original = viewer.render.bind(viewer);
		originals.set(viewer, original);
		viewer.render = function() {
			const result = original(), all = getViewers();
			if (paused || guard || !isEnabled() || this.flyPose && !this.fly?.active || all.some((v) => v !== this && v.fly?.active)) return result;
			guard = true;
			try {
				for (const other of all) if (other !== viewer) {
					copyViewerCamera(viewer, other);
					(originals.get(other) || other.render.bind(other))();
				}
			} finally {
				guard = false;
			}
			return result;
		};
	}
	return {
		install,
		pause,
		sync(source = getViewers()[0]) {
			if (source) pause(() => {
				for (const v of getViewers()) if (v !== source) {
					copyViewerCamera(source, v);
					v.render();
				}
			});
		}
	};
}
//#endregion
//#region src/shared/object-import-state.js
/** Convert saved virtual tree/selection metadata using exact File identities, never ID guesses. */
function migrateObjectImportState(state, records, entries, kind = "mesh") {
	if (!state || state.objectImportVersion === 2) return state;
	const legacy = [], project = new ViewerProject(), paths = new Map(records.map((record) => [record.file, record.path]));
	(kind === "mesh" ? appendLegacyLodFiles : appendLegacyWireFiles)(legacy, project, records.map((record) => record.file), paths);
	const files = (entry) => entry.files?.length ? entry.files : entry.file ? [entry.file] : [...entry.wires || [], ...entry.clouds || []];
	const byFile = /* @__PURE__ */ new Map();
	for (const entry of entries) for (const file of files(entry)) {
		if (!byFile.has(file)) byFile.set(file, /* @__PURE__ */ new Set());
		byFile.get(file).add(entry);
	}
	const mapping = /* @__PURE__ */ new Map(), related = /* @__PURE__ */ new Map();
	for (const old of legacy) {
		const next = new Set(files(old).flatMap((file) => [...byFile.get(file) || []]));
		mapping.set(old.id, [...next].map((entry) => entry.id));
		for (const entry of next) {
			if (!related.has(entry)) related.set(entry, []);
			related.get(entry).push(old);
		}
	}
	const ids = (values) => [...new Set((values || []).flatMap((id) => mapping.get(id) || [id]))];
	const migrated = {
		...state,
		objectImportVersion: 2,
		selected: ids(state.selected),
		active: ids([state.active]).filter(Boolean).at(-1)
	};
	if (kind === "wire" && migrated.selected.length > 1) migrated.wireMode = "multiple";
	if (kind === "mesh" && !migrated.meshPreference) {
		const last = legacy.find((entry) => entry.id === (state.selected || []).at(-1));
		if (last?.file) migrated.meshPreference = {
			name: last.file.name,
			index: 0
		};
	}
	if (state.tree?.items) {
		const savedGroups = new Map((state.tree.groups || []).map((group) => [group.id, group]));
		const savedPath = (id) => {
			const parts = [], seen = /* @__PURE__ */ new Set();
			for (let group = savedGroups.get(id); group && !seen.has(group.id); group = savedGroups.get(group.parent)) {
				seen.add(group.id);
				parts.unshift(group.name);
			}
			return parts.join("/");
		};
		const groupByPath = new Map([...savedGroups.keys()].map((id) => [savedPath(id), id]));
		const saved = new Map(state.tree.items.map((item) => [item.id, item])), known = new Set(state.tree.knownIds || []), items = [];
		for (const entry of entries) {
			const old = related.get(entry) || [], kept = old.filter((item) => saved.has(item.id));
			if (!kept.length) continue;
			const previous = saved.get(kept[0].id), renamed = previous.treeName !== kept[0].treeName;
			const parentPath = entry.sourceGroup.split("/").slice(0, -1).join("/");
			const originalPath = project.path(kept[0].group);
			const group = savedPath(previous.group) !== originalPath ? previous.group : groupByPath.get(parentPath) || "";
			const excludedFileKeys = kind === "mesh" ? old.filter((item) => known.has(item.id) && !saved.has(item.id)).map((item) => entry.sourceKeys?.get(item.file)).filter(Boolean) : [];
			if (excludedFileKeys.length) entry.excludedFileKeys = excludedFileKeys;
			items.push({
				...previous,
				id: entry.id,
				group,
				treeName: renamed ? previous.treeName : entry.treeName,
				...excludedFileKeys.length ? { excludedFileKeys } : {}
			});
		}
		migrated.tree = {
			...state.tree,
			items,
			knownIds: ids([...known])
		};
	}
	return migrated;
}
//#endregion
//#region src/shared/object-selection.js
/** Common filename preferences and natural, filter-aware ID navigation. */
function objectFilePreference(files, value) {
	const index = value === "" ? -1 : Number(value), file = files[index];
	return file ? {
		name: file.name,
		index
	} : { none: true };
}
function resolveObjectFile(files, preference, fallback = 0, used = /* @__PURE__ */ new Set()) {
	if (preference?.none) return null;
	const candidates = [
		preference?.name == null ? -1 : files.findIndex((file) => file.name.toLowerCase() === preference.name.toLowerCase()),
		preference?.index,
		fallback,
		...files.map((_, index) => index)
	];
	for (const index of candidates) if (Number.isInteger(index) && index >= 0 && files[index] && !used.has(files[index])) return files[index];
	return null;
}
function adjacentObjectEntry(entries, active, direction) {
	if (!entries.length) return null;
	const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id, void 0, { numeric: true }));
	const index = sorted.indexOf(active);
	return sorted[index < 0 ? direction > 0 ? 0 : sorted.length - 1 : Math.max(0, Math.min(sorted.length - 1, index + direction))];
}
function objectNavigationDirection(event, { multiple = false, flying = false } = {}) {
	if (multiple || flying || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return 0;
	if (event.target?.closest?.("input,select,textarea,button,a,[contenteditable]:not([contenteditable=\"false\"]),[role=\"slider\"],[role=\"tab\"],[role=\"dialog\"]")) return 0;
	return event.key === "ArrowLeft" || event.key === "[" ? -1 : event.key === "ArrowRight" || event.key === "]" ? 1 : 0;
}
//#endregion
//#region src/cloud/cloud-cache.js
function cloudCacheAbort(reason) {
	return reason instanceof Error ? reason : new DOMException(t("点云读取已取消"), "AbortError");
}
function cloudCacheSupports(available, requested) {
	return available === 0 || requested > 0 && available >= requested;
}
var CloudFileCache = class {
	constructor({ budget = 268435456, readCloud = readPointCloud, readWire = async (file) => parseWireOBJ(await file.text(), file.name) } = {}) {
		this.budget = budget;
		this.readCloud = readCloud;
		this.readWire = readWire;
		this.records = /* @__PURE__ */ new Map();
		this.pending = /* @__PURE__ */ new Map();
		this.active = /* @__PURE__ */ new Set();
		this.stats = {
			reads: 0,
			hits: 0
		};
	}
	setActive(files) {
		this.active = new Set(files.filter(Boolean));
		for (const task of [...this.pending.values()]) if (!this.active.has(task.file)) this.cancelTask(task);
		this.trim();
	}
	clear() {
		this.active.clear();
		for (const task of [...this.pending.values()]) this.cancelTask(task);
		this.records.clear();
	}
	forget(file) {
		this.active.delete(file);
		const pending = this.pending.get(file);
		if (pending) this.cancelTask(pending);
		this.records.delete(file);
	}
	bytes(value) {
		const buffers = /* @__PURE__ */ new Set();
		for (const array of [
			value.positions,
			value.rgb,
			value.sampleIndices,
			...Object.values(value.fields || {})
		]) if (array?.buffer) buffers.add(array.buffer);
		return [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0) + (value.vertices?.length || 0) * 24 + (value.edges?.length || 0) * 16 + (value.faces?.length || 0) * 24;
	}
	trim() {
		let total = [...this.records.values()].reduce((sum, record) => sum + record.bytes, 0);
		for (const [file, record] of this.records) {
			if (total <= this.budget && this.records.size <= 64) break;
			if (this.active.has(file)) continue;
			this.records.delete(file);
			total -= record.bytes;
		}
	}
	view(record, maxPoints) {
		let result = record.value;
		if (record.kind === "cloud" && maxPoints > 0 && maxPoints < result.count) {
			if (!record.views.has(maxPoints)) {
				record.views.clear();
				record.views.set(maxPoints, samplePointCloud(result, maxPoints));
				record.bytes = this.bytes(record.value) + this.bytes(record.views.get(maxPoints));
			}
			result = record.views.get(maxPoints);
		}
		return result;
	}
	stopIfUnowned(task) {
		if (!task.done && !task.subscribers.size && !this.active.has(task.file)) this.cancelTask(task);
	}
	settle(subscriber, error, value) {
		if (subscriber.done) return;
		subscriber.done = true;
		subscriber.signal?.removeEventListener("abort", subscriber.onAbort);
		subscriber.task.subscribers.delete(subscriber);
		if (error) subscriber.reject(error);
		else subscriber.resolve(value);
		this.stopIfUnowned(subscriber.task);
	}
	cancelTask(task, { transfer = false } = {}) {
		if (task.done) return [];
		task.done = true;
		if (this.pending.get(task.file) === task) this.pending.delete(task.file);
		const subscribers = [...task.subscribers];
		if (transfer) task.subscribers.clear();
		task.controller.abort();
		if (!transfer) for (const subscriber of subscribers) this.settle(subscriber, cloudCacheAbort());
		return transfer ? subscribers : [];
	}
	notify(task, progress) {
		if (task.done || task.controller.signal.aborted) return;
		task.progress = progress;
		for (const subscriber of [...task.subscribers]) {
			if (subscriber.done || subscriber.signal?.aborted) continue;
			try {
				subscriber.onProgress?.(progress);
			} catch (error) {
				this.settle(subscriber, error);
			}
		}
	}
	start(file, kind, maxPoints, transferred = []) {
		const task = {
			file,
			kind,
			limit: maxPoints,
			controller: new AbortController(),
			subscribers: /* @__PURE__ */ new Set(),
			progress: null,
			done: false,
			promise: null
		};
		for (const subscriber of transferred) {
			if (subscriber.done) continue;
			subscriber.task = task;
			task.subscribers.add(subscriber);
		}
		this.pending.set(file, task);
		this.stats.reads++;
		task.promise = Promise.resolve().then(() => {
			if (task.controller.signal.aborted) throw cloudCacheAbort();
			const readOptions = {
				maxPoints,
				signal: task.controller.signal,
				onProgress: (event) => this.notify(task, event)
			};
			return kind === "cloud" ? this.readCloud(file, readOptions) : this.readWire(file, readOptions);
		}).then((value) => {
			if (task.done || task.controller.signal.aborted || this.pending.get(file) !== task) throw cloudCacheAbort();
			const record = {
				kind,
				value,
				limit: maxPoints,
				bytes: this.bytes(value),
				views: /* @__PURE__ */ new Map()
			};
			this.records.delete(file);
			this.records.set(file, record);
			this.pending.delete(file);
			task.done = true;
			for (const subscriber of [...task.subscribers]) if (subscriber.signal?.aborted) this.settle(subscriber, cloudCacheAbort(subscriber.signal.reason));
			else try {
				this.settle(subscriber, null, this.view(record, subscriber.maxPoints));
			} catch (error) {
				this.settle(subscriber, error);
			}
			this.trim();
			return record;
		}).catch((error) => {
			if (!task.done) {
				task.done = true;
				if (this.pending.get(file) === task) this.pending.delete(file);
				for (const subscriber of [...task.subscribers]) this.settle(subscriber, error);
			}
			throw error;
		});
		task.promise.catch(() => {});
		return task;
	}
	subscribe(task, { maxPoints, signal, onProgress }) {
		return new Promise((resolve, reject) => {
			const subscriber = {
				task,
				maxPoints,
				signal,
				onProgress,
				resolve,
				reject,
				done: false,
				onAbort: null
			};
			subscriber.onAbort = () => this.settle(subscriber, cloudCacheAbort(signal?.reason));
			task.subscribers.add(subscriber);
			signal?.addEventListener("abort", subscriber.onAbort, { once: true });
			if (signal?.aborted) subscriber.onAbort();
			else if (task.progress !== null && onProgress) try {
				onProgress(task.progress);
			} catch (error) {
				this.settle(subscriber, error);
			}
		});
	}
	async read(file, kind, { maxPoints = 0, signal, onProgress } = {}) {
		if (!file) return null;
		if (signal?.aborted) throw cloudCacheAbort(signal.reason);
		if (!Number.isSafeInteger(maxPoints) || maxPoints < 0) throw Error(t("maxPoints 必须为非负整数；0 表示全量"));
		const record = this.records.get(file);
		if (record && record.kind === kind && (kind === "wire" || record.value.count === record.value.totalCount || cloudCacheSupports(record.limit, maxPoints))) {
			this.stats.hits++;
			this.records.delete(file);
			this.records.set(file, record);
			const result = this.view(record, maxPoints);
			this.trim();
			return result;
		}
		let task = this.pending.get(file);
		if (task && task.kind === kind && (kind === "wire" || cloudCacheSupports(task.limit, maxPoints))) this.stats.hits++;
		else {
			const transferred = task ? this.cancelTask(task, { transfer: task.kind === kind }) : [];
			task = this.start(file, kind, maxPoints, transferred);
		}
		return this.subscribe(task, {
			maxPoints,
			signal,
			onProgress
		});
	}
};
//#endregion
//#region src/shared/palette-controls.js
function paletteGradient(palette = "current", reverse = false) {
	return `linear-gradient(to right,${Array.from({ length: 17 }, (_, i) => `rgb(${samplePalette(i / 16, palette, reverse).map((v) => Math.round(v * 255)).join(",")}) ${i / 16 * 100}%`).join(",")})`;
}
function mountPaletteControls({ container, onChange = () => {}, getOptions = () => ({}) }) {
	let initial;
	try {
		initial = normalizePaletteOptions({
			...currentPalettePreferences(),
			...getOptions()
		});
	} catch {
		initial = currentPalettePreferences();
	}
	const details = container.ownerDocument.createElement("details");
	details.className = "palette-panel viewer-control-panel";
	details.innerHTML = localizeHTML(`<summary><span>配色方案</span><i class="palette-preview" aria-hidden="true"></i><small class="palette-caption"></small></summary>
    <div class="palette-body"><label>色带<select aria-label="色带方案"><option value="current">蓝 → 绿 → 黄 → 红</option><option value="viridis">Viridis · 蓝紫 → 绿 → 黄</option><option value="inferno">Inferno · 黑紫 → 橙 → 黄</option><option value="grayscale">灰度 · 黑 → 白</option><option value="blue-white-red">蓝 → 白 → 红</option></select></label>
    <label class="check-label"><input class="palette-reverse" type="checkbox">反转色带</label>
    <label class="check-label"><input class="palette-auto" type="checkbox" checked>自动数值范围</label>
    <label>最小值<input class="palette-min" type="number" step="any" aria-label="色带最小值" disabled></label>
    <label>最大值<input class="palette-max" type="number" step="any" aria-label="色带最大值" disabled></label>
    <p class="palette-help">高度与数值属性使用色带；固定范围可让不同文件的相同数值对应相同颜色。</p><p class="palette-error" role="alert" hidden></p></div>`);
	container.append(details);
	const select = details.querySelector("select"), reverse = details.querySelector(".palette-reverse"), auto = details.querySelector(".palette-auto");
	const low = details.querySelector(".palette-min"), high = details.querySelector(".palette-max"), message = details.querySelector(".palette-error");
	let state = initial, enabled = true;
	select.value = state.palette;
	reverse.checked = state.reverse;
	if (state.range) {
		auto.checked = false;
		low.value = state.range.min;
		high.value = state.range.max;
	}
	const refresh = () => {
		details.querySelector(".palette-preview").style.background = paletteGradient(state.palette, state.reverse);
		details.querySelector(".palette-caption").textContent = enabled ? `${select.selectedOptions[0].textContent.split(" · ")[0]}${state.reverse ? t(" · 反转") : ""}` : t("选择高度或数值属性后启用");
		select.disabled = reverse.disabled = auto.disabled = !enabled;
		low.disabled = high.disabled = !enabled || auto.checked;
	};
	const restoreInputs = () => {
		select.value = state.palette;
		reverse.checked = state.reverse;
		auto.checked = !state.range;
		if (state.range) {
			low.value = state.range.min;
			high.value = state.range.max;
		}
	};
	const change = () => {
		low.disabled = high.disabled = auto.checked || !enabled;
		if (!auto.checked && (low.value === "" || high.value === "" || !Number.isFinite(low.valueAsNumber) || !Number.isFinite(high.valueAsNumber) || low.valueAsNumber >= high.valueAsNumber)) {
			message.textContent = t("请输入有效范围，最小值必须小于最大值。");
			message.hidden = false;
			return;
		}
		const previous = state;
		try {
			state = normalizePaletteOptions({
				palette: select.value,
				reverse: reverse.checked,
				range: auto.checked ? null : {
					min: low.valueAsNumber,
					max: high.valueAsNumber
				}
			});
			onChange(normalizePaletteOptions(state));
			rememberPalettePreferences(state);
			message.hidden = true;
			refresh();
		} catch (error) {
			state = previous;
			restoreInputs();
			try {
				onChange(normalizePaletteOptions(previous));
			} catch {}
			refresh();
			message.textContent = error.message;
			message.hidden = false;
		}
	};
	[
		select,
		reverse,
		auto,
		low,
		high
	].forEach((input, index) => {
		input.dataset.mobileKey = "palette:" + index;
	});
	for (const input of [
		select,
		reverse,
		auto,
		low,
		high
	]) input.addEventListener("change", change);
	for (const input of [low, high]) input.addEventListener("input", change);
	refresh();
	return {
		getOptions: () => normalizePaletteOptions(state),
		setScalarEnabled(value) {
			enabled = !!value;
			refresh();
		},
		setDataRange(range) {
			if (auto.checked && range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.min <= range.max) {
				low.value = range.min;
				high.value = range.max === range.min ? range.min + 1 : range.max;
			}
		},
		destroy() {
			details.remove();
		}
	};
}
//#endregion
export { objectFilePreference as a, migrateObjectImportState as c, adjacentObjectEntry as i, createViewerComparison as l, paletteGradient as n, objectNavigationDirection as o, CloudFileCache as r, resolveObjectFile as s, mountPaletteControls as t };
