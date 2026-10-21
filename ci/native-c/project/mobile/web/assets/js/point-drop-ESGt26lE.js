import { a as t } from "./i18n-B_brH6cQ.js";
//#region src/shared/project-model.js
var ViewerProject = class {
	constructor() {
		this.groups = /* @__PURE__ */ new Map();
		this.serial = 0;
	}
	create(name, parent = "") {
		name = name.trim();
		if (!name || /[/\\\x00-\x1f]/.test(name)) throw Error(t("请输入文件夹名称，不含斜线或控制字符"));
		if (parent && !this.groups.has(parent)) throw Error(t("目标文件夹已不存在"));
		if ([...this.groups.values()].some((group) => group.parent === parent && group.name === name)) throw Error(t("此位置已有同名文件夹"));
		const group = {
			id: `group:${++this.serial}`,
			name,
			parent,
			collapsed: false
		};
		this.groups.set(group.id, group);
		return group.id;
	}
	assign(entry, path) {
		const parts = path.split("/").filter(Boolean);
		entry.treeName = parts.pop() || entry.id;
		let parent = "";
		for (const name of parts) parent = [...this.groups.values()].find((group) => group.parent === parent && group.name === name)?.id || this.create(name, parent);
		entry.group = parent;
	}
	within(groupId, ancestor) {
		if (!ancestor) return true;
		for (let group = this.groups.get(groupId); group; group = this.groups.get(group.parent)) if (group.id === ancestor) return true;
		return false;
	}
	path(id) {
		const parts = [];
		for (let group = this.groups.get(id); group; group = this.groups.get(group.parent)) parts.unshift(group.name);
		return parts.join("/");
	}
	members(id, entries) {
		return entries.filter((entry) => this.within(entry.group, id));
	}
	move(target, parent) {
		if (parent && !this.groups.has(parent)) throw Error(t("目标文件夹已不存在"));
		if (typeof target === "string") {
			const group = this.groups.get(target);
			if (!group) throw Error(t("文件夹已不存在"));
			if (this.within(parent, target)) throw Error(t("不能移动到自身或其子文件夹"));
			if ([...this.groups.values()].some((other) => other.id !== target && other.parent === parent && other.name === group.name)) throw Error(t("目标位置已有同名文件夹"));
			group.parent = parent;
		} else target.group = parent;
		if (parent) this.groups.get(parent).collapsed = false;
	}
	roots(targets) {
		const unique = [...new Set(targets)], groups = unique.filter((target) => typeof target === "string");
		return unique.filter((target) => !groups.some((group) => group !== target && this.within(typeof target === "string" ? this.groups.get(target)?.parent : target.group, group)));
	}
	files(targets, entries) {
		const selected = /* @__PURE__ */ new Set();
		for (const target of this.roots(targets)) for (const entry of typeof target === "string" ? this.members(target, entries) : [target]) if (entries.includes(entry)) selected.add(entry);
		return [...selected];
	}
	moveMany(targets, parent) {
		const roots = this.roots(targets);
		if (parent && !this.groups.has(parent)) throw Error(t("目标文件夹已不存在"));
		const movingGroups = new Set(roots.filter((target) => typeof target === "string"));
		const names = new Set([...this.groups.values()].filter((group) => group.parent === parent && !movingGroups.has(group.id)).map((group) => group.name));
		for (const target of movingGroups) {
			const group = this.groups.get(target);
			if (!group) throw Error(t("文件夹已不存在"));
			if (this.within(parent, target)) throw Error(t("不能移动到自身或其子文件夹"));
			if (names.has(group.name)) throw Error(t("目标位置存在同名文件夹，本次移动未执行"));
			names.add(group.name);
		}
		for (const target of roots) this.move(target, parent);
		return roots;
	}
	removeGroup(id) {
		const removed = [...this.groups.keys()].filter((key) => this.within(key, id));
		for (const key of removed) this.groups.delete(key);
	}
	matches(entry, query) {
		return `${this.path(entry.group)}/${entry.treeName || entry.id} ${entry.id}`.toLowerCase().includes(query.toLowerCase().trim());
	}
};
var ProjectSelection = class {
	constructor() {
		this.items = /* @__PURE__ */ new Set();
		this.anchor = null;
	}
	select(target, { toggle = false, range = false, ordered = [] } = {}) {
		const from = ordered.indexOf(this.anchor), to = ordered.indexOf(target);
		if (range && from >= 0 && to >= 0) {
			if (!toggle) this.items.clear();
			ordered.slice(Math.min(from, to), Math.max(from, to) + 1).forEach((item) => this.items.add(item));
		} else {
			if (!toggle) this.items.clear();
			if (toggle && this.items.has(target)) this.items.delete(target);
			else this.items.add(target);
			this.anchor = target;
		}
	}
	box(hits, base = []) {
		this.items = /* @__PURE__ */ new Set([...base, ...hits]);
	}
	clear() {
		this.items.clear();
		this.anchor = null;
	}
};
function projectBoxIntersects(a, b) {
	return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
//#endregion
//#region src/shared/project-import.js
/** Import adapters preserve entry/File identity so tree edits do not invalidate render caches. */
function projectFilePath(file, paths) {
	return (paths?.get(file) || file.webkitRelativePath || file.name).replaceAll("\\", "/");
}
function projectFileKey(file, path) {
	return `${path}\0${file.size}\0${file.lastModified}`;
}
function projectUniqueId(base, names) {
	let id = base, suffix = 2;
	while (names.has(id)) id = `${base}_${suffix++}`;
	names.add(id);
	return id;
}
function appendLegacyLodFiles(entries, project, files, paths) {
	const keys = new Set(entries.map((entry) => entry.key)), names = new Set(entries.map((entry) => entry.id));
	let added = 0, duplicates = 0;
	for (const file of files) {
		if (!/\.obj$/i.test(file.name)) continue;
		const path = projectFilePath(file, paths), key = projectFileKey(file, path);
		if (keys.has(key)) {
			duplicates++;
			continue;
		}
		const base = file.name.replace(/\.obj$/i, ""), id = projectUniqueId(base, names);
		const entry = {
			id,
			key,
			file,
			bytes: file.size
		};
		project.assign(entry, path);
		if (id !== base) entry.treeName += ` [${id}]`;
		entries.push(entry);
		keys.add(key);
		added++;
	}
	return {
		added,
		duplicates
	};
}
function appendLegacyWireFiles(entries, project, files, paths) {
	const groups = new Map(entries.map((entry) => [entry.sourceGroup, entry]));
	const names = new Set(entries.map((entry) => entry.id));
	let added = 0, duplicates = 0;
	for (const file of files) {
		if (!/\.(obj|xyz|txt|csv|pts|ply|pcd)$/i.test(file.name)) continue;
		const path = projectFilePath(file, paths), parts = path.split("/");
		const sourceGroup = parts.slice(0, -1).join("/");
		let entry = groups.get(sourceGroup);
		if (!entry) {
			entry = {
				id: projectUniqueId(parts.length > 2 ? parts.slice(1, -1).join("/") : parts.length === 2 ? parts[0] : "Files", names),
				sourceGroup,
				wires: [],
				clouds: [],
				fileKeys: /* @__PURE__ */ new Set()
			};
			project.assign(entry, sourceGroup || "Files");
			entries.push(entry);
			groups.set(sourceGroup, entry);
		}
		const key = projectFileKey(file, path);
		if (entry.fileKeys.has(key)) {
			duplicates++;
			continue;
		}
		entry.fileKeys.add(key);
		entry[/\.obj$/i.test(file.name) ? "wires" : "clouds"].push(file);
		added++;
	}
	return {
		added,
		duplicates
	};
}
/** Numeric ID parents take precedence; flat numeric filenames remain separate at any depth. */
function objectFileSource(file, paths) {
	const path = projectFilePath(file, paths), parts = path.split("/").filter(Boolean);
	const stem = (parts.at(-1) || file.name).replace(/\.[^.]+$/, ""), directory = parts.slice(0, -1).join("/"), parent = parts.at(-2) || "";
	const generic = /^(?:mesh|model|raw|refined|final|reconstruction|wireframe|wire|pc|points?|point_cloud|cloud)(?:[_. -].*)?$/i.test(stem);
	const folder = !!directory && (/^\d+$/.test(parent) || !/^\d+$/.test(stem) && (parts.length > 2 || generic));
	const base = folder ? parts.length > 2 ? parts.slice(1, -1).join("/") : parent : stem;
	return {
		path,
		key: projectFileKey(file, path),
		identity: folder ? `folder:${directory}` : `file:${directory}/${stem}`,
		base,
		folder,
		sourceGroup: folder ? directory : [directory, stem].filter(Boolean).join("/"),
		treePath: folder ? directory : path.replace(/\.[^.]+$/, "")
	};
}
function appendObjectFiles(entries, project, files, paths, mesh) {
	const groups = new Map(entries.filter((e) => e.sourceIdentity).map((e) => [e.sourceIdentity, e])), names = new Set(entries.map((e) => e.id));
	let added = 0, duplicates = 0;
	for (const file of files) {
		if (!/\.(obj|xyz|txt|csv|pts|ply|pcd)$/i.test(file.name)) continue;
		const source = objectFileSource(file, paths);
		let entry = groups.get(source.identity);
		if (!entry) {
			entry = {
				id: projectUniqueId(source.base, names),
				sourceIdentity: source.identity,
				sourceGroup: source.sourceGroup,
				sourceLayout: source.folder ? "folder" : "file",
				files: [],
				wires: [],
				clouds: [],
				fileKeys: /* @__PURE__ */ new Set(),
				sourceKeys: /* @__PURE__ */ new Map()
			};
			project.assign(entry, source.treePath);
			if (entry.id !== source.base) entry.treeName += ` [${entry.id}]`;
			entries.push(entry);
			groups.set(source.identity, entry);
		}
		if (entry.fileKeys.has(source.key)) {
			duplicates++;
			continue;
		}
		entry.fileKeys.add(source.key);
		entry.sourceKeys.set(file, source.key);
		entry[/\.obj$/i.test(file.name) ? "wires" : "clouds"].push(file);
		if (mesh && /\.obj$/i.test(file.name)) {
			entry.files.push(file);
			if (!entry.file) {
				entry.file = file;
				entry.key = source.key;
				entry.bytes = file.size;
			}
		}
		added++;
	}
	return {
		added,
		duplicates
	};
}
function appendLodFiles(entries, project, files, paths) {
	return appendObjectFiles(entries, project, files, paths, true);
}
function appendWireFiles(entries, project, files, paths) {
	return appendObjectFiles(entries, project, files, paths, false);
}
//#endregion
//#region src/shared/batch-progress.js
/** Count complete items, never the current file's bytes. Failures are processed items too. */
function batchProgressState(done, total, { unit = "个对象", failed = 0, preparing = false } = {}) {
	total = Math.max(0, Math.floor(Number(total) || 0));
	done = Math.min(total, Math.max(0, Math.floor(Number(done) || 0)));
	failed = Math.min(done, Math.max(0, Math.floor(Number(failed) || 0)));
	const fraction = total ? done / total : 0;
	let text = t("已处理 {0} / {1} {2}", [
		done,
		total,
		t(unit)
	]);
	if (failed) text += t(" · {0} 项失败", [failed]);
	const summary = text + (preparing ? t(" · 正在准备画面…") : "");
	text = summary + (preparing ? "" : ` · ${Math.floor(fraction * 100)}%`);
	return {
		done,
		total,
		failed,
		fraction,
		text,
		summary
	};
}
function createBatchProgress(box, { total, unit = "个对象", current = () => true } = {}) {
	const doc = box.ownerDocument;
	let bar = box.querySelector("progress");
	if (!bar) {
		bar = doc.createElement("progress");
		box.append(bar);
	}
	bar.max = 1;
	bar.hidden = false;
	bar.setAttribute("aria-label", t("整批加载进度"));
	box.classList.add("has-progress");
	box.classList.add("batch-loading");
	let visual = box.querySelector(".batch-progress-visual");
	if (!visual) {
		const make = (className) => {
			const node = doc.createElement("div");
			node.className = className;
			return node;
		};
		visual = make("batch-progress-visual");
		visual.setAttribute("aria-hidden", "true");
		const track = make("batch-progress-track"), fill = make("batch-progress-fill"), badge = make("batch-progress-percent"), text = doc.createElement("span");
		text.className = "batch-progress-percent-text";
		const marker = make("batch-progress-marker");
		track.append(fill);
		badge.append(text);
		marker.append(badge);
		visual.append(track, marker);
		box.append(visual);
	}
	let completed = 0, failures = 0;
	const report = (done, failed = failures, preparing = false) => {
		if (!current()) return;
		completed = Math.max(completed, done);
		failures = Math.max(failures, failed);
		const state = batchProgressState(completed, total, {
			unit,
			failed: failures,
			preparing
		});
		box.querySelector("span").textContent = state.summary;
		bar.value = state.fraction;
		bar.setAttribute("aria-valuetext", state.text);
		visual.style.setProperty("--batch-progress", `${state.fraction * 100}%`);
		visual.querySelector(".batch-progress-percent-text").textContent = `${Math.floor(state.fraction * 100)}%`;
		return state;
	};
	report(0);
	return {
		report,
		prepare: () => report(total, failures, true)
	};
}
//#endregion
//#region src/shared/name-summary.js
/** Bounded labels for multi-file scenes; source names remain in the project tree. */
function compactNames(names, { maxItems = 2, maxChars = 96, separator = " + " } = {}) {
	const values = Array.from(names || [], (name) => String(name ?? "")).filter(Boolean);
	if (!values.length) return "";
	const shown = values.slice(0, maxItems), remaining = values.length - shown.length;
	const suffix = remaining ? ` … (+${remaining})` : "";
	const budget = Math.max(1, Math.floor((maxChars - Array.from(suffix).length - (shown.length - 1) * Array.from(separator).length) / shown.length));
	return shown.map((name) => {
		const points = Array.from(name);
		return points.length > budget ? points.slice(0, Math.max(0, budget - 1)).join("") + "…" : name;
	}).join(separator) + suffix;
}
function setNameSummary(element, names, empty = "") {
	element.textContent = compactNames(names) || empty;
	element.title = compactNames(names, {
		maxItems: 8,
		maxChars: 1024,
		separator: "\n"
	});
}
//#endregion
//#region src/shared/zip-import.js
/** Bounded local ZIP reader. File slices avoid retaining a second complete archive buffer. */
function safeArchivePath(name) {
	const path = String(name).replaceAll("\\", "/");
	if (!path || path.startsWith("/") || /^[a-z]:/i.test(path) || path.split("/").some((part) => part === ".." || part === ".") || /[\x00-\x1f]/.test(path)) throw Error(t("压缩包包含不安全的文件路径。"));
	return path;
}
function zipCRC32(bytes, previous = 0) {
	let crc = (previous ^ 4294967295) >>> 0;
	for (const byte of bytes) {
		crc ^= byte;
		for (let b = 0; b < 8; b++) crc = crc >>> 1 ^ (crc & 1 ? 3988292384 : 0);
	}
	return (crc ^ 4294967295) >>> 0;
}
async function readZipDirectory(file, { maxEntries = 1e4, maxBytes = 536870912 } = {}) {
	const tailStart = Math.max(0, file.size - 65557), tail = new Uint8Array(await file.slice(tailStart).arrayBuffer()), dv = new DataView(tail.buffer);
	let end = -1;
	for (let i = tail.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 101010256 && i + 22 + dv.getUint16(i + 20, true) === tail.length) {
		end = i;
		break;
	}
	if (end < 0) throw Error(t("无法读取 ZIP 目录，文件可能损坏。"));
	const count = dv.getUint16(end + 10, true), size = dv.getUint32(end + 12, true), offset = dv.getUint32(end + 16, true);
	if (dv.getUint16(end + 4, true) || dv.getUint16(end + 6, true) || count !== dv.getUint16(end + 8, true) || count === 65535 || size === 4294967295 || offset === 4294967295) throw Error(t("暂不支持分卷或 ZIP64 压缩包。"));
	if (count > maxEntries || size > 8388608 || offset + size > tailStart + end) throw Error(t("压缩包目录过大或无效。"));
	const bytes = new Uint8Array(await file.slice(offset, offset + size).arrayBuffer()), view = new DataView(bytes.buffer), entries = [], seen = /* @__PURE__ */ new Set();
	let at = 0, total = 0;
	for (let i = 0; i < count; i++) {
		if (at + 46 > size || view.getUint32(at, true) !== 33639248) throw Error(t("压缩包目录无效。"));
		const flags = view.getUint16(at + 8, true), method = view.getUint16(at + 10, true), crc = view.getUint32(at + 16, true), compressed = view.getUint32(at + 20, true), length = view.getUint32(at + 24, true);
		const nameSize = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true), local = view.getUint32(at + 42, true);
		if (at + 46 + nameSize + extra + comment > size || local + 30 > offset || view.getUint16(at + 34, true)) throw Error(t("压缩包目录无效。"));
		const rawName = bytes.subarray(at + 46, at + 46 + nameSize);
		let name;
		try {
			name = new TextDecoder("utf-8", { fatal: true }).decode(rawName);
		} catch {
			name = new TextDecoder("gb18030").decode(rawName);
		}
		const path = safeArchivePath(name);
		if (seen.has(path)) throw Error(t("压缩包包含重复路径。"));
		seen.add(path);
		if (length === 4294967295 || compressed === 4294967295 || (total += length) > maxBytes) throw Error(t("压缩包解压后超过 512 MB，请先解压后选择所需文件。"));
		entries.push({
			path,
			flags,
			method,
			crc,
			compressed,
			length,
			local,
			directory: offset
		});
		at += 46 + nameSize + extra + comment;
	}
	return entries;
}
async function extractZipEntry(archive, entry) {
	if (entry.flags & 1) throw Error(t("暂不支持加密压缩包，请先解压。"));
	if (![0, 8].includes(entry.method)) throw Error(t("仅支持 ZIP 的 Store / Deflate 压缩方式。"));
	const header = new DataView(await archive.slice(entry.local, entry.local + 30).arrayBuffer());
	if (header.getUint32(0, true) !== 67324752 || header.getUint16(8, true) !== entry.method || header.getUint16(6, true) !== entry.flags) throw Error(t("压缩包文件头无效。"));
	const start = entry.local + 30 + header.getUint16(26, true) + header.getUint16(28, true);
	if (start + entry.compressed > entry.directory) throw Error(t("压缩包文件范围无效。"));
	let stream = archive.slice(start, start + entry.compressed).stream();
	if (entry.method === 8) {
		let decoder;
		try {
			decoder = new DecompressionStream("deflate-raw");
		} catch {
			throw Error(t("当前浏览器不支持 ZIP 解压，请先在系统中解压。"));
		}
		stream = stream.pipeThrough(decoder);
	}
	const reader = stream.getReader(), chunks = [];
	let size = 0, crc = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > entry.length) throw Error(t("解压大小与目录不符。"));
			crc = zipCRC32(value, crc);
			chunks.push(value);
		}
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
	if (size !== entry.length || crc !== entry.crc) throw Error(t("压缩包校验失败，文件可能损坏。"));
	return new File(chunks, entry.path.split("/").at(-1), { lastModified: archive.lastModified || 0 });
}
async function expandProjectArchives(records, accepts, onProgress = () => {}) {
	const result = [];
	let total = 0;
	for (const record of records) {
		if (!/\.zip$/i.test(record.file.name)) {
			result.push(record);
			continue;
		}
		onProgress(t("正在读取压缩包…"));
		const entries = await readZipDirectory(record.file), base = safeArchivePath(record.path || record.file.name).replace(/\.zip$/i, "");
		for (const entry of entries) {
			if (entry.path.endsWith("/") || !accepts(entry.path) || entry.path.startsWith("__MACOSX/")) continue;
			if ((total += entry.length) > 536870912) throw Error(t("压缩包解压后超过 512 MB，请先解压后选择所需文件。"));
			onProgress(t("正在解压 {0}", [entry.path]));
			result.push({
				file: await extractZipEntry(record.file, entry),
				path: base + "/" + entry.path
			});
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	}
	return result;
}
/** Serializes import batches; failures never insert a partially extracted archive. */
function archiveImportQueue({ accepts, receive, onProgress = () => {}, onError = () => {} }) {
	let pending = Promise.resolve();
	return (records) => {
		const job = pending.then(async () => {
			const result = await receive(await expandProjectArchives(records, accepts, onProgress));
			onProgress(t("导入完成"));
			return result;
		});
		pending = job.catch(() => {});
		return job.catch((error) => {
			onError(error.message);
			throw error;
		});
	};
}
//#endregion
//#region src/shared/project-tree.js
function projectCanStartBox(event) {
	return event.button === 0 && (!event.pointerType || event.pointerType === "mouse") && !event.target.closest("button,input,label,select,textarea,a,.project-drag-handle");
}
function mountProjectTree({ project, container, root, controls, getEntries, getSelected, getMode, getQuery, onToggle, onGroupSelection, onVisibility, onRemove, onChange, detail = () => "", selectionHint = "勾选后显示数据" }) {
	const make = (tag, text, cls) => {
		const node = document.createElement(tag);
		if (text) node.textContent = text;
		if (cls) node.className = cls;
		return node;
	};
	const button = (text, label, fn) => {
		const node = make("button", text);
		node.type = "button";
		node.title = label;
		node.setAttribute("aria-label", label);
		node.onclick = fn;
		return node;
	};
	const dragType = "application/x-buildingwebviewer-node", management = new ProjectSelection();
	let focused = null, dragged = null, limit = 200, lastQuery = "", editorMode = null, editorTargets = [], rowTargets = /* @__PURE__ */ new Map(), visible = [];
	const tools = make("div", null, "project-tools");
	const createButton = button(t("+ 文件夹"), t("新建项目内文件夹"), () => openEditor("create"));
	const moveButton = button(t("移动"), t("移动选中条目"), () => openEditor("move"));
	const deleteButton = button(t("移除"), t("移除选中条目"), () => openEditor("remove"));
	tools.append(createButton, moveButton, deleteButton);
	const focusNote = make("p", "", "project-focus");
	const editor = make("form", null, "project-editor");
	editor.hidden = true;
	const editorTitle = make("strong"), nameInput = make("input");
	nameInput.placeholder = t("文件夹名称");
	nameInput.setAttribute("aria-label", t("新文件夹名称"));
	const destinations = make("select");
	destinations.setAttribute("aria-label", t("目标文件夹"));
	const editorNote = make("p"), actions = make("div", null, "project-editor-actions");
	const submit = make("button", t("确定"));
	submit.type = "submit";
	function closeEditor() {
		editorMode = null;
		editor.hidden = true;
		editorTargets = [];
	}
	const cancel = button(t("取消"), t("取消管理操作"), closeEditor);
	actions.append(submit, cancel);
	editor.append(editorTitle, nameInput, destinations, editorNote, actions);
	controls.append(tools, focusNote, editor);
	const status = make("p", null, "project-status");
	status.setAttribute("role", "status");
	controls.append(status);
	function label(target) {
		return typeof target === "string" ? project.path(target) : target?.treeName || target?.id || t("项目根目录");
	}
	function exists(target) {
		return typeof target === "string" ? project.groups.has(target) : getEntries().includes(target);
	}
	function paintSelection() {
		for (const [row, target] of rowTargets) {
			const selected = management.items.has(target);
			row.dataset.focused = String(selected);
			row.querySelector(".project-name").setAttribute("aria-pressed", String(selected));
		}
		moveButton.disabled = deleteButton.disabled = !management.items.size;
		focusNote.textContent = management.items.size ? t("已选 {0} 项管理 · {1} 个数据条目", [management.items.size, project.files(management.items, getEntries()).length]) : t("Ctrl 多选 · 空白处框选 · 右键管理");
		focusNote.title = [...management.items].map(label).join("\n") || focusNote.textContent;
	}
	function selectTarget(target, event = {}) {
		closeEditor();
		closeMenu();
		if (target === null) {
			focused = null;
			management.clear();
		} else {
			focused = target;
			management.select(target, {
				toggle: event.ctrlKey || event.metaKey,
				range: event.shiftKey,
				ordered: visible
			});
		}
		paintSelection();
	}
	function fillDestinations() {
		destinations.replaceChildren();
		const add = (value, text) => {
			const option = make("option", text);
			option.value = value;
			destinations.append(option);
		};
		add("", t("项目根目录"));
		for (const group of [...project.groups.values()].sort((a, b) => project.path(a.id).localeCompare(project.path(b.id), void 0, { numeric: true }))) {
			if (editorMode === "move" && editorTargets.some((target) => typeof target === "string" && project.within(group.id, target))) continue;
			add(group.id, project.path(group.id));
		}
		const single = editorTargets.length === 1 ? editorTargets[0] : null;
		destinations.value = typeof single === "string" ? editorMode === "create" ? single : project.groups.get(single)?.parent || "" : single?.group || "";
	}
	function openEditor(mode) {
		if (mode !== "create" && !management.items.size) return;
		closeMenu();
		editorTargets = project.roots(management.items);
		editorMode = mode;
		editor.hidden = false;
		status.textContent = "";
		nameInput.value = "";
		const title = editorTargets.length === 1 ? label(editorTargets[0]) : t("{0} 个条目", [editorTargets.length]);
		editorTitle.textContent = {
			create: t("新建项目文件夹"),
			move: t("移动：{0}", [title]),
			remove: t("移除：{0}", [title])
		}[mode];
		nameInput.hidden = mode !== "create";
		destinations.hidden = mode === "remove";
		submit.textContent = mode === "remove" ? t("确认移除") : mode === "move" ? t("移动到此处") : t("创建");
		editorNote.textContent = mode === "remove" ? t("从页面移除 {0} 个数据条目{1}。磁盘文件不变；未导出的计算结果将丢失。", [project.files(editorTargets, getEntries()).length, editorTargets.some((target) => typeof target === "string") ? t("及所选文件夹") : ""]) : t("仅调整当前页面的分组，不修改磁盘文件。");
		fillDestinations();
		(mode === "create" ? nameInput : mode === "move" ? destinations : submit).focus();
	}
	editor.onsubmit = (event) => {
		event.preventDefault();
		try {
			if (editorTargets.some((target) => !exists(target))) throw Error(t("部分条目已不存在，请重新选择"));
			if (editorMode === "create") {
				focused = project.create(nameInput.value, destinations.value);
				management.select(focused);
			} else if (editorMode === "move") project.moveMany(editorTargets, destinations.value);
			else if (editorMode === "remove") {
				const removed = project.files(editorTargets, getEntries());
				for (const target of editorTargets) if (typeof target === "string") project.removeGroup(target);
				focused = null;
				management.clear();
				closeEditor();
				onRemove(removed);
			}
			closeEditor();
			status.textContent = "";
			onChange();
		} catch (error) {
			status.textContent = error.message;
		}
	};
	function wireDrop(row, parent) {
		row.ondragover = (event) => {
			if (!dragged || !Array.from(event.dataTransfer.types).includes(dragType)) return;
			event.preventDefault();
			event.stopPropagation();
			event.dataTransfer.dropEffect = "move";
			row.classList.add("project-drop-target");
		};
		row.ondragleave = (event) => {
			if (!row.contains(event.relatedTarget)) row.classList.remove("project-drop-target");
		};
		row.ondrop = (event) => {
			if (!dragged || !Array.from(event.dataTransfer.types).includes(dragType)) return;
			event.preventDefault();
			event.stopPropagation();
			row.classList.remove("project-drop-target");
			try {
				project.moveMany(dragged, parent);
				status.textContent = t("已移动 {0} 项到 {1}", [dragged.length, project.path(parent) || t("项目根目录")]);
			} catch (error) {
				status.textContent = error.message;
			}
			dragged = null;
			container.classList.remove("project-dragging");
			closeEditor();
			onChange();
		};
	}
	function gripFor(target) {
		const grip = make("span", "⠿", "project-drag-handle");
		grip.draggable = true;
		grip.title = t("拖动选中条目到文件夹或项目根目录");
		grip.setAttribute("aria-hidden", "true");
		grip.ondragstart = (event) => {
			if (!management.items.has(target)) {
				management.select(target);
				focused = target;
				paintSelection();
			}
			closeMenu();
			closeEditor();
			dragged = project.roots(management.items);
			event.dataTransfer.setData(dragType, "project-nodes");
			event.dataTransfer.setData("text/plain", dragged.map(label).join("\n"));
			event.dataTransfer.effectAllowed = "move";
			container.classList.add("project-dragging");
			event.stopPropagation();
		};
		grip.ondragend = () => {
			dragged = null;
			container.classList.remove("project-dragging");
			container.querySelectorAll(".project-drop-target").forEach((node) => node.classList.remove("project-drop-target"));
			root.classList.remove("project-drop-target");
		};
		return grip;
	}
	wireDrop(root, "");
	root.onclick = () => selectTarget(null);
	const menu = make("div", null, "project-context-menu");
	menu.hidden = true;
	menu.setAttribute("role", "menu");
	menu.setAttribute("aria-label", t("项目管理菜单"));
	document.body.append(menu);
	let menuReturnFocus = null;
	function closeMenu(restore = false) {
		menu.hidden = true;
		if (restore) menuReturnFocus?.focus();
	}
	function showMenu(event, target) {
		event.preventDefault();
		event.stopPropagation();
		if (target === null || !management.items.has(target)) selectTarget(target);
		closeEditor();
		menuReturnFocus = event.target.closest("button") || root;
		const files = project.files(management.items, getEntries()), hasItems = management.items.size > 0;
		const add = (text, action, enabled = true, cls = "") => {
			const item = button(text, text, () => {
				closeMenu();
				action();
			});
			item.setAttribute("role", "menuitem");
			item.disabled = !enabled;
			item.className = cls;
			menu.append(item);
		};
		menu.replaceChildren();
		const caption = make("div", hasItems ? t("已选 {0} 项 · {1} 个数据条目", [management.items.size, files.length]) : t("项目管理"), "project-menu-caption");
		menu.append(caption);
		add(t("新建文件夹…"), () => openEditor("create"));
		add(t("显示选中数据"), () => onVisibility(files, true), files.length > 0 && (getMode() !== "single" || files.length === 1));
		add(t("隐藏选中数据"), () => onVisibility(files, false), files.some((entry) => getSelected().has(entry)));
		add(t("移动到…"), () => openEditor("move"), hasItems);
		add(t("移到项目根目录"), () => {
			try {
				project.moveMany(management.items, "");
				onChange();
			} catch (error) {
				status.textContent = error.message;
			}
		}, hasItems);
		add(t("展开全部文件夹"), () => {
			for (const group of project.groups.values()) group.collapsed = false;
			render();
		}, project.groups.size > 0);
		add(t("收起全部文件夹"), () => {
			for (const group of project.groups.values()) group.collapsed = true;
			render();
		}, project.groups.size > 0);
		add(t("移除选中条目…"), () => openEditor("remove"), hasItems, "project-menu-danger");
		menu.hidden = false;
		const rect = event.target.getBoundingClientRect(), x = event.clientX || rect.left, y = event.clientY || rect.bottom;
		menu.style.left = `${Math.max(6, Math.min(x, window.innerWidth - menu.offsetWidth - 6))}px`;
		menu.style.top = `${Math.max(6, Math.min(y, window.innerHeight - menu.offsetHeight - 6))}px`;
		menu.querySelector("button:not(:disabled)")?.focus();
	}
	container.oncontextmenu = (event) => showMenu(event, rowTargets.get(event.target.closest(".project-row")) ?? null);
	root.oncontextmenu = (event) => showMenu(event, null);
	menu.onkeydown = (event) => {
		const items = [...menu.querySelectorAll("button:not(:disabled)")], index = items.indexOf(document.activeElement);
		const next = event.key === "ArrowDown" ? (index + 1) % items.length : event.key === "ArrowUp" ? (index + items.length - 1) % items.length : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : -1;
		if (next >= 0) {
			event.preventDefault();
			items[next].focus();
		}
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			closeMenu(true);
		}
		if (event.key === "Tab") closeMenu();
	};
	document.addEventListener("pointerdown", (event) => {
		if (!menu.contains(event.target)) closeMenu();
	});
	document.addEventListener("scroll", (event) => {
		if (!menu.contains(event.target)) closeMenu();
	}, true);
	window.addEventListener("resize", () => closeMenu());
	container.tabIndex = 0;
	container.addEventListener("keydown", (event) => {
		if (event.target.closest("input,select,textarea,[contenteditable=true]")) return;
		if (event.key === "Delete" && management.items.size) {
			event.preventDefault();
			openEditor("remove");
		}
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			if (band) finishBand(true);
			else selectTarget(null);
		}
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
			event.preventDefault();
			management.box(visible);
			focused = visible.at(-1) || null;
			closeEditor();
			paintSelection();
		}
		if (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") showMenu(event, focused);
	});
	const marquee = make("div", null, "project-marquee");
	marquee.hidden = true;
	document.body.append(marquee);
	let band = null, animation = null, suppressClick = false;
	function updateBand() {
		if (!band?.active) return;
		const bounds = container.getBoundingClientRect();
		if (band.y < bounds.top + 22) container.scrollTop -= 10;
		else if (band.y > bounds.bottom - 22) container.scrollTop += 10;
		const startY = bounds.top + band.startY - container.scrollTop;
		const selectionArea = {
			left: Math.min(band.startX, band.x),
			right: Math.max(band.startX, band.x),
			top: Math.min(startY, band.y),
			bottom: Math.max(startY, band.y)
		};
		const area = {
			left: Math.max(bounds.left, selectionArea.left),
			right: Math.min(bounds.right, selectionArea.right),
			top: Math.max(bounds.top, selectionArea.top),
			bottom: Math.min(bounds.bottom, selectionArea.bottom)
		};
		Object.assign(marquee.style, {
			left: `${area.left}px`,
			top: `${area.top}px`,
			width: `${Math.max(0, area.right - area.left)}px`,
			height: `${Math.max(0, area.bottom - area.top)}px`
		});
		const hits = [];
		for (const [row, target] of rowTargets) if (typeof target !== "string" && projectBoxIntersects(selectionArea, row.getBoundingClientRect())) hits.push(target);
		management.box(hits, band.additive ? band.before : []);
		focused = [...management.items].at(-1) || null;
		paintSelection();
	}
	function tickBand() {
		updateBand();
		if (band?.active) animation = requestAnimationFrame(tickBand);
	}
	function finishBand(cancelled = false) {
		if (!band) return;
		if (cancelled) {
			management.box(band.before);
			paintSelection();
		}
		suppressClick = band.active;
		band = null;
		marquee.hidden = true;
		cancelAnimationFrame(animation);
		animation = null;
		setTimeout(() => {
			suppressClick = false;
		}, 0);
	}
	container.addEventListener("pointerdown", (event) => {
		if (!projectCanStartBox(event)) return;
		closeMenu();
		closeEditor();
		const rect = container.getBoundingClientRect();
		band = {
			pointer: event.pointerId,
			startX: event.clientX,
			startY: event.clientY - rect.top + container.scrollTop,
			x: event.clientX,
			y: event.clientY,
			originY: event.clientY,
			before: [...management.items],
			additive: event.ctrlKey || event.metaKey,
			active: false
		};
		container.setPointerCapture(event.pointerId);
		event.preventDefault();
	});
	container.addEventListener("pointermove", (event) => {
		if (!band || band.pointer !== event.pointerId) return;
		band.x = event.clientX;
		band.y = event.clientY;
		if (!band.active && Math.hypot(band.x - band.startX, band.y - band.originY) >= 4) {
			band.active = true;
			marquee.hidden = false;
			tickBand();
		} else updateBand();
	});
	container.addEventListener("pointerup", (event) => {
		if (!band || band.pointer !== event.pointerId) return;
		if (!band.active && !band.additive) selectTarget(null);
		finishBand();
		if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
	});
	container.addEventListener("pointercancel", () => finishBand(true));
	container.addEventListener("lostpointercapture", () => finishBand(true));
	container.addEventListener("click", (event) => {
		if (suppressClick) {
			event.preventDefault();
			event.stopPropagation();
		}
	}, true);
	function render() {
		const active = document.activeElement, oldRow = active?.closest?.(".project-row");
		const focusTarget = rowTargets.get(oldRow);
		const focusKind = oldRow && oldRow.contains(active) ? [
			"input",
			".project-name",
			"button.project-chevron"
		].find((selector) => oldRow.querySelector(selector) === active) : null;
		const entries = getEntries(), selected = getSelected(), query = getQuery().trim().toLowerCase();
		for (const target of management.items) if (!exists(target)) management.items.delete(target);
		if (focused && !exists(focused)) focused = null;
		if (editorTargets.some((target) => !exists(target))) closeEditor();
		if (query !== lastQuery) {
			limit = 200;
			lastQuery = query;
			management.clear();
			focused = null;
			closeEditor();
			closeMenu();
		}
		const groupsByParent = /* @__PURE__ */ new Map(), entriesByGroup = /* @__PURE__ */ new Map(), membersByGroup = /* @__PURE__ */ new Map();
		const matching = entries.filter((entry) => project.matches(entry, query));
		const push = (map, key, value) => {
			if (!map.has(key)) map.set(key, []);
			map.get(key).push(value);
		};
		for (const entry of matching) {
			push(entriesByGroup, entry.group || "", entry);
			for (let group = project.groups.get(entry.group); group; group = project.groups.get(group.parent)) push(membersByGroup, group.id, entry);
		}
		const visibleGroups = new Set(membersByGroup.keys());
		for (const group of project.groups.values()) if (!query || project.path(group.id).toLowerCase().includes(query)) for (let current = group; current; current = project.groups.get(current.parent)) visibleGroups.add(current.id);
		for (const group of project.groups.values()) if (visibleGroups.has(group.id)) push(groupsByParent, group.parent, group);
		const sort = (a, b) => (a.name || a.treeName || a.id).localeCompare(b.name || b.treeName || b.id, void 0, { numeric: true });
		for (const map of [groupsByParent, entriesByGroup]) for (const rows of map.values()) rows.sort(sort);
		const flat = [], stack = [{
			id: "",
			depth: 0
		}];
		while (stack.length) {
			const task = stack.pop();
			if (task.entry || task.group) {
				flat.push(task);
				if (task.entry || task.group.collapsed && !query) continue;
			}
			const parent = task.group?.id || task.id, depth = task.group ? task.depth + 1 : task.depth;
			const rows = [...(groupsByParent.get(parent) || []).map((group) => ({
				group,
				depth
			})), ...(entriesByGroup.get(parent) || []).map((entry) => ({
				entry,
				depth
			}))];
			stack.push(...rows.reverse());
		}
		const fragment = document.createDocumentFragment();
		rowTargets = /* @__PURE__ */ new Map();
		visible = flat.slice(0, limit).map((item) => item.group?.id || item.entry);
		for (const item of flat.slice(0, limit)) {
			const target = item.group?.id || item.entry, row = make("div", null, "project-row" + (item.group ? " project-folder" : ""));
			row.style.setProperty("--tree-depth", Math.min(item.depth, 8));
			rowTargets.set(row, target);
			const members = item.group ? membersByGroup.get(item.group.id) || [] : [item.entry];
			const count = members.filter((entry) => selected.has(entry)).length;
			const check = make("input");
			check.type = "checkbox";
			check.checked = members.length > 0 && count === members.length;
			check.indeterminate = count > 0 && count < members.length;
			check.disabled = !!item.group && (getMode() === "single" || !members.length);
			check.setAttribute("aria-label", t("显示 {0}", [label(target)]));
			const hit = make("label", null, "project-check-hit");
			hit.title = item.group && query ? t("仅选择当前搜索匹配的数据") : t(selectionHint);
			hit.append(check);
			hit.onpointerdown = (event) => {
				closeMenu();
				event.stopPropagation();
			};
			hit.onclick = (event) => event.stopPropagation();
			hit.ondragstart = (event) => event.preventDefault();
			check.onchange = () => item.group ? onGroupSelection(members, check.checked) : onToggle(item.entry);
			if (item.group) {
				const toggle = button(item.group.collapsed && !query ? "▸" : "▾", `${item.group.collapsed ? t("展开") : t("收起")} ${item.group.name}`, () => {
					item.group.collapsed = !item.group.collapsed;
					render();
				});
				toggle.className = "project-chevron";
				toggle.setAttribute("aria-expanded", String(!item.group.collapsed || !!query));
				row.append(toggle);
			} else row.append(make("span", "", "project-chevron"));
			const name = button((item.group ? "▱ " : "") + (item.group?.name || item.entry.treeName || item.entry.id), t("管理 {0}", [label(target)]), (event) => selectTarget(target, event));
			name.className = "project-name";
			name.title = item.group ? project.path(target) : t("{0} / {1}\n来源：{2}", [
				project.path(item.entry.group) || t("项目根目录"),
				item.entry.treeName || item.entry.id,
				item.entry.id
			]);
			const meta = make("span", item.group ? String(project.members(target, entries).length) : detail(item.entry), "project-meta");
			row.append(hit, name, meta, gripFor(target));
			wireDrop(row, item.group ? item.group.id : item.entry.group || "");
			fragment.append(row);
		}
		if (flat.length > limit) fragment.append(button(t("显示更多（剩余 {0} 项）", [flat.length - limit]), t("显示更多项目条目"), () => {
			limit += 200;
			render();
		}));
		if (!flat.length) fragment.append(make("p", query ? t("没有匹配的数据") : t("拖入文件或文件夹\n开始整理你的项目"), "empty-list"));
		const blank = make("div", null, "project-selection-space");
		blank.setAttribute("aria-hidden", "true");
		fragment.append(blank);
		const scroll = container.scrollTop;
		container.replaceChildren(fragment);
		paintSelection();
		if (focusKind) (([...rowTargets].find(([, target]) => target === focusTarget)?.[0])?.querySelector(focusKind) || container).focus({ preventScroll: true });
		container.scrollTop = scroll;
	}
	return { render };
}
//#endregion
//#region src/shared/point-drop.js
function capturePointDrop(dataTransfer) {
	const roots = [];
	for (const item of Array.from(dataTransfer?.items || [])) {
		if (item.kind !== "file") continue;
		let entry = null, file = null;
		try {
			entry = (item.getAsEntry || item.webkitGetAsEntry)?.call(item);
		} catch {}
		try {
			file = item.getAsFile?.();
		} catch {}
		if (entry || file) roots.push({
			entry,
			file
		});
	}
	if (!roots.length) for (const file of Array.from(dataTransfer?.files || [])) roots.push({ file });
	return roots;
}
async function scanPointDrop(roots, accepts, onProgress = () => {}) {
	const result = {
		files: [],
		skipped: 0,
		errors: [],
		directories: 0
	};
	const pending = roots.map((root) => ({
		...root,
		parent: ""
	})).reverse();
	let visited = 0;
	while (pending.length) {
		const { entry, file, parent } = pending.pop();
		const path = parent + (entry?.name || file?.webkitRelativePath || file?.name || t("未知文件"));
		try {
			if (entry?.isDirectory) {
				result.directories++;
				const reader = entry.createReader();
				while (true) {
					const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
					if (!batch.length) break;
					for (const child of batch) pending.push({
						entry: child,
						parent: path + "/"
					});
				}
			} else if (!accepts(entry?.name || file?.name || "")) result.skipped++;
			else {
				const resolved = entry?.isFile ? await new Promise((resolve, reject) => entry.file(resolve, reject)) : file;
				if (!resolved) throw new Error(t("无法读取文件"));
				result.files.push({
					file: resolved,
					path
				});
			}
		} catch (err) {
			result.errors.push({
				path,
				message: err?.message || t("无法读取")
			});
		}
		if (++visited % 100 === 0) {
			onProgress(result);
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	}
	return result;
}
function mountPointDrop({ zone, status, accepts, onFiles, host = window }) {
	let depth = 0, queue = Promise.resolve(), disposed = false;
	const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes("Files") || Array.from(event.dataTransfer?.items || []).some((item) => item.kind === "file");
	const reset = () => {
		depth = 0;
		zone.classList.remove("drop-active");
	};
	const say = (message) => {
		if (disposed) return;
		status.hidden = false;
		status.textContent = message;
	};
	const inside = (event) => zone.contains(event.target);
	const onEnter = (event) => {
		if (!hasFiles(event)) return;
		event.preventDefault();
		depth++;
		zone.classList.add("drop-active");
	};
	const onLeave = (event) => {
		if (depth && --depth === 0) reset();
	};
	const onOver = (event) => {
		if (!hasFiles(event)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = inside(event) ? "copy" : "none";
		if (inside(event)) zone.classList.add("drop-active");
		else reset();
	};
	const onDrop = (event) => {
		if (!hasFiles(event)) return;
		event.preventDefault();
		reset();
		if (!inside(event)) {
			say(t("请将数据文件或文件夹拖到左侧文件区域。"));
			return;
		}
		const roots = capturePointDrop(event.dataTransfer);
		say(t("正在整理拖入的文件…"));
		queue = queue.then(async () => {
			if (disposed) return;
			const result = await scanPointDrop(roots, accepts, (progress) => say(t("正在查找数据… 已找到 {0} 个文件", [progress.files.length.toLocaleString("zh-CN")])));
			if (disposed) return;
			const received = result.files.length ? await onFiles(result.files) : {
				added: 0,
				duplicates: 0
			};
			const parts = [t("新增 {0} 个数据", [received.added])];
			if (received.duplicates) parts.push(t("{0} 个已存在", [received.duplicates]));
			if (result.skipped) parts.push(t("跳过 {0} 个其他格式文件", [result.skipped]));
			if (result.errors.length) parts.push(t("{0} 项无法读取：{1}", [result.errors.length, result.errors.slice(0, 3).map((error) => error.path).join("、")]));
			if (!result.files.length) parts.push(t("未找到支持的数据；也可使用“添加数据文件夹…”按钮"));
			say(parts.join(" · "));
		}).catch((err) => say(t("添加失败：{0}。可改用添加文件 / 文件夹按钮。", [err?.message || t("无法读取拖入的文件")])));
		return queue;
	};
	zone.addEventListener("dragenter", onEnter);
	zone.addEventListener("dragleave", onLeave);
	host.addEventListener("dragover", onOver);
	host.addEventListener("drop", onDrop);
	host.addEventListener("dragend", reset);
	return () => {
		disposed = true;
		zone.removeEventListener("dragenter", onEnter);
		zone.removeEventListener("dragleave", onLeave);
		host.removeEventListener("dragover", onOver);
		host.removeEventListener("drop", onDrop);
		host.removeEventListener("dragend", reset);
		reset();
	};
}
//#endregion
export { setNameSummary as a, appendLegacyWireFiles as c, projectFileKey as d, projectUniqueId as f, compactNames as i, appendLodFiles as l, mountProjectTree as n, createBatchProgress as o, ViewerProject as p, archiveImportQueue as r, appendLegacyLodFiles as s, mountPointDrop as t, appendWireFiles as u };
