import { a as t } from "./i18n-B_brH6cQ.js";
//#region src/shared/autosave.js
/** Dirty events never serialize data. Flush on a five-minute deadline or lifecycle boundary. */
function createAutosave({ save, onDirty = () => {}, delay = 3e5, setTimer = setTimeout, clearTimer = clearTimeout }) {
	let timer = null, suspended = false, dirty = false, generation = 0;
	const cancel = () => {
		if (timer !== null) clearTimer(timer);
		timer = null;
	};
	const arm = () => {
		if (suspended || !dirty || timer !== null) return;
		timer = setTimer(() => {
			timer = null;
			flush().catch(() => arm());
		}, delay);
	};
	const flush = () => {
		cancel();
		const savingGeneration = generation;
		return Promise.resolve().then(save).then((result) => {
			if (generation === savingGeneration) dirty = false;
			if (dirty) {
				onDirty();
				arm();
			}
			return result;
		}, (error) => {
			dirty = true;
			arm();
			throw error;
		});
	};
	const schedule = () => {
		dirty = true;
		generation++;
		if (timer !== null) return;
		onDirty();
		arm();
	};
	return {
		schedule,
		flush,
		pause() {
			suspended = true;
			return flush();
		},
		resume() {
			suspended = false;
			arm();
		},
		dispose() {
			cancel();
			suspended = true;
		}
	};
}
//#endregion
//#region src/shared/mobile-navigation.js
/** One save-aware route home, shared by the toolbar and Android system Back. */
function createMobileHomeNavigation({ flush, navigate, language = () => "zh" }) {
	let pending = null;
	return function returnHome() {
		if (pending) return pending;
		pending = Promise.resolve().then(flush).then(() => navigate(`/assets/mobile/index.html?lang=${language() === "en" ? "en" : "zh"}`)).finally(() => {
			pending = null;
		});
		return pending;
	};
}
//#endregion
//#region src/shared/mobile-lifecycle.js
/** Visibility and native events describe the same lifecycle; each transition runs once. */
function mountMobileLifecycle({ root = document, host = globalThis, autosave, onBackground = () => {}, onForeground = () => {} }) {
	let nativePaused = false, paused = false;
	const reconcile = () => {
		const next = Boolean(root.hidden) || nativePaused;
		if (next === paused) return;
		paused = next;
		if (paused) {
			autosave.pause().catch(() => {});
			onBackground();
		} else {
			autosave.resume();
			onForeground();
		}
	};
	const pause = () => {
		nativePaused = true;
		reconcile();
	}, resume = () => {
		nativePaused = false;
		reconcile();
	};
	root.addEventListener("visibilitychange", reconcile);
	host.addEventListener("bwvPause", pause);
	host.addEventListener("bwvResume", resume);
	host.addEventListener("bwvMemoryPressure", onBackground);
	reconcile();
	return () => {
		root.removeEventListener("visibilitychange", reconcile);
		host.removeEventListener("bwvPause", pause);
		host.removeEventListener("bwvResume", resume);
		host.removeEventListener("bwvMemoryPressure", onBackground);
	};
}
//#endregion
//#region src/shared/mobile-project.js
var mobileProjectPlugin;
function isMobileApp() {
	return Boolean(globalThis.Capacitor?.isNativePlatform?.());
}
function mobileProjects() {
	if (!isMobileApp()) return null;
	return mobileProjectPlugin ||= globalThis.Capacitor.registerPlugin("BWVProjects");
}
/** Disk-backed File interface: text point readers request slices instead of a whole-file Blob. */
var NativeProjectFile = class {
	constructor(projectId, record) {
		this.projectId = projectId;
		this.record = record;
		this.name = record.path.split("/").at(-1);
		this.size = record.size;
		this.lastModified = record.modified || 0;
		this.webkitRelativePath = record.path;
		this.nativeKey = record.key;
	}
	slice(start = 0, end = this.size) {
		const size = this.size;
		start = start < 0 ? Math.max(0, size + start) : Math.min(start, size);
		end = end < 0 ? Math.max(0, size + end) : Math.min(end, size);
		end = Math.max(start, end);
		const result = {
			size: end - start,
			arrayBuffer: async () => {
				const output = new Uint8Array(end - start);
				let cursor = start;
				while (cursor < end) {
					const length = Math.min(1048576, end - cursor), reply = await mobileProjects().readChunk({
						id: this.projectId,
						key: this.nativeKey,
						offset: cursor,
						length
					});
					const binary = atob(reply.data);
					if (binary.length !== length) throw Error(t("项目文件读取不完整"));
					for (let i = 0; i < binary.length; i++) output[cursor - start + i] = binary.charCodeAt(i);
					cursor += length;
				}
				return output.buffer;
			}
		};
		result.text = async () => new TextDecoder().decode(await result.arrayBuffer());
		return result;
	}
	async text() {
		return new TextDecoder().decode(await this.slice().arrayBuffer());
	}
	async arrayBuffer() {
		return this.slice().arrayBuffer();
	}
};
function snapshotProjectTree(project, entries) {
	return {
		groups: [...project.groups.values()].map((g) => ({ ...g })),
		serial: project.serial,
		items: entries.map((e) => ({
			id: e.id,
			group: e.group,
			treeName: e.treeName,
			columnSettings: e.columnSettings,
			displayColor: e.displayColor,
			...e.excludedFileKeys?.length ? { excludedFileKeys: [...e.excludedFileKeys] } : {}
		}))
	};
}
function restoreProjectTree(project, entries, state) {
	if (!state?.groups || !state?.items) return entries;
	const groups = new Map(state.groups.map((g) => [g.id, { ...g }]));
	for (const g of groups.values()) {
		let at = g, visited = /* @__PURE__ */ new Set();
		while (at) {
			if (visited.has(at.id)) throw Error("Invalid project folder cycle");
			visited.add(at.id);
			at = groups.get(at.parent);
		}
	}
	project.groups = groups;
	project.serial = Number(state.serial) || groups.size;
	const saved = new Map(state.items.map((e) => [e.id, e]));
	return entries.filter((e) => !state.knownIds?.includes(e.id) || saved.has(e.id)).map((e) => {
		const previous = saved.get(e.id);
		if (previous) Object.assign(e, previous);
		else project.assign(e, e.file?.webkitRelativePath || e.sourceGroup || e.treeName || e.id);
		return e;
	});
}
async function mobileShareBlob(blob, name) {
	const api = mobileProjects();
	if (!api) return false;
	const { token } = await api.beginExport({ name });
	try {
		for (let start = 0; start < blob.size; start += 262144) {
			const bytes = new Uint8Array(await blob.slice(start, start + 262144).arrayBuffer());
			let binary = "";
			for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
			await api.appendExport({
				token,
				data: btoa(binary)
			});
		}
		await api.finishExport({
			token,
			type: blob.type || "application/octet-stream"
		});
		return true;
	} catch (error) {
		await api.cancelExport({ token }).catch(() => {});
		throw error;
	}
}
/** Serialize saves and coalesce rapid edits without losing a revert while a write is in flight. */
function createMobileSaver({ read, write, status = () => {} }) {
	let pending = null, draining = null, last = "";
	return { flush() {
		let state, text;
		try {
			state = read();
			text = JSON.stringify(state);
		} catch (error) {
			status("error", error);
			return Promise.reject(error);
		}
		if (!draining && text === last) {
			status("saved");
			return Promise.resolve();
		}
		pending = {
			state: JSON.parse(text),
			text
		};
		if (draining) return draining;
		draining = (async () => {
			try {
				while (pending) {
					const next = pending;
					pending = null;
					if (next.text === last) continue;
					status("saving");
					await write(next.state);
					last = next.text;
				}
				status("saved");
			} catch (error) {
				status("error", error);
				throw error;
			} finally {
				draining = null;
			}
		})();
		return draining;
	} };
}
/** Optional adapter; ordinary web sessions keep the existing local-file workflow. */
async function mountMobileProject({ receive, getState, restoreState, onBackground = () => {}, onForeground = () => {}, root = document }) {
	const api = mobileProjects();
	if (!api) return null;
	const id = new URL(root.location.href).searchParams.get("project");
	if (!id) {
		root.location.replace("/assets/mobile/index.html");
		return null;
	}
	const status = root.createElement("span");
	status.className = "mobile-save-status";
	status.setAttribute("role", "status");
	root.querySelector("header").append(status);
	let ready = false;
	const saver = createMobileSaver({
		read: () => ({
			...getState(),
			schemaVersion: 1
		}),
		write: (state) => api.saveState({
			id,
			tool: root.body.dataset.tool,
			state
		}),
		status: (kind, error) => {
			status.textContent = t(kind === "saving" ? "保存中…" : kind === "saved" ? "已保存" : "保存失败");
			status.title = error?.message || "";
		}
	});
	const autosave = createAutosave({
		save: () => ready ? saver.flush() : Promise.resolve(),
		onDirty: () => {
			status.textContent = t("待自动保存");
		}
	});
	const flush = autosave.flush, schedule = () => {
		if (ready) autosave.schedule();
	};
	const goHome = createMobileHomeNavigation({
		flush,
		navigate: (url) => root.location.replace(url),
		language: () => root.documentElement.lang
	});
	const home = root.querySelector(".back-home");
	if (home) {
		home.href = "/assets/mobile/index.html";
		home.onclick = (event) => {
			event.preventDefault();
			goHome().catch(() => {});
		};
	}
	globalThis.bwvNavigateProjectHome = () => goHome().catch(() => {});
	globalThis.bwvReturnToProjectHome = () => {
		const event = new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true,
			cancelable: true
		});
		(root.activeElement || root).dispatchEvent(event);
		if (!event.defaultPrevented) goHome().catch(() => {});
		else flush().catch(() => {});
	};
	try {
		const project = await api.getProject({ id });
		status.textContent = t("正在恢复项目…");
		const records = project.files.map((record) => ({
			file: new NativeProjectFile(id, record),
			path: record.path
		}));
		await receive(records);
		await restoreState(project.states?.[root.body.dataset.tool] || null, records);
		ready = true;
		await flush();
		const pick = async () => {
			try {
				await flush();
				status.textContent = t("正在导入…");
				if (!(await api.pickFiles({ id })).cancelled) root.location.reload();
				else status.textContent = t("已保存");
			} catch (error) {
				status.textContent = error.message;
			}
		};
		root.getElementById("choose-file").onclick = pick;
		root.getElementById("choose-folder").onclick = pick;
		root.getElementById("choose-folder").textContent = t("导入压缩包");
		const overlay = root.getElementById("attach-cloud");
		if (overlay) {
			overlay.onclick = pick;
			overlay.title = t("请将线框与点云放在同一压缩包目录内导入");
		}
		for (const name of [
			"input",
			"change",
			"click",
			"pointerup",
			"touchend",
			"wheel",
			"keyup"
		]) root.addEventListener(name, schedule, { passive: true });
		mountMobileLifecycle({
			root,
			autosave,
			onBackground,
			onForeground
		});
		await api.addListener("projectsChanged", () => {
			status.textContent = t("收到新项目，返回首页查看");
		});
		const observer = new MutationObserver(schedule);
		for (const node of root.querySelectorAll("#data-list,#model-list")) observer.observe(node, {
			childList: true,
			subtree: true
		});
		return {
			flush,
			schedule
		};
	} catch (error) {
		status.textContent = t("项目恢复失败");
		status.title = error.message;
		const p = root.createElement("p");
		p.className = "error-banner";
		p.textContent = error.message;
		root.querySelector("main").prepend(p);
		return null;
	}
}
function captureMobileInputs(root = document) {
	return [...root.querySelectorAll("#settings-panel-display input,#settings-panel-display select")].filter((el) => el.type !== "file" && (el.id || el.dataset.mobileKey || el.getAttribute("aria-label"))).map((el) => ({
		id: el.id,
		key: el.dataset.mobileKey,
		aria: el.getAttribute("aria-label"),
		value: el.type === "checkbox" ? el.checked : el.value
	}));
}
function restoreMobileInputs(values, root = document) {
	for (const value of values || []) {
		const el = value.id ? root.getElementById(value.id) : value.key ? [...root.querySelectorAll("[data-mobile-key]")].find((el) => el.dataset.mobileKey === value.key) : [...root.querySelectorAll("#settings-panel-display [aria-label]")].find((el) => el.getAttribute("aria-label") === value.aria);
		if (!el) continue;
		if (el.type === "checkbox") el.checked = Boolean(value.value);
		else el.value = String(value.value);
		if (el.closest(".presentation-controls") || el.closest(".palette-panel")) el.dispatchEvent(new Event("change", { bubbles: true }));
	}
}
async function nativeExportWriter(name) {
	const api = mobileProjects(), { token } = await api.beginExport({ name });
	return {
		token,
		async write(chunk) {
			const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk.buffer || chunk, chunk.byteOffset || 0, chunk.byteLength);
			for (let start = 0; start < bytes.length; start += 262144) {
				let binary = "";
				const part = bytes.subarray(start, start + 262144);
				for (let i = 0; i < part.length; i += 8192) binary += String.fromCharCode(...part.subarray(i, i + 8192));
				await api.appendExport({
					token,
					data: btoa(binary)
				});
			}
		},
		async share(type) {
			await api.finishExport({
				token,
				type
			});
		},
		async commit(id, path) {
			return api.commitExport({
				token,
				id,
				path
			});
		},
		async abort() {
			await api.cancelExport({ token });
		}
	};
}
//#endregion
export { mobileShareBlob as a, restoreMobileInputs as c, mountMobileLifecycle as d, createMobileHomeNavigation as f, mobileProjects as i, restoreProjectTree as l, captureMobileInputs as n, mountMobileProject as o, createAutosave as p, isMobileApp as r, nativeExportWriter as s, NativeProjectFile as t, snapshotProjectTree as u };
