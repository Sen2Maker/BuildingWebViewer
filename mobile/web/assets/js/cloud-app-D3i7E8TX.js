import { a as objectFilePreference, c as migrateObjectImportState, i as adjacentObjectEntry, l as createViewerComparison, n as paletteGradient, o as objectNavigationDirection, r as CloudFileCache, s as resolveObjectFile, t as mountPaletteControls } from "./palette-controls-DzRnLWzq.js";
import { a as t, n as initializeLocale, r as localizeHTML } from "./i18n-CQYkw1yO.js";
import { a as setNameSummary, i as compactNames, n as mountProjectTree, o as createBatchProgress, p as ViewerProject, r as archiveImportQueue, t as mountPointDrop, u as appendWireFiles } from "./point-drop-blJQM5I1.js";
import { N as currentPalettePreferences, d as mountViewerLayout, r as mountCameraControls } from "./camera-controls-kT0RzZel.js";
import { c as restoreMobileInputs, l as restoreProjectTree, n as captureMobileInputs, o as mountMobileProject, r as isMobileApp, s as nativeExportWriter, t as NativeProjectFile, u as snapshotProjectTree } from "./mobile-project-DIn9Vanq.js";
import { a as pointExportSchema, c as defaultPointSettings, i as mountCloudColors, l as pointFieldStats, n as genTakeHandoff, o as writePointExport, r as CloudViewer, s as POINT_COLUMN_TAGS, u as semanticPointCloud } from "./generate-handoff-BhhPi5Bc.js";
import { n as readPointCloud, r as samplePointCloud } from "./point-io-B3vnI3Pb.js";
//#region src/cloud/wire-selection.js
function wirePreference(...args) {
	return objectFilePreference(...args);
}
function resolveWireFile(...args) {
	return resolveObjectFile(...args);
}
function adjacentWireEntry(...args) {
	return adjacentObjectEntry(...args);
}
function wireNavigationDirection(...args) {
	return objectNavigationDirection(...args);
}
/** Match variants by filename across IDs; a missing variant falls back to a usable file. */
function wireEntryFiles(entry, preferences, count = 1) {
	const used = /* @__PURE__ */ new Set();
	const wires = Array.from({ length: count }, (_, index) => {
		const file = resolveWireFile(entry.wires, preferences.wires[index], index, used);
		if (file) used.add(file);
		return file;
	});
	const preferredCloud = entry.clouds.findIndex((file) => file.name.toLowerCase() === "pc.xyz");
	return {
		wires,
		cloud: resolveWireFile(entry.clouds, preferences.cloud, Math.max(0, preferredCloud))
	};
}
/** Preserve source coordinates and edge topology; never deduplicate across independent files. */
function combineWireframes(wires) {
	const valid = wires.filter(Boolean);
	if (!valid.length) return null;
	if (valid.length === 1) return valid[0];
	const vertices = [], edges = [], bounds = [[
		Infinity,
		Infinity,
		Infinity
	], [
		-Infinity,
		-Infinity,
		-Infinity
	]];
	let hasBounds = false;
	for (const wire of valid) {
		const offset = vertices.length;
		for (const vertex of wire.vertices) vertices.push(vertex);
		for (const edge of wire.edges) edges.push(edge.map((index) => index + offset));
		if (wire.bounds) {
			hasBounds = true;
			for (let axis = 0; axis < 3; axis++) {
				bounds[0][axis] = Math.min(bounds[0][axis], wire.bounds[0][axis]);
				bounds[1][axis] = Math.max(bounds[1][axis], wire.bounds[1][axis]);
			}
		}
	}
	return {
		vertices,
		edges,
		bounds: hasBounds ? bounds : null,
		empty: !edges.length
	};
}
function normalizeWirePreferences(value) {
	const preference = (item) => item?.none === true ? { none: true } : item && typeof item.name === "string" && item.name.length <= 1024 && Number.isSafeInteger(item.index) && item.index >= 0 ? {
		name: item.name,
		index: item.index
	} : null;
	return {
		wires: Array.from({ length: 3 }, (_, index) => preference(value?.wires?.[index])),
		cloud: preference(value?.cloud),
		compare: value?.compare === true,
		count: value?.count === 3 ? 3 : 2
	};
}
//#endregion
//#region src/pointcloud/point-columns.js
function mountPointColumns({ container, getItems, getSettings, applySettings }) {
	if (!container) return null;
	container.innerHTML = localizeHTML(`<section class="inspector-section"><h3>点云列结构</h3><div class="processing-inputs"><label>编辑点云<select id="columns-file"></select></label></div><p class="processing-help">选择已加载的点云。标签和列顺序按文件保存；默认以 Z 高度色带显示。</p></section>
  <div id="columns-body" hidden><section class="inspector-section"><h3>列顺序与标签</h3><div class="column-presets"><select id="columns-start" aria-label="快捷标记起始列"></select><select id="columns-preset" aria-label="快捷标签"><option value="rgb">连续三列 → RGB</option><option value="hsv">连续三列 → HSV</option><option value="normals">连续三列 → 法向量</option><option value="intensity">当前列 → 强度</option></select><button id="columns-mark">标记</button></div>
  <p class="processing-help">拖动行或用 ↑ ↓ 调整顺序。点击列名查看数值。XYZ 的语义固定，但存储位置可移动。</p><div id="columns-rows" class="column-rows"></div>
  <div class="processing-inputs column-color-options"><label>颜色来源<select id="columns-color"><option value="auto">自动（RGB 优先）</option><option value="rgb">已标记的 RGB</option><option value="hsv">已标记的 HSV</option></select></label><label>RGB 范围<select id="columns-rgb"><option value="auto">自动</option><option value="1">0–1</option><option value="255">0–255</option><option value="65535">0–65535</option></select></label><label>HSV 范围<select id="columns-hsv"><option value="degrees">H 0–360，S/V 0–1</option><option value="unit">H/S/V 0–1</option><option value="opencv">H 0–180，S/V 0–255</option></select></label><p class="processing-help">RGB / HSV 各需三列。更改标签不切换视图；在“显示 → 已标记颜色”查看颜色。自定义标签会成为导出字段名，非 ASCII 字符将转换为下划线。</p><button id="columns-apply" class="processing-primary">应用标签与列顺序</button><button id="columns-reset">恢复读取时的列设置</button></div></section>
  <section class="inspector-section"><h3>属性数值</h3><p id="columns-stats" class="processing-help"></p><div class="column-preview"><table id="columns-preview"></table></div><p class="processing-help">预览前 5 个当前显示点；统计也基于显示样本，不会为此重新读取大文件。</p></section></div><p id="columns-status" class="processing-help" role="status"></p>`);
	const el = (id) => container.querySelector(`#${id}`), make = (tag, text) => {
		const node = document.createElement(tag);
		if (text !== void 0) node.textContent = text;
		return node;
	};
	let items = [], current = null, draft = null, selectedKey = "", dragged = null, lastSettings = null, lastCloud = null;
	const statsCache = /* @__PURE__ */ new WeakMap(), status = (text) => {
		el("columns-status").textContent = text;
	};
	function stats() {
		if (!current || !selectedKey) return;
		const values = current.rawCloud.fields[selectedKey];
		if (!values) return;
		let s = statsCache.get(values);
		if (!s) {
			s = pointFieldStats(values);
			statsCache.set(values, s);
		}
		const fmt = (value) => value === null ? "—" : Number.isFinite(value) ? Number(value.toPrecision(8)).toString() : String(value);
		el("columns-stats").textContent = t("{0} · {1} 个值 · 有效 {2} / 缺失 {3} · 最小 {4} · 最大 {5}", [
			selectedKey,
			s.count.toLocaleString(),
			s.finite.toLocaleString(),
			s.missing.toLocaleString(),
			fmt(s.min),
			fmt(s.max)
		]);
		const table = el("columns-preview");
		table.replaceChildren();
		const head = make("tr");
		head.append(make("th", t("点")));
		for (const key of draft.order) head.append(make("th", key));
		table.append(head);
		for (let i = 0; i < Math.min(5, current.rawCloud.count); i++) {
			const row = make("tr");
			row.append(make("td", String(i + 1)));
			for (const key of draft.order) row.append(make("td", fmt(current.rawCloud.fields[key]?.[i])));
			table.append(row);
		}
	}
	function move(key, to) {
		const from = draft.order.indexOf(key);
		if (from < 0 || to < 0 || to >= draft.order.length) return;
		draft.order.splice(from, 1);
		draft.order.splice(to, 0, key);
		renderRows();
		status(t("列顺序已调整，点击“应用”生效。"));
	}
	function renderRows() {
		const rows = el("columns-rows"), scroll = rows.scrollTop;
		rows.replaceChildren();
		draft.order.forEach((key, index) => {
			const row = make("div");
			row.className = "column-row";
			row.draggable = true;
			row.dataset.column = key;
			const number = make("span", String(index + 1));
			number.className = "column-index";
			const name = make("button", key);
			name.type = "button";
			name.className = "column-name";
			name.title = key;
			name.setAttribute("aria-pressed", String(key === selectedKey));
			name.onclick = () => {
				selectedKey = key;
				renderRows();
			};
			row.append(number, name);
			if ([
				"x",
				"y",
				"z"
			].includes(key)) {
				const fixed = make("span", t("坐标 {0}", [key.toUpperCase()]));
				fixed.className = "column-fixed";
				row.append(fixed);
			} else {
				const select = make("select");
				select.setAttribute("aria-label", t("{0} 的标签", [key]));
				for (const [value, label] of Object.entries(POINT_COLUMN_TAGS)) {
					const option = make("option", label);
					option.value = value;
					select.append(option);
				}
				select.value = draft.tags[key] || "scalar";
				select.onchange = () => {
					draft.tags[key] = select.value;
					renderRows();
					status(t("标签待应用。"));
				};
				row.append(select);
			}
			for (const [delta, text, label] of [[
				-1,
				"↑",
				t("上移")
			], [
				1,
				"↓",
				t("下移")
			]]) {
				const button = make("button", text);
				button.className = "column-move";
				button.disabled = index + delta < 0 || index + delta >= draft.order.length;
				button.setAttribute("aria-label", `${label} ${key}`);
				button.onclick = () => move(key, index + delta);
				row.append(button);
			}
			if (draft.tags[key] === "custom") {
				const input = make("input");
				input.value = draft.custom[key] || "";
				input.placeholder = t("自定义标签，例如 confidence");
				input.maxLength = 80;
				input.setAttribute("aria-label", t("{0} 的自定义标签", [key]));
				input.className = "column-custom";
				input.oninput = () => {
					draft.custom[key] = input.value;
				};
				row.append(input);
			}
			row.ondragstart = (event) => {
				if (["INPUT", "SELECT"].includes(event.target.tagName)) {
					event.preventDefault();
					return;
				}
				dragged = key;
				event.dataTransfer.setData("text/plain", key);
				event.dataTransfer.effectAllowed = "move";
			};
			row.ondragover = (event) => event.preventDefault();
			row.ondrop = (event) => {
				event.preventDefault();
				if (dragged) move(dragged, index);
				dragged = null;
			};
			row.ondragend = () => {
				dragged = null;
			};
			rows.append(row);
		});
		rows.scrollTop = scroll;
		const previous = el("columns-start").value;
		el("columns-start").replaceChildren();
		draft.order.forEach((key, index) => {
			const option = make("option", t("第 {0} 列 · {1}", [index + 1, key]));
			option.value = key;
			el("columns-start").append(option);
		});
		el("columns-start").value = draft.order.includes(previous) ? previous : draft.order.find((key) => ![
			"x",
			"y",
			"z"
		].includes(key)) || draft.order[0];
		stats();
	}
	function choose(item) {
		current = item;
		el("columns-body").hidden = !current;
		if (!current) {
			status(t("加载点云后，在这里查看和编辑列结构。"));
			return;
		}
		lastSettings = getSettings(current.entry, current.rawCloud);
		lastCloud = current.rawCloud;
		draft = JSON.parse(JSON.stringify(lastSettings));
		selectedKey = draft.order.includes(selectedKey) ? selectedKey : draft.order[0];
		el("columns-color").value = draft.colorSpace;
		el("columns-rgb").value = draft.rgbScale;
		el("columns-hsv").value = draft.hsvScale;
		renderRows();
		status(t("修改仅保存在本次页面；导出后列顺序和标签写入文件。"));
	}
	function refresh() {
		items = getItems();
		const previous = current?.entry;
		el("columns-file").replaceChildren();
		items.forEach((item, index) => {
			const option = make("option", item.name);
			option.value = String(index);
			el("columns-file").append(option);
		});
		const index = Math.max(0, items.findIndex((item) => item.entry === previous));
		el("columns-file").value = String(index);
		const next = items[index] || null;
		if (next?.entry !== current?.entry || next?.rawCloud !== lastCloud || next && getSettings(next.entry, next.rawCloud) !== lastSettings) choose(next);
		else if (!next) choose(null);
	}
	el("columns-file").onchange = () => choose(items[Number(el("columns-file").value)]);
	el("columns-mark").onclick = () => {
		const roles = {
			rgb: [
				"red",
				"green",
				"blue"
			],
			hsv: [
				"hue",
				"saturation",
				"value"
			],
			normals: [
				"nx",
				"ny",
				"nz"
			],
			intensity: ["intensity"]
		}[el("columns-preset").value];
		const from = draft.order.indexOf(el("columns-start").value), keys = draft.order.slice(from, from + roles.length);
		if (keys.length !== roles.length || keys.some((key) => [
			"x",
			"y",
			"z"
		].includes(key))) {
			status(t("请选择足够数量的连续属性列，不能覆盖 XYZ。"));
			return;
		}
		for (const key of draft.order) if (roles.includes(draft.tags[key])) draft.tags[key] = "scalar";
		keys.forEach((key, index) => draft.tags[key] = roles[index]);
		renderRows();
		status(t("已设置快捷标签，点击“应用”生效。"));
	};
	el("columns-apply").onclick = async () => {
		if (!current) return;
		draft.colorSpace = el("columns-color").value;
		draft.rgbScale = el("columns-rgb").value;
		draft.hsvScale = el("columns-hsv").value;
		try {
			await applySettings(current.entry, JSON.parse(JSON.stringify(draft)));
			refresh();
			status(t("已应用。保留当前着色方式；导出将采用当前列顺序。"));
		} catch (error) {
			status(error.message);
		}
	};
	el("columns-reset").onclick = () => {
		if (!current) return;
		draft = defaultPointSettings({
			...current.rawCloud,
			semantics: null
		});
		el("columns-color").value = draft.colorSpace;
		el("columns-rgb").value = draft.rgbScale;
		el("columns-hsv").value = draft.hsvScale;
		renderRows();
		status(t("已恢复读取时的设置，点击“应用”生效。"));
	};
	refresh();
	return { refresh };
}
//#endregion
//#region src/pointcloud/point-operations.js
/** Self-contained kernel: also serialized into a local Blob Worker for offline use. */
function computePointFeatures(positions, { k = 32, radius = 0, orientation = "+z", features = [
	"normals",
	"slope",
	"planarity",
	"roughness"
] } = {}, progress = () => {}) {
	if (!Array.isArray(features) || !features.length || features.some((name) => ![
		"normals",
		"slope",
		"planarity",
		"roughness"
	].includes(name))) throw Error("请选择有效的计算项目");
	const selected = new Set(features);
	const count = positions.length / 3;
	if (!Number.isSafeInteger(count) || count < 3) throw Error("至少需要 3 个点");
	if (!Number.isInteger(k) || k < 3 || k > 256) throw Error("邻域点数必须是 3–256 的整数");
	if (!Number.isFinite(radius) || radius < 0) throw Error("邻域半径必须为非负数");
	if (![
		"+x",
		"-x",
		"+y",
		"-y",
		"+z",
		"-z"
	].includes(orientation)) throw Error("法向量方向无效");
	const ids = new Uint32Array(count);
	for (let i = 0; i < count; i++) {
		ids[i] = i;
		if (![
			positions[i * 3],
			positions[i * 3 + 1],
			positions[i * 3 + 2]
		].every(Number.isFinite)) throw Error("XYZ 包含无效数值");
	}
	const coord = (i, axis) => positions[ids[i] * 3 + axis];
	function select(lo, hi, mid, axis) {
		while (lo < hi) {
			const pivot = coord(lo + hi >>> 1, axis);
			let i = lo, j = hi;
			while (i <= j) {
				while (coord(i, axis) < pivot) i++;
				while (coord(j, axis) > pivot) j--;
				if (i <= j) {
					const a = ids[i];
					ids[i++] = ids[j];
					ids[j--] = a;
				}
			}
			if (mid <= j) hi = j;
			else if (mid >= i) lo = i;
			else break;
		}
	}
	let built = 0, nextBuild = 0;
	function build(lo, hi, depth) {
		if (lo >= hi) return;
		if (hi - lo <= 16) built += hi - lo;
		else {
			const mid = lo + hi >>> 1;
			select(lo, hi - 1, mid, depth % 3);
			built++;
			build(lo, mid, depth + 1);
			build(mid + 1, hi, depth + 1);
		}
		if (built >= nextBuild) {
			progress({
				phase: "index",
				done: built,
				total: count
			});
			nextBuild = built + 16384;
		}
	}
	progress({
		phase: "index",
		done: 0,
		total: count
	});
	build(0, count, 0);
	const cap = Math.min(k, count), near = new Uint32Array(cap), distances = new Float64Array(cap);
	let used = 0;
	const r2 = radius > 0 ? radius * radius : Infinity;
	function insert(id, distance) {
		if (distance > r2 || used === cap && distance >= distances[0]) return;
		let pos;
		if (used < cap) {
			pos = used++;
			while (pos > 0) {
				const parent = pos - 1 >>> 1;
				if (distances[parent] >= distance) break;
				distances[pos] = distances[parent];
				near[pos] = near[parent];
				pos = parent;
			}
		} else {
			pos = 0;
			while (pos * 2 + 1 < used) {
				let child = pos * 2 + 1;
				if (child + 1 < used && distances[child + 1] > distances[child]) child++;
				if (distances[child] <= distance) break;
				distances[pos] = distances[child];
				near[pos] = near[child];
				pos = child;
			}
		}
		distances[pos] = distance;
		near[pos] = id;
	}
	function query(lo, hi, depth, x, y, z) {
		if (lo >= hi) return;
		const visit = (i) => {
			const id = ids[i], p = id * 3;
			insert(id, (positions[p] - x) ** 2 + (positions[p + 1] - y) ** 2 + (positions[p + 2] - z) ** 2);
		};
		if (hi - lo <= 16) {
			for (let i = lo; i < hi; i++) visit(i);
			return;
		}
		const mid = lo + hi >>> 1, axis = depth % 3;
		const delta = (axis === 0 ? x : axis === 1 ? y : z) - coord(mid, axis);
		visit(mid);
		if (delta <= 0) query(lo, mid, depth + 1, x, y, z);
		else query(mid + 1, hi, depth + 1, x, y, z);
		if (delta * delta <= Math.min(r2, used === cap ? distances[0] : Infinity)) {
			if (delta <= 0) query(mid + 1, hi, depth + 1, x, y, z);
			else query(lo, mid, depth + 1, x, y, z);
		}
	}
	const fields = Object.create(null);
	for (const name of [...selected.has("normals") ? [
		"nx",
		"ny",
		"nz"
	] : [], ...[
		"slope",
		"planarity",
		"roughness"
	].filter((name) => selected.has(name))]) fields[name] = new Float64Array(count).fill(NaN);
	fields.normal_valid = new Uint8Array(count);
	let valid = 0;
	const directionAxis = "xyz".indexOf(orientation[1]), sign = orientation[0] === "-" ? -1 : 1;
	for (let index = 0; index < count; index++) {
		const p = index * 3, x = positions[p], y = positions[p + 1], z = positions[p + 2];
		used = 0;
		query(0, count, 0, x, y, z);
		if (used >= 3) {
			let mx = 0, my = 0, mz = 0;
			for (let j = 0; j < used; j++) {
				const q = near[j] * 3;
				mx += positions[q] - x;
				my += positions[q + 1] - y;
				mz += positions[q + 2] - z;
			}
			mx /= used;
			my /= used;
			mz /= used;
			const a = /* @__PURE__ */ new Float64Array(9), vectors = new Float64Array([
				1,
				0,
				0,
				0,
				1,
				0,
				0,
				0,
				1
			]);
			for (let j = 0; j < used; j++) {
				const q = near[j] * 3, dx = positions[q] - x - mx, dy = positions[q + 1] - y - my, dz = positions[q + 2] - z - mz;
				a[0] += dx * dx;
				a[1] += dx * dy;
				a[2] += dx * dz;
				a[4] += dy * dy;
				a[5] += dy * dz;
				a[8] += dz * dz;
			}
			a[3] = a[1];
			a[6] = a[2];
			a[7] = a[5];
			for (let sweep = 0; sweep < 24; sweep++) {
				let u = 0, v = 1;
				if (Math.abs(a[2]) > Math.abs(a[1])) v = 2;
				if (Math.abs(a[5]) > Math.abs(a[u * 3 + v])) {
					u = 1;
					v = 2;
				}
				const uv = a[u * 3 + v];
				if (Math.abs(uv) <= 1e-14 * (Math.abs(a[0]) + Math.abs(a[4]) + Math.abs(a[8]))) break;
				const angle = .5 * Math.atan2(2 * uv, a[v * 3 + v] - a[u * 3 + u]);
				const c = Math.cos(angle), s = Math.sin(angle), uu = a[u * 3 + u], vv = a[v * 3 + v];
				a[u * 3 + u] = c * c * uu - 2 * s * c * uv + s * s * vv;
				a[v * 3 + v] = s * s * uu + 2 * s * c * uv + c * c * vv;
				a[u * 3 + v] = a[v * 3 + u] = 0;
				for (let w = 0; w < 3; w++) {
					if (w !== u && w !== v) {
						const wu = a[w * 3 + u], wv = a[w * 3 + v];
						a[w * 3 + u] = a[u * 3 + w] = c * wu - s * wv;
						a[w * 3 + v] = a[v * 3 + w] = s * wu + c * wv;
					}
					const wu = vectors[w * 3 + u], wv = vectors[w * 3 + v];
					vectors[w * 3 + u] = c * wu - s * wv;
					vectors[w * 3 + v] = s * wu + c * wv;
				}
			}
			const order = [
				0,
				1,
				2
			].sort((u, v) => a[u * 3 + u] - a[v * 3 + v]);
			const low = Math.max(0, a[order[0] * 3 + order[0]]), mid = Math.max(0, a[order[1] * 3 + order[1]]), high = a[order[2] * 3 + order[2]];
			if (high > 0 && mid > high * 1e-10) {
				const n = [
					vectors[order[0]],
					vectors[3 + order[0]],
					vectors[6 + order[0]]
				];
				let orient = n[directionAxis];
				if (Math.abs(orient) < 1e-12) orient = n.find((value) => Math.abs(value) >= 1e-12) || 1;
				if (orient * sign < 0) for (let axis = 0; axis < 3; axis++) n[axis] *= -1;
				if (selected.has("normals")) {
					fields.nx[index] = n[0];
					fields.ny[index] = n[1];
					fields.nz[index] = n[2];
				}
				if (selected.has("slope")) fields.slope[index] = Math.acos(Math.min(1, Math.abs(n[2]))) * 180 / Math.PI;
				if (selected.has("planarity")) fields.planarity[index] = Math.max(0, Math.min(1, (mid - low) / high));
				if (selected.has("roughness")) fields.roughness[index] = Math.abs(mx * n[0] + my * n[1] + mz * n[2]);
				fields.normal_valid[index] = 1;
				valid++;
			}
		}
		if (index % 2048 === 0 || index === count - 1) progress({
			phase: "features",
			done: index + 1,
			total: count
		});
	}
	return {
		fields,
		valid,
		count
	};
}
function runPointFeatures(positions, options, { signal, onProgress = () => {} } = {}) {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException(t("已取消"), "AbortError"));
			return;
		}
		const source = `const compute = ${computePointFeatures.toString()}; onmessage = event => { try { const result = compute(event.data.positions, event.data.options, progress => postMessage({progress})); postMessage({result}, Object.values(result.fields).map(a => a.buffer)); } catch (error) { postMessage({error: error.message}); } };`;
		const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
		let worker;
		const cleanup = () => {
			worker?.terminate();
			URL.revokeObjectURL(url);
			signal?.removeEventListener("abort", abort);
		};
		const abort = () => {
			cleanup();
			reject(new DOMException(t("已取消"), "AbortError"));
		};
		try {
			worker = new Worker(url);
			signal?.addEventListener("abort", abort, { once: true });
			worker.onmessage = ({ data }) => {
				if (data.progress) {
					onProgress(data.progress);
					return;
				}
				cleanup();
				if (data.error) reject(Error(t(data.error)));
				else resolve(data.result);
			};
			worker.onerror = (event) => {
				cleanup();
				reject(Error(event.message || t("后台计算失败")));
			};
			const copy = positions.slice();
			worker.postMessage({
				positions: copy,
				options
			}, [copy.buffer]);
		} catch (error) {
			cleanup();
			reject(error);
		}
	});
}
function derivedPointCloud(cloud, result, parameters, scope) {
	const fields = Object.assign(Object.create(null), cloud.fields), mapping = {};
	for (const [name, values] of Object.entries(result.fields)) {
		let key = name, suffix = 2;
		while (Object.hasOwn(fields, key)) key = `${name}_${suffix++}`;
		fields[key] = values;
		mapping[name] = key;
	}
	const columnOrder = cloud.columnOrder ? [...cloud.columnOrder] : [
		"x",
		"y",
		"z",
		...Object.keys(cloud.fields || {}).filter((key) => ![
			"x",
			"y",
			"z"
		].includes(key))
	];
	const added = Object.values(mapping);
	let at = columnOrder.length;
	if (parameters.placement === "after-xyz") at = Math.max(...[
		"x",
		"y",
		"z"
	].map((key) => columnOrder.indexOf(key))) + 1;
	if (parameters.placement === "index") {
		if (!Number.isInteger(parameters.insertColumn) || parameters.insertColumn < 1 || parameters.insertColumn > columnOrder.length + 1) throw Error(t("插入列号需为 1–{0}", [columnOrder.length + 1]));
		at = parameters.insertColumn - 1;
	}
	columnOrder.splice(at, 0, ...added);
	const semantics = cloud.semantics ? JSON.parse(JSON.stringify(cloud.semantics)) : null;
	if (semantics) {
		semantics.order = columnOrder;
		for (const [name, key] of Object.entries(mapping)) if ([
			"nx",
			"ny",
			"nz"
		].includes(name)) {
			for (const old of Object.keys(semantics.tags)) if (semantics.tags[old] === name) semantics.tags[old] = "scalar";
			semantics.tags[key] = name;
		} else semantics.tags[key] = "scalar";
	}
	return {
		...cloud,
		fields,
		columnOrder,
		semantics,
		count: cloud.count,
		totalCount: cloud.count,
		featureMapping: mapping,
		notes: [...cloud.notes || [], t("计算结果（{0}）：{1} / {2} 个有效邻域；k={3}，半径={4}，方向={5}。", [
			scope,
			result.valid,
			cloud.count,
			parameters.k,
			parameters.radius || t("不限"),
			parameters.orientation
		])],
		processing: {
			parameters,
			scope,
			originalTotal: cloud.totalCount,
			fields: mapping,
			valid: result.valid
		}
	};
}
//#endregion
//#region src/pointcloud/point-processing.js
function mountPointProcessing({ container, getSelection, readCloud, addResults }) {
	if (!container) return null;
	container.innerHTML = localizeHTML(`
    <section class="inspector-section"><h3>选择操作</h3><fieldset class="processing-inputs"><label>操作<select id="process-operation"><option value="normals">计算法向量</option><option value="slope">计算坡度</option><option value="planarity">计算平面度</option><option value="roughness">计算粗糙度</option><option value="custom">自选多项计算</option><option value="export">保存 / 合并点云</option></select></label><p id="process-description" class="processing-help"></p>
    <div id="process-features" class="feature-checks" hidden><label><input type="checkbox" value="normals" checked>法向量</label><label><input type="checkbox" value="slope">坡度</label><label><input type="checkbox" value="planarity">平面度</label><label><input type="checkbox" value="roughness">粗糙度</label></div></fieldset></section>
    <section class="inspector-section"><h3>数据范围</h3><p id="process-selection" class="processing-selection"></p><p class="processing-help">勾选决定显示与处理；收起文件夹不改变勾选。计算逐文件进行。</p>
    <fieldset class="processing-inputs"><label>数据范围<select id="process-scope"><option value="full">全部点</option><option value="display">当前显示点</option></select></label>
    <p class="processing-help">全部点会按需重新读取原文件；显示上限不影响全量处理。计算结果仅保留在本次页面中，请及时导出。</p></fieldset></section>
    <section id="process-compute-panel" class="inspector-section"><h3>邻域设置</h3><fieldset class="processing-inputs">
    <label>邻域点数 k<input id="process-k" type="number" min="3" max="256" step="1" value="32"></label>
    <label>最大半径<input id="process-radius" type="number" min="0" step="any" value="0"></label>
    <p class="processing-help">k 包含点自身。半径单位与坐标相同；0 不限，非零时最多取半径内 k 个近邻。</p>
    <label id="process-direction-row">法向量朝向<select id="process-direction"><option value="+z">+Z（向上）</option><option value="-z">−Z（向下）</option><option value="+x">+X</option><option value="-x">−X</option><option value="+y">+Y</option><option value="-y">−Y</option></select></label>
    <label>新增列位置<select id="process-placement"><option value="end">追加到末尾</option><option value="after-xyz">放在 XYZ 后</option><option value="index">指定列号之前</option></select></label><label id="process-column-row" hidden>插入列号<input id="process-column" type="number" min="1" step="1" value="4"></label><button id="process-compute" class="processing-primary">计算并显示结果</button>
    <p class="processing-help">只添加所选结果，原始属性保留。完成后可在“数据”查看新属性，或在“显示”切换着色。无效邻域以 NaN 和 normal_valid=0 标记。计算不改变坐标，新增属性按下方选择的位置插入。</p></fieldset></section>
    <section id="process-export-panel" class="inspector-section" hidden><h3>保存设置</h3><fieldset class="processing-inputs">
    <label>文件格式<select id="process-format"><option value="ply">二进制 PLY（推荐）</option><option value="txt">TXT（带属性表头）</option></select></label>
    <label>保存方式<select id="process-save-method"><option value="direct">直接保存（支持时）</option><option value="download">浏览器下载（≤256 MB）</option></select></label>
    <label class="processing-check"><input id="process-source" type="checkbox" checked>附加来源编号 source_id</label>
    <button id="process-export" class="processing-primary">导出所选 / 合并为一个文件</button>
    <p class="processing-help">保留 XYZ 和数值属性；多选时合并为一个文件，缺失属性填 NaN。按原始坐标拼接，不配准、不去重。按“数据”页列顺序保存；多选以首文件为准，新属性追加。标签写为标准字段名。</p>
    <p class="processing-help">移除原始点云或计算结果，请在左侧点击名称后选择“移除”。</p></fieldset></section>
    <section class="processing-feedback" aria-label="处理进度"><progress id="process-progress" max="1" value="0" hidden></progress><p id="process-status" role="status" aria-live="polite">选择点云后即可计算或导出。</p><button id="process-cancel" hidden>取消当前操作</button></section>`);
	const el = (id) => container.querySelector(`#${id}`);
	let controller = null, latestSelection = [], selectionLoading = false;
	function refresh(selection = latestSelection, loading = selectionLoading) {
		latestSelection = selection;
		selectionLoading = loading;
		const summary = el("process-selection");
		summary.textContent = loading ? t("正在加载 {0} 个点云…", [selection.length]) : selection.length ? t("当前勾选 {0} 个点云：{1}{2}", [
			selection.length,
			selection.slice(0, 3).map((entry) => entry.treeName || entry.id).join("、"),
			selection.length > 3 ? "…" : ""
		]) : t("尚未勾选点云");
		summary.title = selection.map((entry) => entry.id).join("\n");
		for (const id of ["process-compute", "process-export"]) el(id).disabled = !!controller || loading || !selection.length;
	}
	function busy(value) {
		for (const fieldset of container.querySelectorAll("fieldset")) fieldset.disabled = value;
		el("process-cancel").hidden = !value;
		el("process-progress").hidden = !value;
		refresh();
	}
	function status(text, fraction = 0) {
		el("process-status").textContent = text;
		el("process-progress").value = fraction;
	}
	function cancel() {
		if (controller) {
			controller.abort();
			controller = null;
			busy(false);
			status(t("操作已取消，未添加计算结果。"));
		}
	}
	async function collect(selection, scope, signal) {
		const items = [];
		for (const [index, entry] of selection.entries()) {
			signal.throwIfAborted();
			status(t("读取 {0} / {1}：{2}", [
				index + 1,
				selection.length,
				entry.id
			]));
			const cloud = await readCloud(entry, scope, signal, ({ loaded, total }) => status(t("读取 {0} · {1}%", [entry.id, Math.floor(100 * loaded / Math.max(1, total))]), loaded / Math.max(1, total)));
			signal.throwIfAborted();
			if (!cloud?.count) throw Error(t("{0} 没有可用的点", [entry.id]));
			items.push({
				name: entry.id,
				cloud
			});
		}
		return items;
	}
	async function perform(kind) {
		if (controller) return;
		let selected;
		try {
			selected = getSelection();
			if (!selected.length) throw Error(t("请先勾选点云"));
		} catch (error) {
			status(error.message);
			return;
		}
		const scope = el("process-scope").value, scopeLabel = scope === "full" ? t("全部点") : t("当前显示点");
		const parameters = {
			k: Number(el("process-k").value),
			radius: Number(el("process-radius").value),
			orientation: el("process-direction").value,
			features: selectedFeatures(),
			placement: el("process-placement").value,
			insertColumn: Number(el("process-column").value)
		};
		if (kind === "compute" && (!Number.isInteger(parameters.k) || parameters.k < 3 || parameters.k > 256 || !Number.isFinite(parameters.radius) || parameters.radius < 0)) {
			status(t("邻域点数需为 3–256 的整数，半径需为非负数。"));
			return;
		}
		const format = el("process-format").value, sourceIds = el("process-source").checked;
		const job = new AbortController();
		controller = job;
		busy(true);
		status(t("准备处理…"));
		let stream = null, nativeWriter = null;
		try {
			let handle = null;
			const filename = `${selected.length > 1 ? `merged_${selected.length}_clouds` : selected[0].id.replace(/\.[^.]+$/, "").replace(/[<>:"/\\|?*\u0000-\u0020\u007f]/g, "_")}_${scope === "full" ? "all" : "display"}.${format}`;
			if (kind === "export" && el("process-save-method").value === "direct" && typeof window.showSaveFilePicker === "function") {
				handle = await window.showSaveFilePicker({
					suggestedName: filename,
					types: [{
						description: format.toUpperCase(),
						accept: { [format === "ply" ? "application/octet-stream" : "text/plain"]: [`.${format}`] }
					}]
				});
				job.signal.throwIfAborted();
			}
			if (kind === "compute" && !parameters.features.length) throw Error(t("请至少勾选一项计算"));
			const items = await collect(selected, scope, job.signal);
			if (kind === "compute") {
				const results = [];
				for (const [index, item] of items.entries()) {
					const result = await runPointFeatures(item.cloud.positions, parameters, {
						signal: job.signal,
						onProgress: ({ phase, done, total }) => status(`${index + 1} / ${items.length} · ${item.name} · ${phase === "index" ? t("建立邻域索引") : t("计算几何特征")} ${Math.floor(done / total * 100)}%`, (index + done / total) / items.length)
					});
					job.signal.throwIfAborted();
					results.push({
						source: selected[index],
						name: t("{0} · 特征（{1}）", [item.name, scopeLabel]),
						cloud: derivedPointCloud(item.cloud, result, parameters, scopeLabel)
					});
				}
				await addResults(results);
				status(t("完成：{0} 个独立结果，{1} 个有效邻域。已选中新结果，可调整着色并导出。", [results.length, results.reduce((n, r) => n + r.cloud.processing.valid, 0).toLocaleString()]));
			} else {
				const schema = pointExportSchema(items, { sourceIds }), limit = 268435456;
				const estimate = schema.count * schema.properties.length * (format === "ply" ? 8 : 25);
				if (!handle && !isMobileApp() && estimate > limit) throw Error(t("预计导出文件较大。请在支持直接保存文件的 Chrome / Edge HTTPS 或 localhost 页面中导出，或选择“当前显示点”减小数据量。"));
				if (isMobileApp()) nativeWriter = await nativeExportWriter(filename);
				else if (handle) stream = await handle.createWritable();
				job.signal.throwIfAborted();
				const chunks = [];
				let bytes = 0;
				await writePointExport(items, {
					format,
					sourceIds,
					signal: job.signal,
					write: async (chunk) => {
						if (nativeWriter) await nativeWriter.write(chunk);
						else if (stream) await stream.write(chunk);
						else {
							bytes += chunk.byteLength;
							if (bytes > limit) throw Error(t("下载缓冲超过 256 MB，请使用支持直接保存文件的浏览器。"));
							chunks.push(chunk);
						}
					},
					onProgress: ({ done, total }) => status(t("写出 {0} / {1} 点 · {2}", [
						done.toLocaleString(),
						total.toLocaleString(),
						scopeLabel
					]), done / total)
				});
				job.signal.throwIfAborted();
				if (nativeWriter) {
					await nativeWriter.share(format === "ply" ? "application/octet-stream" : "text/plain");
					nativeWriter = null;
				} else if (stream) {
					await stream.close();
					stream = null;
				} else {
					const url = URL.createObjectURL(new Blob(chunks, { type: format === "ply" ? "application/octet-stream" : "text/plain" }));
					const link = document.createElement("a");
					link.href = url;
					link.download = filename;
					link.click();
					setTimeout(() => URL.revokeObjectURL(url), 6e4);
				}
				status(t("{0}：{1} · {2} 点 · {3} 个来源。", [
					handle ? t("已保存") : t("已发起下载"),
					filename,
					schema.count.toLocaleString(),
					items.length
				]));
			}
		} catch (error) {
			if (nativeWriter) try {
				await nativeWriter.abort();
			} catch {}
			if (stream) try {
				await stream.abort();
			} catch {}
			if (controller === job) status(error.name === "AbortError" ? t("操作已取消。") : t("操作失败：{0}", [error.message]));
		} finally {
			if (controller === job) {
				controller = null;
				busy(false);
			}
		}
	}
	function selectedFeatures() {
		const operation = el("process-operation").value;
		return operation === "custom" ? [...container.querySelectorAll("#process-features input:checked")].map((input) => input.value) : [operation];
	}
	function changeOperation() {
		const operation = el("process-operation").value, exporting = operation === "export";
		el("process-compute-panel").hidden = exporting;
		el("process-export-panel").hidden = !exporting;
		el("process-features").hidden = operation !== "custom";
		el("process-direction-row").hidden = !selectedFeatures().includes("normals");
		el("process-description").textContent = {
			normals: t("拟合局部平面，生成 nx、ny、nz。"),
			slope: t("计算局部表面坡度（0–90°），生成 slope。"),
			planarity: t("计算邻域的平面程度（0–1），生成 planarity。"),
			roughness: t("计算点到邻域拟合平面的距离，生成 roughness。"),
			custom: t("勾选需要的结果，复用同一个邻域索引。"),
			export: t("单选保存一个点云，多选合并为一个文件。")
		}[operation];
	}
	el("process-operation").onchange = changeOperation;
	for (const input of container.querySelectorAll("#process-features input")) input.onchange = changeOperation;
	changeOperation();
	el("process-placement").onchange = () => {
		el("process-column-row").hidden = el("process-placement").value !== "index";
	};
	el("process-compute").onclick = () => perform("compute");
	el("process-export").onclick = () => perform("export");
	el("process-cancel").onclick = cancel;
	refresh();
	return {
		cancel,
		refresh
	};
}
//#endregion
//#region src/cloud/cloud-combine.js
/** Combine already sampled clouds without moving their original coordinates. */
var CLOUD_SOURCE_PALETTE = [
	[
		57,
		126,
		179
	],
	[
		222,
		123,
		68
	],
	[
		65,
		151,
		113
	],
	[
		157,
		102,
		181
	],
	[
		205,
		174,
		56
	],
	[
		55,
		157,
		173
	],
	[
		206,
		105,
		148
	],
	[
		125,
		139,
		76
	],
	[
		105,
		122,
		183
	],
	[
		166,
		117,
		91
	],
	[
		106,
		158,
		158
	],
	[
		187,
		120,
		105
	]
];
function cloudSourceColor(name) {
	let hash = 2166136261;
	for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 16777619) >>> 0;
	return CLOUD_SOURCE_PALETTE[hash % CLOUD_SOURCE_PALETTE.length].map((channel) => channel / 255);
}
/** Scene metadata only: no concatenation of point coordinates or scalar arrays. */
function describePointClouds(items) {
	if (!items.length) return null;
	const fields = Object.create(null), bounds = [[
		Infinity,
		Infinity,
		Infinity
	], [
		-Infinity,
		-Infinity,
		-Infinity
	]];
	const sources = [], notes = /* @__PURE__ */ new Set();
	let count = 0, totalCount = 0, rgb = false;
	for (const { name, cloud } of items) {
		for (let axis = 0; axis < 3; axis++) {
			bounds[0][axis] = Math.min(bounds[0][axis], cloud.bounds[0][axis]);
			bounds[1][axis] = Math.max(bounds[1][axis], cloud.bounds[1][axis]);
		}
		for (const key of Object.keys(cloud.fields || {})) fields[key] = null;
		sources.push({
			name,
			start: count,
			count: cloud.count,
			totalCount: cloud.totalCount,
			color: cloudSourceColor(name)
		});
		count += cloud.count;
		totalCount += cloud.totalCount;
		rgb ||= !!cloud.rgb;
		for (const note of cloud.notes || []) notes.add(note);
	}
	return {
		count,
		totalCount,
		bounds,
		fields,
		rgb,
		sources,
		notes: [...notes]
	};
}
//#endregion
//#region src/cloud/cloud-app.js
initializeLocale();
(() => {
	const $ = (id) => document.getElementById(id);
	const isWire = document.body.dataset.tool === "wireframe";
	const pointExtension = /\.(xyz|txt|csv|pts|ply|pcd)$/i;
	const natural = (a, b) => a.localeCompare(b, void 0, { numeric: true });
	const pretty = (value) => Number(value).toLocaleString("zh-CN");
	const formatSize = (value) => value > 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB`;
	const fieldLabel = (name) => /^column_\d+$/.test(name) ? t("第 {0} 列", [name.slice(7)]) : name;
	const compact = (value) => !Number.isFinite(value) ? "—" : Math.abs(value) > 1e4 ? value.toPrecision(6) : Number(value.toPrecision(5)).toString();
	let entries = [], active = null, revision = 0, overlay = null;
	let viewers = [], syncEnabled = false, loaded = {
		cloud: null,
		wire: null
	}, loadedWires = [];
	let currentPointName = "", messages = [], loadController = null;
	const cached = new CloudFileCache({ readCloud: (file, options) => file.generatedCloud ? samplePointCloud(file.generatedCloud, options.maxPoints) : readPointCloud(file, options) }), selectedCloudEntries = /* @__PURE__ */ new Set();
	let columnsControls = null, processingControls = null, displayedItems = [], resultSerial = 0;
	let mobileSession = null, mobileKnownIds = [];
	let cameraControls = null, paletteControls = null, cloudColors = null;
	let cloudMode = "multiple", lastCloudEntry = null;
	let wireMode = "single", wirePreferences = {
		wires: [
			null,
			null,
			null
		],
		cloud: null,
		compare: false,
		count: 2
	};
	const selectedWireEntries = /* @__PURE__ */ new Set();
	let wireChoices = {
		wires: [],
		clouds: []
	};
	if (isWire) try {
		wirePreferences = normalizeWirePreferences(JSON.parse(localStorage.getItem("BuildingWebViewer.wirePreferences") || "null"));
	} catch {}
	const pointProject = new ViewerProject();
	let projectControls = null;
	let options = {
		...currentPalettePreferences(),
		showPoints: true,
		showWire: isWire,
		pointSize: 2,
		pointOpacity: 1,
		colorMode: isWire ? "solid" : "height",
		pointColor: "#547d99",
		wireColor: "#e49b44",
		rgbFields: null,
		grid: true
	};
	function columnSettings(entry, cloud) {
		if (!entry.columnSettings) entry.columnSettings = defaultPointSettings(cloud);
		return entry.columnSettings;
	}
	function prepareColumns(entry, rawCloud) {
		const settings = columnSettings(entry, rawCloud);
		if (entry.columnView?.raw === rawCloud && entry.columnView.settings === settings) return entry.columnView.cloud;
		const cloud = semanticPointCloud(rawCloud, settings);
		entry.columnView = {
			raw: rawCloud,
			settings,
			cloud
		};
		return cloud;
	}
	function error(message) {
		$("error").hidden = !message;
		$("error").querySelector("span").textContent = message || "";
	}
	function activeViewerCount() {
		return !isWire || !$("compare-mode").checked ? 1 : Number($("compare-count").value) === 3 ? 3 : 2;
	}
	const comparison = createViewerComparison(() => viewers.slice(0, activeViewerCount()), () => syncEnabled && (!isWire || $("wire-sync-camera").checked));
	function installSync() {
		for (const viewer of viewers) comparison.install(viewer);
	}
	function pauseSync(callback) {
		return comparison.pause(callback);
	}
	function initViewers() {
		if (viewers.length) return;
		viewers = (isWire ? [
			"scene",
			"scene-2",
			"scene-3"
		] : ["scene"]).map((id) => new CloudViewer($(id), { onError: error }));
		installSync();
		pauseSync(() => viewers.forEach((viewer) => viewer.setOptions(options)));
	}
	function option(select, value, text) {
		const element = document.createElement("option");
		element.value = value;
		element.textContent = text;
		select.append(element);
	}
	function matchingEntries() {
		const query = $("search").value.trim().toLowerCase();
		return entries.filter((entry) => pointProject.matches(entry, query));
	}
	function list() {
		const filtered = matchingEntries();
		if (!isWire) {
			$("filter-count").textContent = t("匹配 {0} 项 · 已勾选 {1}", [pretty(filtered.length), selectedCloudEntries.size]);
			$("item-count").textContent = t("共 {0} 项", [pretty(entries.length)]);
			projectControls?.render();
			updateCloudSelection();
			updateCloudModeUI(filtered);
			columnsControls?.refresh();
			processingControls?.refresh([...selectedCloudEntries], Boolean(loadController));
			return;
		}
		$("filter-count").textContent = t("匹配 {0} 项 · 已勾选 {1}", [pretty(filtered.length), selectedWireEntries.size]);
		$("wire-mode-select").value = wireMode;
		for (const id of ["select-all-wires", "invert-wire-selection"]) $(id).disabled = wireMode !== "multiple" || !filtered.length;
		const multiple = wireMode === "multiple";
		$("previous-wire-id").parentElement.hidden = multiple;
		$("wire-mode-note").textContent = multiple ? t("勾选多个 ID，按原始坐标叠加；显示设置应用到所有已选 ID。") : t("单个 ID：← / → 或 [ / ] 切换；按自然编号顺序，遵循搜索筛选。");
		for (const id of ["previous-wire-id", "next-wire-id"]) $(id).disabled = multiple || !filtered.length || adjacentWireEntry(filtered, active, id === "previous-wire-id" ? -1 : 1) === active;
		$("item-count").textContent = t("共 {0} 项", [pretty(entries.length)]);
		projectControls?.render();
	}
	function fillWireSelect(select, files, index = null) {
		select.replaceChildren();
		option(select, "", t("不加载线框"));
		files.forEach((file, fileIndex) => option(select, String(fileIndex), file.name));
		select.value = Number.isInteger(index) && files[index] ? String(index) : "";
	}
	function setComparisonUI() {
		if (!isWire) return;
		const enabled = $("compare-mode").checked && !$("compare-mode").disabled;
		const count = enabled && Number($("compare-count").value) === 3 ? 3 : enabled ? 2 : 1;
		$("wire-compare-layout").value = String(count);
		$("wire-compare-layout").querySelector("option[value=\"2\"]").disabled = $("compare-mode").disabled;
		$("wire-compare-layout").querySelector("option[value=\"3\"]").disabled = $("compare-count").querySelector("option[value=\"3\"]").disabled || $("compare-mode").disabled;
		$("wire-sync-row").hidden = count === 1;
		$("compare-controls").hidden = !enabled;
		$("wire-slot-3").hidden = count < 3;
		$("wire-file-2").disabled = !enabled || !wireChoices.wires.length;
		$("wire-file-3").disabled = count < 3 || !wireChoices.wires.length;
		$("viewer-grid").dataset.panels = String(count);
		$("panel-heading-1").hidden = count === 1;
		$("viewer-panel-2").hidden = count < 2;
		$("viewer-panel-3").hidden = count < 3;
	}
	function resetFileControls() {
		for (const id of ["wire-file", "cloud-file"]) {
			$(id).replaceChildren();
			option($(id), "", t("未选择"));
			$(id).disabled = true;
		}
		$("attach-cloud").disabled = true;
		if (isWire) {
			for (const id of ["wire-file-2", "wire-file-3"]) {
				$(id).replaceChildren();
				option($(id), "", t("未选择"));
				$(id).disabled = true;
			}
			$("compare-mode").checked = false;
			$("compare-mode").disabled = true;
			$("compare-count").value = "2";
			$("compare-count").querySelector("option[value=\"3\"]").disabled = false;
			setComparisonUI();
		}
	}
	function resetPanelLabels() {
		if (!isWire) return;
		for (let index = 1; index <= 3; index++) {
			setNameSummary($(`panel-label-${index}`), [], t("线框 {0}", [index]));
			$(`panel-stats-${index}`).textContent = "—";
			$(`panel-empty-${index}`).hidden = true;
		}
	}
	function clear() {
		processingControls?.cancel();
		displayedItems = [];
		cloudColors?.refresh();
		loadController?.abort();
		loadController = null;
		selectedCloudEntries.clear();
		selectedWireEntries.clear();
		lastCloudEntry = null;
		cached.setActive([]);
		revision++;
		active = null;
		overlay = null;
		loaded = {
			cloud: null,
			wire: null
		};
		loadedWires = [];
		messages = [];
		currentPointName = "";
		syncEnabled = false;
		pauseSync(() => viewers.forEach((viewer) => viewer.setData({})));
		resetFileControls();
		resetPanelLabels();
		fields();
		list();
		error("");
		$("loading").hidden = true;
		$("screenshot").disabled = true;
		$("empty-state").hidden = false;
		$("current-title").textContent = t("未选择数据");
		$("scene-stats").textContent = t("从左侧选择要查看的数据");
		setNameSummary($("geometry-note"), [], t("未选择数据时保持空白"));
		$("data-notes").textContent = "";
		$("color-legend").hidden = true;
	}
	function receive(fileList, fromFolder, dropPaths = null) {
		const files = [...fileList];
		if (!isWire) return receiveCloudFiles(files, fromFolder, dropPaths);
		const result = appendWireFiles(entries, pointProject, files, dropPaths);
		$("search").value = "";
		list();
		$("source-note").textContent = t("文件留在本机 · 分组仅保留在本次页面");
		error(!result.added && !result.duplicates ? t("未找到 OBJ 线框或支持的点云文件。请选择数据集根目录或某个对象子目录。") : "");
		if (active) configureWireChoices(active);
		return result;
	}
	function rememberWireChoices(changed = null) {
		if (!isWire || !active) return;
		wirePreferences.wires = [
			"wire-file",
			"wire-file-2",
			"wire-file-3"
		].map((id, index) => changed && changed !== id || !wireChoices.wires.length ? wirePreferences.wires[index] : wirePreference(wireChoices.wires, $(id).value));
		if ((!changed || changed === "cloud-file") && wireChoices.clouds.length && $("cloud-file").value !== "overlay") wirePreferences.cloud = wirePreference(wireChoices.clouds, $("cloud-file").value);
		if ((!changed || changed === "compare-mode") && !$("compare-mode").disabled) wirePreferences.compare = $("compare-mode").checked;
		if (!changed || changed === "compare-count") wirePreferences.count = Number($("compare-count").value);
		try {
			localStorage.setItem("BuildingWebViewer.wirePreferences", JSON.stringify(wirePreferences));
		} catch {}
	}
	function configureWireChoices(entry) {
		const unique = (key) => [...new Map([entry, ...[...selectedWireEntries].filter((item) => item !== entry)].flatMap((item) => item[key]).map((file) => [file.name.toLowerCase(), file])).values()];
		wireChoices = {
			wires: unique("wires"),
			clouds: unique("clouds")
		};
		const files = wireEntryFiles(wireChoices, wirePreferences, 3);
		[
			"wire-file",
			"wire-file-2",
			"wire-file-3"
		].forEach((id, index) => fillWireSelect($(id), wireChoices.wires, files.wires[index] ? wireChoices.wires.indexOf(files.wires[index]) : null));
		const cloudSelect = $("cloud-file");
		cloudSelect.replaceChildren();
		option(cloudSelect, "", t("不加载点云"));
		wireChoices.clouds.forEach((file, index) => option(cloudSelect, String(index), file.name));
		cloudSelect.value = files.cloud ? String(wireChoices.clouds.indexOf(files.cloud)) : "";
		$("wire-file").disabled = !wireChoices.wires.length;
		cloudSelect.disabled = !wireChoices.clouds.length;
		$("attach-cloud").disabled = false;
		const capacity = Math.max(0, ...[...selectedWireEntries].map((item) => item.wires.length));
		$("compare-mode").disabled = capacity < 2;
		$("compare-mode").checked = wirePreferences.compare && capacity >= 2;
		$("compare-count").value = String(wirePreferences.count === 3 && capacity >= 3 ? 3 : 2);
		$("compare-count").querySelector("option[value=\"3\"]").disabled = capacity < 3;
		setComparisonUI();
	}
	function removeWireEntries(selection) {
		const removed = new Set(selection);
		loadController?.abort();
		revision++;
		for (const entry of removed) {
			selectedWireEntries.delete(entry);
			for (const file of [...entry.wires, ...entry.clouds]) cached.forget(file);
		}
		entries = entries.filter((entry) => !removed.has(entry));
		if (selectedWireEntries.size) applyWireSelection();
		else clear();
	}
	function choose(entry) {
		selectedWireEntries.clear();
		selectedWireEntries.add(entry);
		return applyWireSelection(entry, { preserveCamera: false });
	}
	function applyWireSelection(preferred = null, { preserveCamera = false } = {}) {
		if (!selectedWireEntries.size) {
			clear();
			return;
		}
		active = selectedWireEntries.has(preferred) ? preferred : selectedWireEntries.has(active) ? active : [...selectedWireEntries].at(-1);
		overlay = null;
		error("");
		configureWireChoices(active);
		list();
		return load({ preserveCamera });
	}
	function toggleWire(entry) {
		if (wireMode === "single") {
			if (selectedWireEntries.has(entry)) clear();
			else choose(entry);
			return;
		}
		if (selectedWireEntries.has(entry)) selectedWireEntries.delete(entry);
		else selectedWireEntries.add(entry);
		applyWireSelection(entry);
	}
	function setWireMode(mode) {
		if (!["single", "multiple"].includes(mode) || mode === wireMode) return;
		wireMode = mode;
		if (mode === "single" && selectedWireEntries.size > 1) choose(active || [...selectedWireEntries].at(-1));
		else {
			list();
			mobileSession?.schedule();
		}
	}
	function batchWireSelection(invert = false) {
		if (wireMode !== "multiple") return;
		for (const entry of matchingEntries()) if (invert && selectedWireEntries.has(entry)) selectedWireEntries.delete(entry);
		else selectedWireEntries.add(entry);
		applyWireSelection();
	}
	function navigateWire(direction) {
		if (wireMode !== "single") return;
		const next = adjacentWireEntry(matchingEntries(), active, direction);
		if (next && next !== active) choose(next);
	}
	function selectFiles(entry = active) {
		if (!entry) return {
			cloud: null,
			wires: []
		};
		if (!isWire) return {
			cloud: entry.file,
			wires: [null]
		};
		const files = wireEntryFiles(entry, {
			wires: [
				"wire-file",
				"wire-file-2",
				"wire-file-3"
			].map((id) => wirePreference(wireChoices.wires, $(id).value)),
			cloud: $("cloud-file").value === "overlay" ? { none: true } : wirePreference(wireChoices.clouds, $("cloud-file").value)
		}, activeViewerCount());
		if (entry === active && $("cloud-file").value === "overlay") files.cloud = overlay;
		return files;
	}
	function read(file, kind, options = {}) {
		return cached.read(file, kind, {
			maxPoints: Number($("point-limit").value),
			...options
		});
	}
	function receiveCloudFiles(files, fromFolder, dropPaths = null) {
		const existing = new Set(entries.map((entry) => entry.key));
		const names = new Set(entries.map((entry) => entry.id));
		let added = 0, duplicates = 0;
		for (const file of files) {
			if (!pointExtension.test(file.name)) continue;
			const path = dropPaths?.get(file) || file.webkitRelativePath || file.name;
			const key = `${path}\0${file.size}\0${file.lastModified}`;
			if (existing.has(key)) {
				duplicates++;
				continue;
			}
			const base = dropPaths ? path : fromFolder ? path.split("/").slice(1).join("/") || file.name : file.name;
			let id = base, suffix = 2;
			while (names.has(id)) id = `${base} (${suffix++})`;
			const entry = {
				id,
				key,
				file
			};
			pointProject.assign(entry, path);
			entries.push(entry);
			existing.add(key);
			names.add(id);
			added++;
		}
		entries.sort((a, b) => natural(a.id, b.id));
		$("search").value = "";
		list();
		$("source-note").textContent = t("文件留在本机 · 分组仅保留在本次页面");
		error(!added && !files.some((file) => pointExtension.test(file.name)) ? t("未找到支持的点云。请选择 XYZ / TXT / CSV / PTS / PLY / PCD 文件。") : "");
		return {
			added,
			duplicates
		};
	}
	function applyCloudSelection(preferred = null) {
		if (!selectedCloudEntries.size) {
			clear();
			return;
		}
		if (preferred && selectedCloudEntries.has(preferred)) lastCloudEntry = preferred;
		else if (!selectedCloudEntries.has(lastCloudEntry)) lastCloudEntry = [...selectedCloudEntries].at(-1);
		active = lastCloudEntry;
		list();
		load();
	}
	function toggleCloud(entry) {
		if (cloudMode === "single") {
			if (selectedCloudEntries.has(entry)) return;
			selectedCloudEntries.clear();
			selectedCloudEntries.add(entry);
			applyCloudSelection(entry);
			return;
		}
		if (selectedCloudEntries.has(entry)) selectedCloudEntries.delete(entry);
		else {
			selectedCloudEntries.add(entry);
			lastCloudEntry = entry;
		}
		applyCloudSelection();
	}
	function removeCloud(entry) {
		if (selectedCloudEntries.delete(entry)) applyCloudSelection();
	}
	function deleteProjectEntries(selection) {
		const removed = new Set(selection.filter((entry) => entries.includes(entry)));
		if (!removed.size) {
			list();
			return;
		}
		processingControls?.cancel();
		loadController?.abort();
		loadController = null;
		revision++;
		for (const entry of removed) {
			selectedCloudEntries.delete(entry);
			cached.forget(entry.file);
			entry.columnView = null;
		}
		entries = entries.filter((entry) => !removed.has(entry));
		displayedItems = displayedItems.filter((item) => !removed.has(item.entry));
		const keys = new Set([...removed].map((entry) => entry.file));
		viewers.forEach((viewer) => viewer.forgetClouds(keys));
		if (selectedCloudEntries.size) applyCloudSelection();
		else clear();
	}
	function updateCloudModeUI(filtered) {
		if (isWire) return;
		const multiple = cloudMode === "multiple";
		$("cloud-mode-select").value = cloudMode;
		for (const button of document.querySelectorAll("[data-cloud-mode]")) {
			const selected = button.dataset.cloudMode === cloudMode;
			button.classList.toggle("active", selected);
			button.setAttribute("aria-pressed", String(selected));
		}
		$("cloud-mode-note").textContent = multiple ? t("勾选多个文件，按原始坐标叠加。") : t("点击文件切换显示；每次只显示一个点云。");
		for (const id of ["select-all-clouds", "invert-cloud-selection"]) $(id).disabled = !multiple || !filtered.length;
		$("cloud-batch-scope").textContent = !multiple ? t("全选、反选仅在多点云模式下可用。") : $("search").value.trim() ? t("仅操作匹配的 {0} 个文件，保留筛选外选择。", [pretty(filtered.length)]) : t("全选与反选包含收起文件夹内的点云。", []);
		$("empty-state").querySelector("p").textContent = multiple ? t("添加点云文件或文件夹，再勾选左侧一个或多个文件。") : t("添加点云文件或文件夹，再点击左侧要查看的文件。");
	}
	function setCloudMode(mode) {
		if (isWire || !["single", "multiple"].includes(mode) || mode === cloudMode) return;
		cloudMode = mode;
		if (mode === "single" && selectedCloudEntries.size > 1) {
			const keep = selectedCloudEntries.has(lastCloudEntry) ? lastCloudEntry : [...selectedCloudEntries].at(-1);
			selectedCloudEntries.clear();
			selectedCloudEntries.add(keep);
			applyCloudSelection(keep);
		} else list();
	}
	function batchCloudSelection(invert = false) {
		if (isWire || cloudMode !== "multiple") return;
		let changed = false, preferred = null;
		for (const entry of matchingEntries()) if (invert && selectedCloudEntries.has(entry)) {
			selectedCloudEntries.delete(entry);
			changed = true;
		} else if (!selectedCloudEntries.has(entry)) {
			selectedCloudEntries.add(entry);
			preferred = entry;
			changed = true;
		}
		if (changed) applyCloudSelection(preferred);
	}
	function updateCloudSelection() {
		if (isWire) return;
		const container = $("cloud-selection");
		container.replaceChildren();
		container.hidden = !selectedCloudEntries.size;
		for (const entry of selectedCloudEntries) {
			const source = loaded.cloud?.sources?.find((source) => source.name === entry.id);
			const chip = document.createElement("span");
			chip.className = "cloud-chip";
			const dot = document.createElement("i");
			dot.className = "cloud-source-dot";
			dot.setAttribute("aria-hidden", "true");
			if (entry.displayColor) dot.style.background = entry.displayColor;
			else if (source?.color) dot.style.background = `rgb(${source.color.map((value) => Math.round(value * 255)).join(",")})`;
			const title = document.createElement("span");
			title.textContent = entry.id;
			title.title = source ? t("{0} · {1} / {2} 点；色标对应“按文件”着色", [
				entry.id,
				pretty(source.count),
				pretty(source.totalCount)
			]) : entry.id;
			const remove = document.createElement("button");
			remove.textContent = "×";
			remove.setAttribute("aria-label", t("取消显示 {0}", [entry.id]));
			remove.onclick = () => removeCloud(entry);
			chip.append(dot, title, remove);
			container.append(chip);
		}
	}
	async function loadCloudSelection({ preserveCamera = cameraControls?.preserveView ?? true } = {}) {
		if (!selectedCloudEntries.size) {
			clear();
			return;
		}
		processingControls?.cancel();
		loadController?.abort();
		const controller = new AbortController();
		loadController = controller;
		processingControls?.refresh([...selectedCloudEntries], true);
		const version = ++revision, selection = [...selectedCloudEntries];
		const maxPoints = Number($("point-limit").value);
		cached.setActive(selection.map((entry) => entry.file));
		let snapshot = preserveCamera ? captureView() : null;
		const before = { ...cached.stats };
		syncEnabled = false;
		const batchProgress = createBatchProgress($("loading"), {
			total: selection.length,
			unit: "个点云",
			current: () => version === revision
		});
		$("loading").hidden = false;
		$("empty-state").hidden = true;
		$("screenshot").disabled = true;
		error("");
		$("current-title").textContent = selection.length === 1 ? selection[0].id : t("{0} 个点云叠加", [selection.length]);
		const items = [], failures = [];
		try {
			for (const [index, entry] of selection.entries()) {
				if (version !== revision) return;
				try {
					const cloud = await read(entry.file, "cloud", {
						maxPoints,
						signal: controller.signal
					});
					items.push({
						key: entry.file,
						name: entry.id,
						entry,
						rawCloud: cloud,
						cloud: prepareColumns(entry, cloud)
					});
				} catch (cause) {
					if (version !== revision) return;
					failures.push(`${entry.id}：${cause.message}`);
				}
				batchProgress.report(index + 1, failures.length);
			}
			if (version !== revision) return;
			batchProgress.prepare();
			const description = describePointClouds(items);
			snapshot = preserveCamera ? captureView() : null;
			initViewers();
			viewers[0].setClouds(items.map((item, index) => ({
				...item,
				color: description.sources[index].color,
				displayColor: item.entry.displayColor
			})), { preserveView: false });
			displayedItems = items;
			columnsControls?.refresh();
			cloudColors?.refresh();
			loaded.cloud = description;
			loaded.wire = null;
			loadedWires = [];
			items.map((item) => item.name);
			currentPointName = compactNames(items.map((item) => item.name));
			messages = [...loaded.cloud?.notes || []];
			messages.push(maxPoints ? t("每个文件最多显示 {0} 点，增减选择不会改变其他文件的采样。", [pretty(maxPoints)]) : t("全量读取 · 不设置读取点数上限。"));
			messages.push(t("本次解析 {0} 个文件，复用 {1} 个缓存。", [cached.stats.reads - before.reads, cached.stats.hits - before.hits]));
			fields();
			if (snapshot) restoreView(snapshot, viewers[0]);
			update();
			updateCloudSelection();
			cameraControls?.refresh();
			$("scene-stats").textContent = loaded.cloud ? t("{0} / {1} 个文件 · {2} / {3} 点", [
				items.length,
				selection.length,
				pretty(loaded.cloud.count),
				pretty(loaded.cloud.totalCount)
			]) : t("未加载可显示的数据");
			$("geometry-note").textContent = items.length > 1 ? t("{0} 个点云按原始 XYZ 坐标叠加", [items.length]) : currentPointName || t("未加载数据");
			$("empty-state").hidden = Boolean(loaded.cloud);
			$("screenshot").disabled = !loaded.cloud;
			if (failures.length) error(failures.join("；"));
		} catch (cause) {
			if (version === revision) error(t("显示失败：{0}", [cause.message]));
		} finally {
			if (version === revision) {
				$("loading").hidden = true;
				loadController = null;
				processingControls?.refresh([...selectedCloudEntries], false);
				mobileSession?.schedule();
			}
		}
	}
	function normalizeBounds(value) {
		const bounds = Array.isArray(value) && value.length === 2 ? value : value?.min && value?.max ? [value.min, value.max] : null;
		if (!bounds || bounds.some((point) => !point || point.length !== 3 || !Array.from(point).every(Number.isFinite))) return null;
		const result = bounds.map((point) => Array.from(point));
		return result[0].some((value, axis) => value > result[1][axis]) ? null : result;
	}
	function unionBounds(items) {
		const valid = items.map(normalizeBounds).filter(Boolean);
		if (!valid.length) return null;
		const low = [
			Infinity,
			Infinity,
			Infinity
		], high = [
			-Infinity,
			-Infinity,
			-Infinity
		];
		for (const bounds of valid) for (let axis = 0; axis < 3; axis++) {
			low[axis] = Math.min(low[axis], bounds[0][axis]);
			high[axis] = Math.max(high[axis], bounds[1][axis]);
		}
		return [low, high];
	}
	function captureView() {
		if (!viewers[0]?.bounds) return null;
		const viewer = viewers[0];
		return {
			camera: {
				...viewer.camera,
				pan: [...viewer.camera.pan]
			},
			projection: viewer.projection,
			distance: viewer.distance,
			fov: viewer.fov,
			near: viewer.near,
			worldTarget: viewer.target.map((value, axis) => value + viewer.origin[axis]),
			baseHeight: viewer.baseHeight
		};
	}
	function restoreView(snapshot, viewer) {
		if (!snapshot) return;
		viewer.stopNavigation();
		viewer.projection = snapshot.projection;
		viewer.distance = snapshot.distance;
		viewer.fov = snapshot.fov;
		viewer.near = snapshot.near;
		viewer.camera = {
			...snapshot.camera,
			pan: [...snapshot.camera.pan]
		};
		viewer.target = snapshot.worldTarget.map((value, axis) => value - viewer.origin[axis]);
		viewer.baseHeight = snapshot.baseHeight;
	}
	async function load({ preserveCamera = cameraControls?.preserveView ?? true } = {}) {
		if (!isWire) return loadCloudSelection({ preserveCamera });
		if (!active || !selectedWireEntries.size) {
			clear();
			return;
		}
		loadController?.abort();
		const controller = new AbortController();
		loadController = controller;
		const version = ++revision, selection = [...selectedWireEntries], count = activeViewerCount();
		const plans = selection.map((entry) => ({
			entry,
			files: selectFiles(entry)
		}));
		cached.setActive(plans.flatMap(({ files }) => [files.cloud, ...files.wires]));
		const before = { ...cached.stats }, failures = [], cloudItems = [], wireGroups = Array.from({ length: count }, () => []);
		const panelNames = Array.from({ length: count }, () => []);
		let viewSnapshot = preserveCamera ? captureView() : null;
		syncEnabled = false;
		const batchProgress = createBatchProgress($("loading"), {
			total: selection.length,
			unit: "个对象",
			current: () => version === revision
		});
		$("loading").hidden = false;
		$("empty-state").hidden = true;
		$("screenshot").disabled = true;
		error("");
		$("current-title").textContent = selection.length === 1 ? t("对象 {0}", [active.id]) : t("{0} 个 ID 叠加", [selection.length]);
		$("scene-stats").textContent = t("正在读取所选文件…");
		try {
			let completed = 0, failedItems = 0;
			for (const { entry, files } of plans) {
				if (version !== revision) return;
				const results = await Promise.allSettled([read(files.cloud, "cloud", { signal: controller.signal }), ...files.wires.map((file) => read(file, "wire", { signal: controller.signal }))]);
				if (version !== revision) return;
				if (results.some((result) => result.status === "rejected")) failedItems++;
				batchProgress.report(++completed, failedItems);
				const value = (result, file) => {
					if (result.status === "fulfilled") return result.value;
					failures.push(`${entry.id} / ${file?.name || ""}：${result.reason?.message || result.reason}`);
					return null;
				};
				const cloud = value(results[0], files.cloud);
				if (cloud) cloudItems.push({
					key: files.cloud,
					name: `${entry.id} / ${files.cloud.name}`,
					cloud
				});
				results.slice(1).forEach((result, index) => {
					const wire = value(result, files.wires[index]);
					if (wire) {
						wireGroups[index].push(wire);
						panelNames[index].push(`${entry.id} / ${files.wires[index].name}`);
					}
				});
			}
			if (version !== revision) return;
			batchProgress.prepare();
			viewSnapshot = preserveCamera ? captureView() : null;
			loadedWires = wireGroups.map(combineWireframes);
			loaded.wire = loadedWires[0] || null;
			loaded.cloud = cloudItems.length === 1 ? cloudItems[0].cloud : describePointClouds(cloudItems);
			plans.find((plan) => plan.entry === active)?.files;
			currentPointName = compactNames(cloudItems.map((item) => item.name));
			messages = [...loaded.cloud?.notes || [], t("本次解析 {0} 个文件，复用 {1} 个缓存。", [cached.stats.reads - before.reads, cached.stats.hits - before.hits])];
			initViewers();
			fields();
			const sharedBounds = unionBounds([...cloudItems.map((item) => item.cloud.bounds), ...loadedWires.map((wire) => wire?.bounds)]);
			const commonOrigin = sharedBounds ? sharedBounds[0].map((value, axis) => value + (sharedBounds[1][axis] - value) / 2) : null;
			pauseSync(() => viewers.forEach((viewer, index) => {
				if (index < count) viewer.setClouds(cloudItems, {
					wire: loadedWires[index],
					bounds: sharedBounds,
					origin: commonOrigin,
					preserveView: false
				});
				else viewer.setData({});
			}));
			if (viewSnapshot) viewers.slice(0, count).forEach((viewer) => restoreView(viewSnapshot, viewer));
			syncEnabled = count > 1;
			update();
			cameraControls?.refresh();
			for (let index = 0; index < 3; index++) {
				const wire = loadedWires[index];
				setNameSummary($(`panel-label-${index + 1}`), panelNames[index], t("未加载线框"));
				$(`panel-stats-${index + 1}`).textContent = wire ? t("{0} 条线", [pretty(wire.edges.length)]) : "—";
				$(`panel-empty-${index + 1}`).hidden = !(index < count && wire && !wire.edges.length);
			}
			const edges = loadedWires.reduce((sum, wire) => sum + (wire?.edges.length || 0), 0);
			$("scene-stats").textContent = t("{0} 个 ID · {1} 条线 · {2} 点", [
				selection.length,
				pretty(edges),
				pretty(loaded.cloud?.count || 0)
			]);
			setNameSummary($("geometry-note"), panelNames[0].length ? panelNames[0] : cloudItems.map((item) => item.name), t("未加载数据"));
			const hasLoaded = Boolean(cloudItems.length || loadedWires.some((wire) => wire?.edges.length));
			$("empty-state").hidden = hasLoaded;
			$("screenshot").disabled = !hasLoaded;
			if (failures.length) error(failures.join("；"));
		} catch (cause) {
			if (version === revision) error(t("显示失败：{0}", [cause.message]));
		} finally {
			if (version === revision) {
				$("loading").hidden = true;
				loadController = null;
				mobileSession?.schedule();
			}
		}
	}
	function columnFieldLabel(key) {
		if (isWire) return fieldLabel(key);
		const settings = displayedItems[0]?.cloud.semantics;
		const tag = settings?.tags[key];
		const label = tag === "custom" ? settings.custom[key] : {
			red: t("颜色 R"),
			green: t("颜色 G"),
			blue: t("颜色 B"),
			hue: t("颜色 H"),
			saturation: t("颜色 S"),
			value: t("颜色 V"),
			nx: t("法向量 X"),
			ny: t("法向量 Y"),
			nz: t("法向量 Z"),
			intensity: t("强度"),
			classification: t("分类"),
			return_number: t("回波编号"),
			gps_time: t("GPS 时间")
		}[tag];
		return label ? `${label} · ${fieldLabel(key)}` : fieldLabel(key);
	}
	function fields() {
		const cloud = loaded.cloud, keys = Object.keys(cloud?.fields || {}), color = $("color-mode"), old = color.value;
		color.replaceChildren();
		option(color, "height", t("高度 Z"));
		option(color, "solid", t("单色"));
		if (cloud?.sources?.length) option(color, "file", t("按文件"));
		if (cloud?.rgb) option(color, "rgb", isWire ? t("原始 RGB") : t("已标记颜色（RGB / HSV）"));
		if (isWire && keys.length >= 3) option(color, "custom-rgb", t("指定 RGB 列…"));
		keys.filter((key) => ![
			"x",
			"y",
			"z",
			"rgb",
			"rgba"
		].includes(key.toLowerCase())).forEach((key) => option(color, `field:${key}`, columnFieldLabel(key)));
		color.value = [...color.options].some((item) => item.value === old) ? old : "height";
		const extra = keys.filter((key) => ![
			"x",
			"y",
			"z"
		].includes(key.toLowerCase()));
		[
			"rgb-r",
			"rgb-g",
			"rgb-b"
		].forEach((id, index) => {
			const select = $(id), previous = select.value;
			select.replaceChildren();
			keys.forEach((key) => option(select, key, columnFieldLabel(key)));
			select.value = keys.includes(previous) ? previous : extra[index] || keys[index] || "";
		});
		$("rgb-fields").hidden = color.value !== "custom-rgb";
	}
	function update() {
		const color = $("color-mode").value;
		options = {
			...options,
			...paletteControls?.getOptions(),
			showPoints: $("show-points").checked,
			showWire: isWire && $("show-wire").checked,
			grid: $("show-grid").checked,
			pointSize: Number($("point-size").value),
			pointOpacity: Number($("point-opacity").value),
			pointColor: $("point-color").value,
			wireColor: $("wire-color").value,
			colorMode: color === "custom-rgb" ? "rgb" : color,
			rgbFields: color === "custom-rgb" ? [
				"rgb-r",
				"rgb-g",
				"rgb-b"
			].map((id) => $(id).value) : null
		};
		$("point-color").disabled = color !== "solid";
		$("rgb-fields").hidden = color !== "custom-rgb";
		$("point-size-value").value = String(options.pointSize);
		$("point-opacity-value").value = `${Math.round(options.pointOpacity * 100)}%`;
		pauseSync(() => viewers.forEach((viewer) => viewer.setOptions(options)));
		viewers[0]?.render();
		const state = viewers[0]?.getState(), range = state?.colorRange;
		paletteControls?.setScalarEnabled(color === "height" || color.startsWith("field:"));
		paletteControls?.setDataRange(state?.dataRange || range);
		$("color-legend").querySelector("i").style.background = paletteGradient(options.palette, options.reverse);
		$("color-legend").hidden = !(loaded.cloud && options.showPoints && range);
		$("color-name").textContent = $("color-mode").selectedOptions[0]?.textContent || "";
		$("color-min").textContent = compact(range?.min);
		$("color-max").textContent = compact(range?.max);
		const notes = messages.slice();
		for (const item of displayedItems) if (item.cloud.colorIssue) notes.push(`${item.name}：${item.cloud.colorIssue}`);
		if (state?.colorFallback) notes.push(state.colorFallback);
		$("data-notes").textContent = notes.join(" ");
	}
	function preventDuplicateSelection(changed) {
		if (!isWire || !$("compare-mode").checked || changed.value === "") return;
		const selects = [
			$("wire-file"),
			$("wire-file-2"),
			$("wire-file-3")
		].slice(0, activeViewerCount());
		const others = new Set(selects.filter((select) => select !== changed).map((select) => select.value).filter(Boolean));
		if (!others.has(changed.value)) return;
		changed.value = [...changed.options].find((item) => item.value && !others.has(item.value))?.value || "";
		error(t("并排对比需要选择不同的线框文件，已自动改为其他可用文件。"));
	}
	if (!isWire) projectControls = mountProjectTree({
		project: pointProject,
		container: $("data-list"),
		root: $("project-root"),
		controls: $("project-controls"),
		getEntries: () => entries,
		getSelected: () => selectedCloudEntries,
		getMode: () => cloudMode,
		getQuery: () => $("search").value,
		onToggle: (entry) => cloudMode === "single" && selectedCloudEntries.has(entry) ? removeCloud(entry) : toggleCloud(entry),
		onRemove: deleteProjectEntries,
		onChange: list,
		detail: (entry) => entry.file.generatedCloud ? t("结果") : formatSize(entry.file.size),
		selectionHint: "勾选后用于显示、计算与合并",
		onVisibility: (members, checked) => {
			if (checked && cloudMode === "single") {
				if (members.length !== 1) return;
				selectedCloudEntries.clear();
			}
			for (const entry of members) checked ? selectedCloudEntries.add(entry) : selectedCloudEntries.delete(entry);
			applyCloudSelection();
		},
		onGroupSelection: (members, checked) => {
			if (cloudMode !== "multiple") return;
			for (const entry of members) checked ? selectedCloudEntries.add(entry) : selectedCloudEntries.delete(entry);
			applyCloudSelection();
		}
	});
	if (isWire) projectControls = mountProjectTree({
		project: pointProject,
		container: $("data-list"),
		root: $("project-root"),
		controls: $("project-controls"),
		getEntries: () => entries,
		getSelected: () => selectedWireEntries,
		getMode: () => wireMode,
		getQuery: () => $("search").value,
		onToggle: toggleWire,
		onRemove: removeWireEntries,
		onChange: list,
		detail: (entry) => `${entry.wires.length} OBJ · ${entry.clouds.length} PC`,
		selectionHint: "勾选后显示该 ID 的线框与点云",
		onVisibility: (members, checked) => {
			if (checked && wireMode === "single") {
				if (members.length === 1) choose(members[0]);
				return;
			}
			for (const entry of members) checked ? selectedWireEntries.add(entry) : selectedWireEntries.delete(entry);
			applyWireSelection();
		},
		onGroupSelection: (members, checked) => {
			if (wireMode !== "multiple") return;
			for (const entry of members) checked ? selectedWireEntries.add(entry) : selectedWireEntries.delete(entry);
			applyWireSelection();
		}
	});
	const importRecords = archiveImportQueue({
		accepts: (name) => pointExtension.test(name) || isWire && /\.obj$/i.test(name),
		receive: (records) => receive(records.map((item) => item.file), true, new Map(records.map((item) => [item.file, item.path]))),
		onProgress: (message) => {
			$("drop-status").hidden = false;
			$("drop-status").textContent = message;
		},
		onError: error
	});
	const pickFiles = (event) => {
		const records = Array.from(event.target.files, (file) => ({
			file,
			path: file.webkitRelativePath || file.name
		}));
		event.target.value = "";
		importRecords(records).catch(() => {});
	};
	if (!isWire) mountPointDrop({
		zone: $("point-drop-zone"),
		status: $("drop-status"),
		accepts: (name) => pointExtension.test(name) || /\.zip$/i.test(name),
		onFiles: importRecords
	});
	$("choose-folder").onclick = () => $("folder-input").click();
	$("folder-input").onchange = pickFiles;
	$("choose-file").onclick = () => $("file-input").click();
	$("file-input").onchange = pickFiles;
	$("attach-cloud").onclick = () => $("overlay-input").click();
	$("overlay-input").onchange = (event) => {
		const file = event.target.files[0];
		event.target.value = "";
		if (!file || !active) return;
		if (!pointExtension.test(file.name)) {
			error(t("请选择支持的点云文件"));
			return;
		}
		overlay = file;
		const select = $("cloud-file");
		select.querySelector("option[value=\"overlay\"]")?.remove();
		option(select, "overlay", t("{0}（另选）", [file.name]));
		select.disabled = false;
		select.value = "overlay";
		load();
	};
	$("search").oninput = () => {
		list();
	};
	$("clear-selection").onclick = clear;
	$("dismiss-error").onclick = () => error("");
	if (!isWire) {
		for (const button of document.querySelectorAll("[data-cloud-mode]")) button.onclick = () => setCloudMode(button.dataset.cloudMode);
		$("cloud-mode-select").onchange = (event) => setCloudMode(event.target.value);
		$("select-all-clouds").onclick = () => batchCloudSelection();
		$("invert-cloud-selection").onclick = () => batchCloudSelection(true);
	}
	$("wire-file").onchange = (event) => {
		preventDuplicateSelection(event.target);
		if (isWire) rememberWireChoices(event.target.id);
		load();
	};
	$("cloud-file").onchange = () => {
		if (isWire) rememberWireChoices("cloud-file");
		load();
	};
	$("point-limit").onchange = () => {
		if (active) load();
	};
	if (isWire) {
		$("wire-mode-select").onchange = (event) => setWireMode(event.target.value);
		$("select-all-wires").onclick = () => batchWireSelection();
		$("invert-wire-selection").onclick = () => batchWireSelection(true);
		$("previous-wire-id").onclick = () => navigateWire(-1);
		$("next-wire-id").onclick = () => navigateWire(1);
		for (const id of ["wire-file-2", "wire-file-3"]) $(id).onchange = (event) => {
			preventDuplicateSelection(event.target);
			rememberWireChoices(event.target.id);
			load();
		};
		$("wire-sync-camera").onchange = () => {
			if ($("wire-sync-camera").checked) comparison.sync();
		};
		$("wire-compare-layout").onchange = () => {
			const count = Number($("wire-compare-layout").value);
			$("compare-mode").checked = count > 1;
			$("compare-count").value = String(Math.max(2, count));
			rememberWireChoices();
			setComparisonUI();
			load({ preserveCamera: false });
		};
		$("compare-mode").onchange = () => {
			rememberWireChoices("compare-mode");
			setComparisonUI();
			load({ preserveCamera: true });
		};
		$("compare-count").onchange = () => {
			rememberWireChoices("compare-count");
			setComparisonUI();
			load({ preserveCamera: true });
		};
	}
	for (const id of [
		"color-mode",
		"show-points",
		"show-wire",
		"show-grid",
		"point-color",
		"wire-color",
		"rgb-r",
		"rgb-g",
		"rgb-b"
	]) $(id).onchange = update;
	for (const id of ["point-size", "point-opacity"]) $(id).oninput = update;
	$("fit-view").onclick = () => viewers[0]?.fit();
	$("zoom-in").onclick = () => viewers[0]?.zoomBy(1.2);
	$("zoom-out").onclick = () => viewers[0]?.zoomBy(1 / 1.2);
	for (const button of document.querySelectorAll("[data-view]")) button.onclick = () => {
		viewers[0]?.setView(button.dataset.view);
		for (const other of document.querySelectorAll("[data-view]")) {
			other.classList.toggle("active", other === button);
			other.setAttribute("aria-pressed", String(other === button));
		}
	};
	document.addEventListener("keydown", (event) => {
		const direction = isWire ? wireNavigationDirection(event, {
			multiple: wireMode === "multiple",
			flying: viewers.some((viewer) => viewer.fly?.active)
		}) : 0;
		if (direction) {
			event.preventDefault();
			navigateWire(direction);
			return;
		}
		if (![
			"INPUT",
			"SELECT",
			"TEXTAREA",
			"BUTTON"
		].includes(event.target.tagName) && event.key.toLowerCase() === "f") {
			event.preventDefault();
			viewers[0]?.fit();
		}
	});
	try {
		initViewers();
		paletteControls = mountPaletteControls({
			container: $("palette-controls"),
			getOptions: () => options,
			onChange: update
		});
		cameraControls = mountCameraControls({
			container: $("camera-controls"),
			bookmarkContainer: $("bookmark-controls"),
			getViewers: () => viewers.slice(0, activeViewerCount()),
			space: "raw-world",
			getScene: () => ({ ids: isWire ? [...selectedWireEntries].map((entry) => entry.id) : [...selectedCloudEntries].map((entry) => entry.id) }),
			pauseSync
		});
		if (!isWire) processingControls = mountPointProcessing({
			container: $("processing-controls"),
			getSelection: () => {
				if (loadController) throw Error(t("请等待点云加载完成后再处理"));
				const selection = [...selectedCloudEntries];
				if (selection.some((entry) => !displayedItems.some((item) => item.key === entry.file))) throw Error(t("有文件加载失败，请取消勾选失败的文件后重试"));
				return selection;
			},
			readCloud: async (entry, scope, signal, onProgress) => {
				signal.throwIfAborted();
				if (scope === "display") return displayedItems.find((item) => item.key === entry.file)?.cloud;
				if (entry.file.generatedCloud) return prepareColumns(entry, entry.file.generatedCloud);
				const record = cached.records.get(entry.file);
				if (record && record.value.count === record.value.totalCount) return prepareColumns(entry, record.value);
				return semanticPointCloud(await readPointCloud(entry.file, {
					maxPoints: 0,
					signal,
					onProgress
				}), entry.columnSettings);
			},
			addResults: async (results) => {
				selectedCloudEntries.clear();
				for (const result of results) {
					const serial = ++resultSerial;
					let file = {
						name: result.name,
						size: cached.bytes(result.cloud),
						generatedCloud: result.cloud
					}, entryId = `${result.name} #${serial}`;
					if (isMobileApp()) {
						const id = new URL(location.href).searchParams.get("project"), path = `Processed/${Date.now()}-${serial}.ply`, writer = await nativeExportWriter(path.split("/").at(-1));
						try {
							await writePointExport([{
								name: result.name,
								cloud: result.cloud
							}], {
								format: "ply",
								sourceIds: false,
								write: writer.write
							});
							const record = await writer.commit(id, path);
							file = new NativeProjectFile(id, record);
							entryId = path;
							mobileKnownIds.push(entryId);
						} catch (error) {
							await writer.abort().catch(() => {});
							throw error;
						}
					}
					const entry = {
						id: entryId,
						key: `generated:${serial}`,
						file
					};
					entry.group = result.source?.group || "";
					entry.treeName = t("{0} · 特征 #{1}", [result.source?.treeName || result.name, serial]);
					if (entry.group) pointProject.groups.get(entry.group).collapsed = false;
					entries.push(entry);
					selectedCloudEntries.add(entry);
					lastCloudEntry = entry;
				}
				if (results.length > 1) cloudMode = "multiple";
				$("source-note").textContent = t("已列出 {0} 个条目 · 计算结果请导出保存", [pretty(entries.length)]);
				active = lastCloudEntry;
				$("search").value = "";
				list();
				await loadCloudSelection();
				const mapping = results[0]?.cloud.featureMapping || {};
				const field = mapping.slope || mapping.planarity || mapping.roughness || mapping.nz;
				if (field) {
					$("color-mode").value = `field:${field}`;
					update();
				}
			}
		});
		if (!isWire) columnsControls = mountPointColumns({
			container: $("column-controls"),
			getItems: () => displayedItems.filter((item) => selectedCloudEntries.has(item.entry)),
			getSettings: columnSettings,
			applySettings: async (entry, settings) => {
				if (loadController) throw Error(t("请等待点云加载完成"));
				const item = displayedItems.find((item) => item.entry === entry);
				if (!item) throw Error(t("请重新选择点云"));
				semanticPointCloud(item.rawCloud, settings, { strict: true });
				processingControls?.cancel();
				entry.columnSettings = settings;
				entry.columnView = null;
				await loadCloudSelection({ preserveCamera: true });
			}
		});
		mountViewerLayout({
			getViewers: () => viewers,
			pauseSync
		});
		if (!isWire) cloudColors = mountCloudColors({
			container: $("settings-panel-display"),
			getItems: () => displayedItems,
			onChange: () => {
				for (const viewer of viewers) for (const entry of viewer.activeClouds || []) entry.item.displayColor = entry.item.entry?.displayColor;
				pauseSync(() => viewers.forEach((viewer) => viewer.render()));
				updateCloudSelection();
			}
		});
		if (isWire) mountPointDrop({
			zone: document.querySelector(".sidebar"),
			status: $("drop-status"),
			accepts: (name) => /\.(obj|zip)$/i.test(name) || pointExtension.test(name),
			onFiles: importRecords
		});
		clear();
		update();
		if (!isWire && new URLSearchParams(location.search).get("generated") === "1") genTakeHandoff().then((files) => {
			const url = new URL(location.href);
			url.searchParams.delete("generated");
			history.replaceState(null, "", url.pathname + url.search + url.hash);
			if (!files?.length) {
				error(t("没有找到刚生成的点云，请从点云生成页重新打开。"));
				return;
			}
			const list = files.map((item) => new File([item.buffer], item.name, { type: "application/octet-stream" }));
			const added = new Set(list);
			receiveCloudFiles(list, false);
			selectedCloudEntries.clear();
			for (const entry of entries) if (added.has(entry.file)) selectedCloudEntries.add(entry);
			if (selectedCloudEntries.size) applyCloudSelection();
			else error(t("没有找到刚生成的点云，请从点云生成页重新打开。"));
		}).catch((cause) => error(cause.message || t("没有找到刚生成的点云，请从点云生成页重新打开。")));
		mountMobileProject({
			receive: importRecords,
			getState: () => ({
				objectImportVersion: 2,
				tree: {
					...snapshotProjectTree(pointProject, entries),
					knownIds: mobileKnownIds
				},
				selected: [...isWire ? selectedWireEntries : selectedCloudEntries].map((e) => e.id),
				active: active?.id,
				cloudMode,
				wireMode,
				wirePreferences,
				inputs: captureMobileInputs(),
				wire: isWire ? Object.fromEntries([
					"wire-file",
					"wire-file-2",
					"wire-file-3",
					"cloud-file",
					"compare-mode",
					"compare-count"
				].map((id) => [id, $(id).type === "checkbox" ? $(id).checked : $(id).value])) : null,
				camera: loaded.cloud || loaded.wire ? cameraControls?.capture() : null
			}),
			restoreState: async (state, records) => {
				if (isWire) state = migrateObjectImportState(state, records, entries, "wire");
				mobileKnownIds = [.../* @__PURE__ */ new Set([...state?.tree?.knownIds || [], ...entries.map((e) => e.id)])];
				if (state) {
					entries = restoreProjectTree(pointProject, entries, state.tree);
					cloudMode = state.cloudMode === "single" ? "single" : "multiple";
					const limit = state.inputs?.find((x) => x.id === "point-limit");
					if (limit) $("point-limit").value = limit.value;
					if (isWire) {
						wireMode = state.wireMode === "multiple" ? "multiple" : "single";
						if (state.wirePreferences?.wires?.length === 3) wirePreferences = normalizeWirePreferences(state.wirePreferences);
						selectedWireEntries.clear();
						const saved = wireMode === "multiple" ? state.selected || [state.active] : [state.active];
						for (const id of saved) {
							const entry = entries.find((e) => e.id === id);
							if (entry) selectedWireEntries.add(entry);
						}
						active = entries.find((e) => e.id === state.active) || [...selectedWireEntries].at(-1) || null;
						if (active) {
							configureWireChoices(active);
							if (!state.wirePreferences) {
								for (const [id, value] of Object.entries(state.wire || {})) {
									if (!$(id)) continue;
									if ($(id).type === "checkbox") $(id).checked = Boolean(value);
									else $(id).value = String(value);
								}
								rememberWireChoices();
							}
							await applyWireSelection(active);
						}
					} else {
						selectedCloudEntries.clear();
						for (const id of state.selected || []) {
							const entry = entries.find((e) => e.id === id);
							if (entry) selectedCloudEntries.add(entry);
						}
						if (selectedCloudEntries.size) await loadCloudSelection();
					}
					restoreMobileInputs(state.inputs);
					update();
					if (state.camera && (loaded.cloud || loaded.wire)) cameraControls.restore(state.camera, { checkScene: false });
				}
				const handoff = new URL(location.href), batch = handoff.searchParams.get("studio");
				if (!isWire && batch && /^[a-z0-9]+$/.test(batch)) {
					selectedCloudEntries.clear();
					for (const entry of entries) if (entry.file?.webkitRelativePath?.startsWith(`studio/${batch}/`)) selectedCloudEntries.add(entry);
					cloudMode = "multiple";
					if (selectedCloudEntries.size) await loadCloudSelection();
					handoff.searchParams.delete("studio");
					history.replaceState(null, "", handoff.pathname + handoff.search + handoff.hash);
				}
				list();
				$("source-note").textContent = t("项目自动保存在此设备");
			},
			onBackground: () => {
				processingControls?.cancel();
				for (const [file] of cached.records) if (!cached.active.has(file)) cached.forget(file);
			}
		}).then((session) => {
			mobileSession = session;
		});
	} catch (cause) {
		error(cause.message);
	}
})();
//#endregion
