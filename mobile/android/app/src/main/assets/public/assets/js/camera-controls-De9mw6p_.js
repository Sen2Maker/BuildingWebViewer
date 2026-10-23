import { a as t } from "./i18n-B_brH6cQ.js";
import { a as mobileShareBlob } from "./mobile-project-DOywSnqd.js";
//#region src/shared/palettes.js
/** Shared, evenly spaced color stops for GPU rendering and matching UI legends. */
var PALETTE_DEFINITIONS = Object.freeze({
	current: {
		label: t("当前色带"),
		stops: [
			[
				.2,
				.32,
				.65
			],
			[
				.13,
				.59,
				.7
			],
			[
				.35,
				.75,
				.55
			],
			[
				.9,
				.8,
				.32
			],
			[
				.88,
				.33,
				.23
			]
		]
	},
	viridis: {
		label: "Viridis",
		stops: [
			[
				.267,
				.005,
				.329
			],
			[
				.279,
				.175,
				.483
			],
			[
				.23,
				.322,
				.546
			],
			[
				.173,
				.449,
				.558
			],
			[
				.128,
				.567,
				.551
			],
			[
				.158,
				.684,
				.502
			],
			[
				.369,
				.789,
				.383
			],
			[
				.678,
				.864,
				.19
			],
			[
				.993,
				.906,
				.144
			]
		]
	},
	inferno: {
		label: "Inferno",
		stops: [
			[
				.001,
				0,
				.014
			],
			[
				.129,
				.047,
				.291
			],
			[
				.342,
				.062,
				.429
			],
			[
				.541,
				.135,
				.415
			],
			[
				.735,
				.216,
				.33
			],
			[
				.894,
				.353,
				.194
			],
			[
				.978,
				.558,
				.035
			],
			[
				.974,
				.798,
				.206
			],
			[
				.988,
				.998,
				.645
			]
		]
	},
	grayscale: {
		label: t("灰度"),
		stops: [[
			.08,
			.08,
			.08
		], [
			.95,
			.95,
			.95
		]]
	},
	"blue-white-red": {
		label: t("蓝—白—红"),
		stops: [
			[
				.17,
				.35,
				.75
			],
			[
				.97,
				.97,
				.97
			],
			[
				.78,
				.16,
				.2
			]
		]
	}
});
function samplePalette(t, palette = "current", reverse = false) {
	const stops = (PALETTE_DEFINITIONS[palette] || PALETTE_DEFINITIONS.current).stops;
	let value = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : .5;
	if (reverse) value = 1 - value;
	const at = value * (stops.length - 1), low = Math.min(stops.length - 2, Math.floor(at)), fraction = at - low;
	return stops[low].map((channel, i) => channel * (1 - fraction) + stops[low + 1][i] * fraction);
}
function paletteUniforms(palette = "current", reverse = false) {
	const values = /* @__PURE__ */ new Float32Array(27);
	for (let i = 0; i < 9; i++) values.set(samplePalette(i / 8, palette, reverse), i * 3);
	return values;
}
var PALETTE_STORAGE_KEY = "BuildingWebViewer.palette.v1";
/** Copy the small scalar-color contract; numeric limits belong to the current dataset, never a global preference. */
function normalizePaletteOptions(options = {}) {
	validatePaletteOptions(options);
	return {
		palette: options.palette || "current",
		reverse: !!options.reverse,
		range: options.range ? {
			min: options.range.min,
			max: options.range.max
		} : null
	};
}
function currentPalettePreferences() {
	try {
		const stored = JSON.parse(globalThis.localStorage?.getItem("BuildingWebViewer.palette.v1") || "null");
		if (stored && typeof stored === "object") return {
			...normalizePaletteOptions({
				palette: stored.palette,
				reverse: stored.reverse
			}),
			range: null
		};
	} catch {}
	return {
		palette: "current",
		reverse: false,
		range: null
	};
}
function rememberPalettePreferences(options) {
	const { palette, reverse } = normalizePaletteOptions(options);
	try {
		globalThis.localStorage?.setItem(PALETTE_STORAGE_KEY, JSON.stringify({
			palette,
			reverse
		}));
	} catch {}
}
function validatePaletteOptions(options) {
	if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("Invalid palette options");
	if (options.reverse !== void 0 && typeof options.reverse !== "boolean") throw new Error("Invalid palette reversal flag");
	if (!Object.hasOwn(PALETTE_DEFINITIONS, options.palette || "current")) throw new Error(t("不支持的色带：{0}", [options.palette]));
	if (options.range !== null && options.range !== void 0) {
		const { min, max } = options.range;
		if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) throw new Error(t("手动色域需要有限数值，且最小值必须小于最大值。"));
	}
}
var PALETTE_GLSL = `
uniform vec3 colorStops[9];
vec3 paletteColor(float value) {
  float t = clamp(value, 0.0, 1.0) * 8.0;
  if (t <= 1.0) return mix(colorStops[0], colorStops[1], t);
  if (t <= 2.0) return mix(colorStops[1], colorStops[2], t - 1.0);
  if (t <= 3.0) return mix(colorStops[2], colorStops[3], t - 2.0);
  if (t <= 4.0) return mix(colorStops[3], colorStops[4], t - 3.0);
  if (t <= 5.0) return mix(colorStops[4], colorStops[5], t - 4.0);
  if (t <= 6.0) return mix(colorStops[5], colorStops[6], t - 5.0);
  if (t <= 7.0) return mix(colorStops[6], colorStops[7], t - 6.0);
  return mix(colorStops[7], colorStops[8], t - 7.0);
}`;
//#endregion
//#region src/shared/inspector-navigation.js
/** One category order and one shortcut style for every web viewer, including App pages. */
function prepareInspectorNavigation(root = document) {
	const panel = root.getElementById("viewer-inspector");
	if (!panel) return;
	const tabs = panel.querySelector(".inspector-tabs"), content = panel.querySelector(".inspector-content"), shortcuts = root.querySelector(".inspector-shortcuts");
	const dataControls = root.querySelector("[data-data-controls]") || root.getElementById("wire-controls")?.closest(".inspector-section");
	let data = panel.querySelector("[data-settings-panel=\"data\"]");
	if (dataControls && !data) {
		data = root.createElement("section");
		data.id = "settings-panel-data";
		data.dataset.settingsPanel = "data";
		data.hidden = true;
		data.setAttribute("role", "tabpanel");
		data.setAttribute("aria-labelledby", "settings-tab-data");
		content.prepend(data);
		const tab = root.createElement("button");
		tab.type = "button";
		tab.id = "settings-tab-data";
		tab.dataset.settingsTab = "data";
		tab.setAttribute("role", "tab");
		tab.setAttribute("aria-controls", data.id);
		tab.setAttribute("aria-selected", "false");
		tab.tabIndex = -1;
		tab.textContent = t("数据");
		tabs.prepend(tab);
	}
	if (dataControls) data.append(dataControls);
	const labels = {
		data: "数据",
		tools: "数据",
		display: "显示",
		camera: "相机",
		bookmarks: "书签",
		processing: "处理",
		diagnostics: "诊断",
		edit: "编辑"
	};
	const icons = {
		data: "<path d=\"M4 5h16v14H4zM4 10h16M9 5v14\"/>",
		tools: "<path d=\"M4 5h16v14H4zM4 10h16M9 5v14\"/>",
		display: "<path d=\"M4 5h16M4 12h16M4 19h16\"/><path d=\"M8 3v4M16 10v4M10 17v4\"/>",
		camera: "<path d=\"M8 6l2-3h4l2 3h4v14H4V6z\"/><circle cx=\"12\" cy=\"12\" r=\"4\"/>",
		bookmarks: "<path d=\"M6 3h12v18l-6-4-6 4z\"/>"
	};
	const order = [
		"data",
		"tools",
		"display",
		"camera",
		"bookmarks",
		"processing",
		"diagnostics",
		"edit"
	];
	const all = [...tabs.querySelectorAll("[data-settings-tab]")].sort((a, b) => {
		const rank = (x) => order.includes(x) ? order.indexOf(x) : 99;
		return rank(a.dataset.settingsTab) - rank(b.dataset.settingsTab);
	});
	for (const tab of all) {
		const key = tab.dataset.settingsTab;
		if (labels[key]) tab.textContent = t(labels[key]);
		tabs.append(tab);
	}
	const actions = [...shortcuts.querySelectorAll("button")].filter((button) => !button.dataset.openSettings);
	shortcuts.replaceChildren();
	let extra = null;
	function addExtra(button) {
		if (!extra) {
			extra = root.createElement("details");
			extra.className = "viewer-extra-tools";
			const summary = root.createElement("summary");
			summary.textContent = t("工具");
			extra.append(summary);
			const menu = root.createElement("div");
			menu.className = "viewer-extra-menu";
			extra.append(menu);
			shortcuts.append(extra);
			extra.addEventListener("keydown", (event) => {
				if (event.key === "Escape") {
					extra.open = false;
					summary.focus();
				}
			});
			root.addEventListener("pointerdown", (event) => {
				if (!extra.contains(event.target)) extra.open = false;
			});
		}
		extra.querySelector(".viewer-extra-menu").append(button);
		button.addEventListener("click", () => {
			extra.open = false;
		});
	}
	for (const tab of all) {
		const key = tab.dataset.settingsTab, button = root.createElement("button");
		button.type = "button";
		button.dataset.openSettings = key;
		button.setAttribute("aria-controls", panel.id);
		button.setAttribute("aria-expanded", "false");
		const icon = root.createElement("span");
		icon.className = "settings-icon";
		icon.setAttribute("aria-hidden", "true");
		icon.innerHTML = icons[key] ? `<svg viewBox="0 0 24 24">${icons[key]}</svg>` : "·";
		const label = root.createElement("span");
		label.textContent = tab.textContent;
		button.append(icon, label);
		if (order.indexOf(key) > 4 || !order.includes(key)) addExtra(button);
		else shortcuts.append(button);
	}
	for (const button of actions) addExtra(button);
	root.querySelector(".main-heading")?.classList.add("viewer-heading");
}
//#endregion
//#region src/shared/object-browser-controls.js
/** Keep file management in the sidebar and viewing choices beside the preview. */
function mountObjectBrowserControls({ root = document } = {}) {
	const controls = root.querySelector("[data-object-browser]");
	const heading = root.querySelector(".workspace > main > .main-heading");
	if (!controls || !heading) return;
	heading.classList.add("object-browser-heading");
	heading.append(controls);
	const help = controls.querySelector("details");
	root.addEventListener("click", (event) => {
		if (help.open && !help.contains(event.target)) help.open = false;
	});
	controls.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && help.open) {
			help.open = false;
			help.querySelector("summary").focus();
			event.preventDefault();
		}
	});
}
//#endregion
//#region src/shared/camera-geometry.js
var gsDot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function gsUnit3(v) {
	const n = Math.hypot(...v);
	if (!(n > 1e-12)) throw Error("Invalid camera axis");
	return v.map((x) => x / n);
}
function gsCross3(a, b) {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0]
	];
}
function gsTrainingPose(camera, origin = [
	0,
	0,
	0
]) {
	const r = camera.rotation;
	if (!Array.isArray(r) || r.length !== 3 || r.some((row) => !Array.isArray(row) || row.length !== 3 || !row.every(Number.isFinite)) || !camera.position?.every(Number.isFinite) || !(camera.fx > 0 && camera.fy > 0 && camera.width > 0 && camera.height > 0)) throw Error("训练相机缺少有效的 rotation、fx、fy 或图像尺寸 / Invalid training camera");
	const right = gsUnit3(r.map((row) => row[0])), up = gsUnit3(r.map((row) => -row[1])), back = gsUnit3(r.map((row) => -row[2]));
	if (Math.abs(gsDot3(right, up)) > .001 || Math.abs(gsDot3(right, back)) > .001 || Math.abs(gsDot3(up, back)) > .001 || gsDot3(gsCross3(right, up), back) < .999) throw Error("Invalid camera rotation");
	return {
		eye: camera.position.map((v, i) => v - origin[i]),
		basis: [
			right,
			up,
			back
		],
		fx: camera.fx,
		fy: camera.fy,
		width: camera.width,
		height: camera.height
	};
}
function gsViewSpec(viewer, width, height) {
	const basis = viewer.basis(), perspective = viewer.projection !== "orthographic";
	const training = viewer.trainingPose;
	const focal = height / (2 * Math.tan((viewer.fov || 55) * Math.PI / 360));
	const fit = training ? Math.min(width / training.width, height / training.height) : 1;
	const fx = training ? training.fx * fit : viewer.orbitLens ? viewer.orbitLens.fx * height : focal, fy = training ? training.fy * fit : viewer.orbitLens ? viewer.orbitLens.fy * height : focal;
	const distance = viewer.distance / viewer.camera.zoom;
	const target = viewer.target.map((v, i) => v + basis[0][i] * viewer.camera.pan[0] + basis[1][i] * viewer.camera.pan[1]);
	return {
		basis,
		eye: viewer.flyPose ? viewer.flyPose.eye : training ? training.eye : target.map((v, i) => v + basis[2][i] * distance),
		target,
		width,
		height,
		fx,
		fy,
		perspective,
		near: viewer.near || .001,
		worldHeight: viewer.baseHeight / viewer.camera.zoom
	};
}
function gsProjectPosition(point, spec) {
	const delta = point.map((v, i) => v - spec.eye[i]), [right, up, back] = spec.basis;
	const depth = -gsDot3(delta, back);
	if (spec.perspective && depth <= spec.near) return null;
	const x = gsDot3(delta, right), y = gsDot3(delta, up);
	return {
		x: spec.width / 2 + (spec.perspective ? spec.fx * x / depth : x * spec.height / spec.worldHeight),
		y: spec.height / 2 - (spec.perspective ? spec.fy * y / depth : y * spec.height / spec.worldHeight),
		depth
	};
}
//#endregion
//#region src/shared/fly-camera.js
var FLY_CAMERA_DEFAULTS = Object.freeze({
	sensitivity: .12,
	speed: .15,
	rollSpeed: 30
});
function flyCameraSettings(value = {}) {
	const v = value || {}, number = (key, low, high) => Number.isFinite(v[key]) ? Math.max(low, Math.min(high, v[key])) : FLY_CAMERA_DEFAULTS[key];
	return {
		sensitivity: number("sensitivity", .01, 1),
		speed: number("speed", .005, 2),
		rollSpeed: number("rollSpeed", 5, 120)
	};
}
function gsFlyRotate(vector, axis, angle) {
	const c = Math.cos(angle), s = Math.sin(angle), cross = gsCross3(axis, vector), dot = gsDot3(axis, vector);
	return vector.map((v, i) => v * c + cross[i] * s + axis[i] * dot * (1 - c));
}
/** Independent eye, with the entry view's up axis as the local vertical. */
var FlyCameraPose = class {
	constructor(eye, basis) {
		this.eye = [...eye];
		this.initial = basis.map((v) => [...v]);
		this.vertical = [...basis[1]];
		this.yaw = 0;
		this.pitch = 0;
		this.roll = 0;
		this.basis = basis.map((v) => [...v]);
	}
	look(dx, dy, sensitivity) {
		const c = Math.cos(this.roll), s = Math.sin(this.roll), sx = dx * c + dy * s, sy = -dx * s + dy * c;
		dx = sx;
		dy = sy;
		this.yaw = (this.yaw - dx * sensitivity * Math.PI / 180) % (2 * Math.PI);
		this.pitch = Math.max(-Math.PI * .495, Math.min(Math.PI * .495, this.pitch - dy * sensitivity * Math.PI / 180));
		this.rebuild();
	}
	rollBy(degrees) {
		this.roll = (this.roll + degrees * Math.PI / 180) % (2 * Math.PI);
		this.rebuild();
	}
	rebuild() {
		const yawed = this.initial.map((v) => gsFlyRotate(v, this.vertical, this.yaw));
		this.basis = [
			yawed[0],
			gsFlyRotate(yawed[1], yawed[0], this.pitch),
			gsFlyRotate(yawed[2], yawed[0], this.pitch)
		];
		this.basis = this.basis.map((v) => gsFlyRotate(v, this.basis[2], this.roll));
	}
	move(right, forward, up, distance) {
		const direction = this.eye.map((_, i) => this.basis[0][i] * right - this.basis[2][i] * forward + this.vertical[i] * up);
		const length = Math.hypot(...direction), input = Math.min(1, Math.hypot(right, forward, up));
		if (length > 1e-8) this.eye = this.eye.map((v, i) => v + direction[i] / length * distance * input);
	}
};
//#endregion
//#region src/shared/fly-controls.js
/** Owns keyboard/pointer/touch input only while the explicit first-person mode is active. */
function mountFlyCameraControls(viewer, container) {
	const en = document.documentElement.lang === "en", tr = (zh, english) => en ? english : zh;
	const make = (tag, text, cls) => {
		const el = document.createElement(tag);
		if (text) el.textContent = text;
		if (cls) el.className = cls;
		return el;
	};
	const storage = "BuildingWebViewer.camera.fly.v2";
	let settings = flyCameraSettings();
	try {
		settings = flyCameraSettings(JSON.parse(localStorage.getItem(storage)));
	} catch {}
	const canvas = viewer.canvas, stage = canvas.parentElement, listeners = [], keys = /* @__PURE__ */ new Set(), holds = /* @__PURE__ */ new Map(), rolls = /* @__PURE__ */ new Map();
	let active = false, frame = null, last = 0, sceneSpan = 1, locked = false, joystick = [0, 0], lookPointer = null, stickPointer = null, savedCursor = "";
	const on = (el, event, fn, options) => {
		el.addEventListener(event, fn, options);
		listeners.push(() => el.removeEventListener(event, fn, options));
	};
	const entry = make("button", tr("漫游模式", "Fly camera"), "gs-fly-entry");
	entry.type = "button";
	entry.setAttribute("aria-pressed", "false");
	document.querySelector(".viewer-toolbar").append(entry);
	const section = make("details", null, "gs-navigation");
	section.open = true;
	section.append(make("summary", tr("第一人称漫游", "First-person camera")));
	const fields = [];
	function field(key, zh, eng, min, max, step, unit) {
		const row = make("div", null, "gs-navigation-field");
		row.append(make("span", tr(zh, eng)));
		const range = make("input"), number = make("input");
		range.type = "range";
		number.type = "number";
		for (const input of [range, number]) {
			input.min = min;
			input.max = max;
			input.step = step;
			input.value = settings[key];
			input.setAttribute("aria-label", tr(zh, eng) + (input === range ? tr("滑块", " slider") : tr("数值", " value")));
			on(input, "input", () => {
				const value = Number(input.value);
				if (input.value === "" || !Number.isFinite(value) || value < min || value > max) return;
				settings = flyCameraSettings({
					...settings,
					[key]: value
				});
				(input === range ? number : range).value = value;
				try {
					localStorage.setItem(storage, JSON.stringify(settings));
				} catch {}
			});
			on(input, "change", () => {
				input.value = settings[key];
			});
		}
		fields.push([
			key,
			range,
			number
		]);
		row.append(range, number, make("small", unit));
		section.append(row);
	}
	field("sensitivity", "转头灵敏度", "Look sensitivity", .01, 1, .01, "°/px");
	field("speed", "移动速度", "Travel speed", .005, 2, .005, tr("场景/秒", "scene/s"));
	field("rollSpeed", "滚转速度", "Roll speed", 5, 120, 5, "°/s");
	const touchLabel = make("label", null, "gs-navigation-toggle"), touchMode = make("input");
	touchMode.type = "checkbox";
	touchMode.checked = matchMedia("(pointer: coarse)").matches;
	touchLabel.append(touchMode, make("span", tr("使用触屏摇杆", "Use touch controls")));
	section.append(touchLabel);
	section.append(make("p", tr("WASD / 方向键移动，空格上升，Shift 下降，Q 逆时针 / E 顺时针滚转相机，Esc 退出。鼠标向右即向右看，无惯性；按住 Ctrl 临时慢行。升降沿进入时的画面上方向，移动速度按模型大小换算。触屏：左摇杆移动，右侧拖动转头，可同时操作升降与 ↶ / ↷ 滚转。滚转改变相机倾斜，画面会向相反方向转动。", "WASD / arrows move, Space rises, Shift descends, Q rolls the camera counterclockwise / E clockwise, Esc exits. Direct mouse look; hold Ctrl for precision travel. Vertical movement uses the entry view’s up direction. Speed scales with scene size. Touch: left stick moves, right side looks; rise/descend and ↶ / ↷ roll can be held together. Camera roll turns the image in the opposite direction."), "presentation-help"));
	const reset = make("button", tr("恢复漫游默认值", "Reset fly controls"));
	reset.type = "button";
	reset.onclick = () => {
		settings = flyCameraSettings(FLY_CAMERA_DEFAULTS);
		for (const [k, r, n] of fields) r.value = n.value = settings[k];
		try {
			localStorage.setItem(storage, JSON.stringify(settings));
		} catch {}
	};
	section.append(reset);
	container.append(section);
	const hud = make("div", null, "gs-fly-hud");
	hud.hidden = true;
	const top = make("div", null, "gs-fly-top"), status = make("span", null, "gs-fly-status"), exit = make("button", tr("退出漫游 · Esc", "Exit fly · Esc"));
	exit.type = "button";
	top.append(status, exit);
	const cross = make("div", "+", "gs-fly-cross");
	cross.setAttribute("aria-hidden", "true");
	const pad = make("div", null, "gs-fly-stick");
	pad.setAttribute("aria-label", tr("移动摇杆", "Movement joystick"));
	const thumb = make("i");
	pad.append(thumb, make("span", tr("移动", "Move")));
	const look = make("div", tr("拖动转头", "Drag to look"), "gs-fly-look");
	look.setAttribute("aria-label", tr("转头触控区", "Touch look area"));
	const vertical = make("div", null, "gs-fly-vertical");
	for (const [value, zh, eng] of [[
		1,
		"上升",
		"Rise"
	], [
		-1,
		"下降",
		"Descend"
	]]) {
		const b = make("button", tr(zh, eng));
		b.type = "button";
		vertical.append(b);
		on(b, "pointerdown", (e) => {
			e.preventDefault();
			b.setPointerCapture(e.pointerId);
			holds.set(e.pointerId, value);
			schedule();
		});
		for (const name of [
			"pointerup",
			"pointercancel",
			"lostpointercapture"
		]) on(b, name, (e) => {
			holds.delete(e.pointerId);
		});
	}
	const rollPad = make("div", null, "gs-fly-roll");
	for (const [value, symbol, zh, eng] of [[
		1,
		"↶",
		"逆时针滚转相机",
		"Roll camera counterclockwise"
	], [
		-1,
		"↷",
		"顺时针滚转相机",
		"Roll camera clockwise"
	]]) {
		const b = make("button", symbol);
		b.type = "button";
		b.setAttribute("aria-label", tr(zh, eng));
		rollPad.append(b);
		on(b, "pointerdown", (e) => {
			e.preventDefault();
			b.setPointerCapture(e.pointerId);
			rolls.set(e.pointerId, value);
			schedule();
		});
		for (const name of [
			"pointerup",
			"pointercancel",
			"lostpointercapture"
		]) on(b, name, (e) => rolls.delete(e.pointerId));
	}
	hud.append(top, cross, look, pad, vertical, rollPad);
	stage.append(hud);
	function help(fallback = false) {
		status.textContent = touchMode.checked ? tr("漫游 · 左手移动 / 右手转头", "Fly · left move / right look") : fallback ? tr("鼠标锁定不可用：按住画面拖动转头 · WASD 移动 · Q/E 滚转 · Esc 退出", "Pointer lock unavailable: drag to look · WASD moves · Q/E rolls · Esc exits") : tr("漫游 · WASD 移动 · 空格 ↑ / Shift ↓ · Q/E ↶↷ · Esc 退出", "Fly · WASD moves · Space ↑ / Shift ↓ · Q/E ↶↷ · Esc exits");
	}
	function clearInput() {
		keys.clear();
		holds.clear();
		rolls.clear();
		joystick = [0, 0];
		lookPointer = null;
		stickPointer = null;
		thumb.style.transform = "";
		if (frame !== null) cancelAnimationFrame(frame);
		frame = null;
		last = 0;
	}
	function schedule() {
		if (active && frame === null) {
			if (!last) last = performance.now();
			frame = requestAnimationFrame(tick);
		}
	}
	function tick(now) {
		frame = null;
		if (!active) return;
		const dt = Math.min(.05, Math.max(0, (now - last) / 1e3));
		last = now;
		const has = (...codes) => codes.some((code) => keys.has(code)) ? 1 : 0;
		const x = has("KeyD", "ArrowRight") - has("KeyA", "ArrowLeft") + joystick[0], z = has("KeyW", "ArrowUp") - has("KeyS", "ArrowDown") + joystick[1], y = has("Space") - has("ShiftLeft", "ShiftRight") + [...holds.values()].reduce((a, b) => a + b, 0);
		const roll = has("KeyQ") - has("KeyE") + [...rolls.values()].reduce((a, b) => a + b, 0);
		if (x || y || z || roll) {
			viewer.flyPose.rollBy(Math.max(-1, Math.min(1, roll)) * settings.rollSpeed * dt * (has("ControlLeft", "ControlRight") ? .2 : 1));
			viewer.flyPose.move(x, z, y, sceneSpan * settings.speed * dt * (has("ControlLeft", "ControlRight") ? .2 : 1));
			viewer.requestRender();
			schedule();
		} else last = 0;
	}
	function turn(dx, dy) {
		if (!active) return;
		viewer.flyPose.look(dx, dy, settings.sensitivity);
		viewer.requestRender();
	}
	function enter() {
		if (active || !(viewer.count || viewer.pointCount || viewer.edgeCount || viewer.triangleCount) || viewer.contextLost) return;
		viewer.stopNavigation();
		viewer.drag = null;
		viewer.prepareFly?.();
		const spec = gsViewSpec(viewer, canvas.clientWidth, canvas.clientHeight);
		viewer.flyPose = new FlyCameraPose(spec.eye, spec.basis);
		viewer.projection = "perspective";
		if (!viewer.prepareFly && !viewer.trainingPose) viewer.trainingPose = {
			eye: [...spec.eye],
			basis: spec.basis,
			width: spec.width,
			height: spec.height,
			fx: spec.fx,
			fy: spec.fy
		};
		sceneSpan = Math.max(.001, viewer.baseHeight || 1);
		active = true;
		entry.setAttribute("aria-pressed", "true");
		savedCursor = canvas.style.cursor;
		canvas.style.cursor = "crosshair";
		hud.hidden = false;
		stage.classList.add("gs-fly-active");
		hud.classList.toggle("touch", touchMode.checked);
		help();
		canvas.focus({ preventScroll: true });
		viewer.requestRender();
		if (!touchMode.checked) try {
			if (!canvas.requestPointerLock) {
				help(true);
				return;
			}
			const result = canvas.requestPointerLock();
			if (result?.catch) result.catch(() => {
				if (active) help(true);
			});
		} catch {
			help(true);
		}
	}
	function leave() {
		if (!active) return;
		active = false;
		clearInput();
		const pose = viewer.flyPose;
		viewer.flyPose = null;
		if (viewer.adoptFlyPose) viewer.adoptFlyPose(pose);
		else {
			viewer.trainingPose = {
				...viewer.trainingPose,
				eye: [...pose.eye],
				basis: pose.basis.map((v) => [...v])
			};
			viewer.distance = Math.max(.01, viewer.distance / viewer.camera.zoom);
			viewer.camera.zoom = 1;
			viewer.camera.pan = [0, 0];
			viewer.target = pose.eye.map((v, i) => v - pose.basis[2][i] * viewer.distance);
		}
		hud.hidden = true;
		stage.classList.remove("gs-fly-active");
		entry.setAttribute("aria-pressed", "false");
		canvas.style.cursor = savedCursor;
		locked = false;
		if (document.pointerLockElement === canvas) document.exitPointerLock();
		viewer.requestRender();
		entry.focus({ preventScroll: true });
	}
	entry.onclick = () => active ? leave() : enter();
	exit.onclick = leave;
	on(document, "pointerlockchange", () => {
		if (document.pointerLockElement === canvas) {
			if (!active) {
				document.exitPointerLock();
				return;
			}
			locked = true;
		} else if (locked) leave();
	});
	on(document, "pointerlockerror", () => {
		if (active) help(true);
	});
	on(document, "mousemove", (e) => {
		if (active && document.pointerLockElement === canvas) turn(e.movementX, e.movementY);
	});
	const movement = /* @__PURE__ */ new Set([
		"KeyQ",
		"KeyE",
		"KeyW",
		"KeyA",
		"KeyS",
		"KeyD",
		"ArrowUp",
		"ArrowDown",
		"ArrowLeft",
		"ArrowRight",
		"Space",
		"ShiftLeft",
		"ShiftRight",
		"ControlLeft",
		"ControlRight"
	]);
	on(document, "keydown", (e) => {
		if (!active) return;
		if (e.code === "Escape") {
			e.preventDefault();
			e.stopImmediatePropagation();
			leave();
			return;
		}
		if ([
			"INPUT",
			"TEXTAREA",
			"SELECT"
		].includes(e.target.tagName) || e.target.isContentEditable) return;
		e.stopImmediatePropagation();
		if (movement.has(e.code)) {
			e.preventDefault();
			keys.add(e.code);
			schedule();
		}
	}, true);
	on(document, "keyup", (e) => {
		if (!active) return;
		keys.delete(e.code);
		if (movement.has(e.code)) {
			e.preventDefault();
			e.stopImmediatePropagation();
		}
	}, true);
	on(window, "blur", leave);
	on(document, "visibilitychange", () => {
		if (document.hidden) leave();
	});
	on(canvas, "webglcontextlost", leave);
	function bindLook(el) {
		on(el, "pointerdown", (e) => {
			if (!active || document.pointerLockElement === canvas || lookPointer || e.button !== 0) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			el.setPointerCapture(e.pointerId);
			lookPointer = {
				id: e.pointerId,
				x: e.clientX,
				y: e.clientY
			};
		}, true);
		on(el, "pointermove", (e) => {
			if (!active || lookPointer?.id !== e.pointerId) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			turn(e.clientX - lookPointer.x, e.clientY - lookPointer.y);
			lookPointer.x = e.clientX;
			lookPointer.y = e.clientY;
		}, true);
		for (const name of [
			"pointerup",
			"pointercancel",
			"lostpointercapture"
		]) on(el, name, (e) => {
			if (lookPointer?.id === e.pointerId) lookPointer = null;
		});
	}
	bindLook(canvas);
	bindLook(look);
	function stick(e) {
		const r = pad.getBoundingClientRect(), radius = r.width * .32, dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2, length = Math.hypot(dx, dy), scale = length > radius ? radius / length : 1;
		joystick = length < radius * .08 ? [0, 0] : [dx * scale / radius, -dy * scale / radius];
		thumb.style.transform = `translate(${dx * scale}px,${dy * scale}px)`;
		schedule();
	}
	on(pad, "pointerdown", (e) => {
		if (stickPointer !== null) return;
		e.preventDefault();
		stickPointer = e.pointerId;
		pad.setPointerCapture(e.pointerId);
		stick(e);
	});
	on(pad, "pointermove", (e) => {
		if (e.pointerId === stickPointer) {
			e.preventDefault();
			stick(e);
		}
	});
	for (const name of [
		"pointerup",
		"pointercancel",
		"lostpointercapture"
	]) on(pad, name, (e) => {
		if (stickPointer === e.pointerId) {
			stickPointer = null;
			joystick = [0, 0];
			thumb.style.transform = "";
		}
	});
	on(touchMode, "change", () => {
		if (active) leave();
	});
	canvas.tabIndex = 0;
	canvas.classList.add("camera-scene");
	viewer.fly = {
		get active() {
			return active;
		},
		leave,
		dispose() {
			leave();
			listeners.forEach((fn) => fn());
			entry.remove();
			section.remove();
			hud.remove();
		}
	};
	return viewer.fly;
}
//#endregion
//#region src/shared/camera-navigation.js
var CAMERA_NAV_DEFAULTS = Object.freeze({
	rotateSpeed: .3,
	panSpeed: .65,
	zoomSpeed: .55,
	pivot: "view",
	adaptive: true,
	smoothing: true,
	smoothingMs: 100
});
var CAMERA_NAV_STORAGE = "BuildingWebViewer.camera.navigation.v2";
function cameraNavigationSettings(value = {}) {
	const result = { ...CAMERA_NAV_DEFAULTS };
	for (const key of [
		"rotateSpeed",
		"panSpeed",
		"zoomSpeed",
		"smoothingMs"
	]) {
		const v = value?.[key], lo = key === "smoothingMs" ? 20 : .05, hi = key === "smoothingMs" ? 350 : 2;
		if (typeof v === "number" && Number.isFinite(v)) result[key] = Math.max(lo, Math.min(hi, v));
	}
	for (const key of ["adaptive", "smoothing"]) if (typeof value?.[key] === "boolean") result[key] = value[key];
	if ([
		"view",
		"fixed",
		"model"
	].includes(value?.pivot)) result.pivot = value.pivot;
	return result;
}
function cameraNavigationScale(viewer, settings) {
	const zoom = Math.max(.02, viewer.camera.zoom), height = Math.max(1, viewer.canvas.clientHeight);
	const perspective = viewer.projection !== "orthographic";
	const span = perspective ? 2 * viewer.distance / zoom * Math.tan(viewer.fov * Math.PI / 360) : viewer.baseHeight / zoom;
	const adaptive = settings.adaptive ? Math.max(.1, Math.min(2, (perspective ? viewer.fov / 55 : 1) / Math.sqrt(zoom))) : 1;
	return {
		rotateX: .35 * settings.rotateSpeed * adaptive,
		rotateY: .3 * settings.rotateSpeed * adaptive,
		pan: settings.panSpeed * (settings.adaptive ? span : viewer.baseHeight / zoom) / height
	};
}
/** Integrate remaining input with an elapsed-time exponential filter, not a
* frame-count multiplier. This converges to the same pose at 30/60/120 Hz.
* No velocity extrapolation: releasing the pointer only finishes received input.
*/
var CameraNavigation = class {
	constructor(settings = {}) {
		this.settings = cameraNavigationSettings(settings);
		this.reset();
	}
	reset() {
		this.pending = [
			0,
			0,
			0,
			0,
			0
		];
		this.lastTime = null;
		this.age = 0;
	}
	get active() {
		return this.pending.some((value) => value !== 0);
	}
	enqueue(delta, now) {
		if (!this.active) {
			this.lastTime = now;
			this.age = 0;
		}
		for (let i = 0; i < 5; i++) this.pending[i] += Number.isFinite(delta[i]) ? delta[i] : 0;
		this.age = 0;
	}
	step(now) {
		if (!this.active) return [
			0,
			0,
			0,
			0,
			0
		];
		const dt = Math.max(0, now - (this.lastTime ?? now));
		this.lastTime = now;
		this.age += dt;
		const done = !this.settings.smoothing || this.age >= this.settings.smoothingMs * 8;
		const alpha = done ? 1 : -Math.expm1(-dt / this.settings.smoothingMs);
		return this.pending.map((value, i) => {
			const applied = value * alpha;
			this.pending[i] = done ? 0 : value - applied;
			return applied;
		});
	}
};
//#endregion
//#region src/shared/camera-navigation-controls.js
function mountCameraNavigationControls(container, viewer) {
	const en = document.documentElement.lang === "en", label = (zh, english) => en ? english : zh;
	const node = (tag, text) => {
		const element = document.createElement(tag);
		if (text) element.textContent = text;
		return element;
	};
	const section = node("details");
	section.className = "gs-navigation";
	section.open = true;
	section.append(node("summary", label("环绕浏览手感", "Orbit navigation feel")));
	const fields = /* @__PURE__ */ new Map();
	const pivotLabel = node("label", label("旋转中心", "Orbit pivot")), pivot = node("select");
	pivot.setAttribute("aria-label", label("旋转中心", "Orbit pivot"));
	for (const [value, zh, en] of [
		[
			"view",
			"当前视野中心（自动）",
			"View center (automatic)"
		],
		[
			"fixed",
			"固定观察点",
			"Fixed focus point"
		],
		[
			"model",
			"模型中心",
			"Model center"
		]
	]) {
		const option = node("option", label(zh, en));
		option.value = value;
		pivot.append(option);
	}
	pivot.onchange = () => {
		status.textContent = "";
		viewer.setNavigation({ pivot: pivot.value });
		refresh();
	};
	pivotLabel.append(pivot);
	section.append(pivotLabel);
	const anchor = node("button", label("锁定当前视野中心", "Lock current view center"));
	anchor.type = "button";
	anchor.onclick = () => {
		viewer.focusOrbit();
		refresh();
	};
	section.append(anchor);
	const status = node("p");
	status.className = "presentation-help";
	status.setAttribute("role", "status");
	section.append(status);
	viewer.onOrbitAnchor = (hit) => {
		status.textContent = hit ? label("已锁定观察点。双击模型可重新指定。", "Focus locked. Double-click the model to choose another point.") : label("附近没有有效数据，沿用当前观察距离。", "No nearby data; keeping the current viewing distance.");
		refresh();
	};
	section.append(node("p", label("自动：每次拖动开始时，按画面中央数据估计深度；拖动期间不切换。固定：围绕已锁定点。模型：围绕整组数据中心。双击模型可指定固定点；平移后可重新锁定。点云 / 高斯深度为估计值，透明或稀疏区域可能不准确。", "Automatic estimates center depth once per gesture. Fixed orbits the locked point; Model uses the scene center. Double-click to choose a fixed point; relock after panning. Point-cloud / Gaussian depth is approximate in sparse or transparent areas.")));
	function numeric(key, zh, english, min, max, step, suffix) {
		const row = node("div");
		row.className = "gs-navigation-field";
		row.append(node("span", label(zh, english)));
		const range = node("input"), number = node("input");
		range.type = "range";
		number.type = "number";
		for (const input of [range, number]) {
			input.min = min;
			input.max = max;
			input.step = step;
			input.setAttribute("aria-label", label(zh, english) + (input === range ? label("滑块", " slider") : label("数值", " value")));
		}
		const commit = (input, revert = false) => {
			const value = Number(input.value);
			if (input.value === "" || !Number.isFinite(value) || value < min || value > max) {
				if (revert) refresh();
				return;
			}
			viewer.setNavigation({ [key]: value });
			refresh(revert ? null : input);
		};
		range.oninput = () => commit(range);
		number.oninput = () => commit(number);
		number.onchange = () => commit(number, true);
		row.append(range, number, node("small", suffix));
		section.append(row);
		fields.set(key, {
			range,
			number
		});
	}
	numeric("rotateSpeed", "旋转速度", "Orbit speed", .05, 2, .05, "×");
	numeric("panSpeed", "平移速度", "Pan speed", .05, 2, .05, "×");
	numeric("zoomSpeed", "缩放速度", "Zoom speed", .05, 2, .05, "×");
	function toggle(key, zh, english) {
		const row = node("label"), input = node("input");
		row.className = "gs-navigation-toggle";
		input.type = "checkbox";
		input.setAttribute("aria-label", label(zh, english));
		row.append(input, node("span", label(zh, english)));
		section.append(row);
		input.onchange = () => {
			viewer.setNavigation({ [key]: input.checked });
			refresh();
		};
		fields.set(key, { input });
	}
	toggle("adaptive", "随视距与视野自适应", "Adapt to distance and field of view");
	toggle("smoothing", "平滑移动", "Smooth movement");
	numeric("smoothingMs", "平滑时间", "Smoothing time", 20, 350, 10, "ms");
	const help = node("p", label("靠近模型、缩小视野时更细腻。平滑时间越大，跟随越柔和、延迟越明显；关闭即直接响应。Ctrl / ⌘ 拖动可临时降至 20% 速度。设置自动保存在本机浏览器。", "Closer views and narrower fields of view allow finer control. Longer smoothing is softer but adds latency; switch it off for direct input. Ctrl / ⌘ drag uses 20% speed. Preferences are saved in this browser."));
	help.className = "presentation-help";
	section.append(help);
	const reset = node("button", label("恢复默认手感", "Reset navigation"));
	reset.type = "button";
	reset.onclick = () => {
		viewer.setNavigation(CAMERA_NAV_DEFAULTS);
		refresh();
	};
	section.append(reset);
	function refresh(editing = null) {
		pivot.value = viewer.navigation.settings.pivot;
		for (const [key, field] of fields) if (field.input) field.input.checked = viewer.navigation.settings[key];
		else {
			field.range.value = viewer.navigation.settings[key];
			if (editing !== field.number) field.number.value = viewer.navigation.settings[key];
			field.range.disabled = field.number.disabled = key === "smoothingMs" && !viewer.navigation.settings.smoothing;
		}
	}
	refresh();
	container.append(section);
}
//#endregion
//#region src/shared/file-save.js
/** One download/share path for browser and native WebView. Resolve DOM/URL in the caller's document. */
async function saveLocalBlob(blob, name, { document: doc = globalThis.document, window: host = doc?.defaultView || globalThis } = {}) {
	if (await mobileShareBlob(blob, name)) return;
	const urls = host.URL || globalThis.URL, url = urls.createObjectURL(blob), link = doc.createElement("a");
	try {
		link.href = url;
		link.download = name;
		link.click();
	} catch (error) {
		urls.revokeObjectURL(url);
		throw error;
	}
	(host.setTimeout?.bind(host) || globalThis.setTimeout)(() => urls.revokeObjectURL(url), 6e4);
}
//#endregion
//#region src/shared/render-style.js
/** Shared display-only options. Geometry and exported point attributes stay unchanged. */
var PRESENTATION_DEFAULTS = Object.freeze({
	pointStyle: "disc",
	pointRatio: 100,
	lineStyle: "native",
	lineWidth: 2,
	lineGradient: false,
	lineEndColor: "#417ec4",
	surfaceStyle: "matte",
	axes: true,
	ruler: true,
	legend: true,
	pointCountLabel: true
});
var PRESENTATION_STORAGE_KEY = "BuildingWebViewer.presentation.v1";
var presentationEnums = {
	pointStyle: [
		"disc",
		"square",
		"sphere"
	],
	lineStyle: [
		"native",
		"cylinder",
		"box"
	],
	surfaceStyle: [
		"matte",
		"unlit",
		"gloss"
	]
};
/** Only capability-independent visual preferences travel between tools. Sampling is always explicit. */
function normalizePresentation(options = {}) {
	const clean = {};
	if (!options || typeof options !== "object" || Array.isArray(options)) return clean;
	for (const [key, fallback] of Object.entries(PRESENTATION_DEFAULTS)) {
		const value = options[key];
		if (presentationEnums[key]?.includes(value) || typeof fallback === "boolean" && typeof value === "boolean" || key === "pointRatio" && Number.isFinite(value) && value >= 1 && value <= 100 || key === "lineWidth" && Number.isFinite(value) && value >= .5 && value <= 24 || key === "lineEndColor" && typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) clean[key] = value;
	}
	return clean;
}
function portablePresentation(options) {
	const clean = normalizePresentation(options);
	delete clean.lineStyle;
	delete clean.pointRatio;
	return clean;
}
var presentationPreferences = { ...PRESENTATION_DEFAULTS };
try {
	Object.assign(presentationPreferences, portablePresentation(JSON.parse(globalThis.localStorage?.getItem("BuildingWebViewer.presentation.v1") || "null")));
} catch {}
function currentPresentation() {
	return { ...presentationPreferences };
}
function rememberPresentation(options) {
	presentationPreferences = {
		...presentationPreferences,
		...normalizePresentation(options)
	};
	try {
		globalThis.localStorage?.setItem(PRESENTATION_STORAGE_KEY, JSON.stringify(portablePresentation(presentationPreferences)));
	} catch {}
}
function displaySampleIndices(total, ratio) {
	if (!Number.isSafeInteger(total) || total < 0 || total > 4294967295 || !Number.isFinite(ratio) || ratio < 1 || ratio > 100) throw Error("Invalid display sampling size or percentage");
	const count = Math.floor(total * ratio / 100);
	const indices = total > 65535 ? new Uint32Array(count) : new Uint16Array(count);
	for (let i = 0; i < count; i++) {
		const low = Math.floor(i * total / count), high = Math.floor((i + 1) * total / count);
		let hash = i + 2654435769 >>> 0;
		hash = Math.imul(hash ^ hash >>> 16, 569420461);
		hash = Math.imul(hash ^ hash >>> 15, 1935289751);
		hash = (hash ^ hash >>> 15) >>> 0;
		indices[i] = low + Math.floor(hash / 4294967296 * (high - low));
	}
	return indices;
}
function niceScale(unitsPerPixel, pixels = 90) {
	if (!(unitsPerPixel > 0) || !Number.isFinite(unitsPerPixel)) return null;
	const raw = unitsPerPixel * pixels, power = 10 ** Math.floor(Math.log10(raw)), n = raw / power;
	const length = (n >= 5 ? 5 : n >= 2 ? 2 : 1) * power;
	return {
		length,
		pixels: length / unitsPerPixel
	};
}
function rgbHex(hex) {
	return [
		1,
		3,
		5
	].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}
//#endregion
//#region src/shared/scene-guides.js
/** The ruler measures screen-plane distance, never assumes meters. */
function drawSceneGuides(ctx, viewer, width, height, scale = 1) {
	const options = viewer.options;
	if (!(viewer.pointCount || viewer.edgeCount || viewer.triangleCount)) return;
	ctx.save();
	ctx.scale(scale, scale);
	const h = height / scale, [right, up, depth] = viewer.basis(), x = 44, y = h - 112;
	ctx.lineCap = "round";
	ctx.font = "bold 11px sans-serif";
	ctx.textAlign = "center";
	if (options.axes) {
		const colors = [
			"#bd4b50",
			"#37875f",
			"#427ebe"
		];
		[
			0,
			1,
			2
		].sort((a, b) => depth[a] - depth[b]).forEach((i) => {
			const dx = right[i] * 27, dy = -up[i] * 27;
			ctx.strokeStyle = colors[i];
			ctx.fillStyle = colors[i];
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(x, y);
			ctx.lineTo(x + dx, y + dy);
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(x + dx, y + dy, 2.8, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillText("XYZ"[i], x + right[i] * 38, y - up[i] * 38 + 4);
		});
	}
	if (options.ruler && viewer.projection !== "perspective") {
		const ruler = niceScale(viewer.baseHeight / viewer.camera.zoom / (height / scale));
		if (ruler) {
			ctx.strokeStyle = "#526d66";
			ctx.fillStyle = "#526d66";
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(16, h - 70);
			ctx.lineTo(16 + ruler.pixels, h - 70);
			for (const px of [16, 16 + ruler.pixels]) {
				ctx.moveTo(px, h - 74);
				ctx.lineTo(px, h - 66);
			}
			ctx.stroke();
			ctx.font = "10px sans-serif";
			ctx.textAlign = "left";
			ctx.fillText(`${Number(ruler.length.toPrecision(3))} ${t(viewer.options.scale === "normalized" ? "布局单位" : "坐标单位")}`, 16, h - 52);
		}
	}
	const available = Math.max(80, width / scale - 32);
	if (options.pointCountLabel && viewer.pointCount) {
		const count = options.showPoints ? (viewer.pointLayer?.entries || viewer.activeClouds || []).reduce((sum, e) => sum + Math.floor(e.count * (options.pointRatio ?? 100) / 100), 0) : 0;
		ctx.font = "10px sans-serif";
		ctx.textAlign = "left";
		ctx.fillStyle = "#526d66";
		ctx.fillText(t("显示 {0} / {1} 点", [count.toLocaleString(), viewer.pointCount.toLocaleString()]), Math.min(150, available / 2), h - 48, available / 2);
	}
	if (options.legend) {
		const overlay = viewer.pointLayer && options.showMesh === false && options.showPoints !== false;
		const range = (overlay ? !!viewer.pointLayer.colorRange : viewer.activeClouds ? options.showPoints && viewer.activeClouds.some((e) => !e.item?.displayColor) : options.showMesh !== false && options.colors === "height" && options.mode !== "wire") ? overlay ? viewer.pointLayer.colorRange : viewer.activeClouds ? viewer.colorRange : options.range || viewer.heightRange : null;
		ctx.textAlign = "left";
		ctx.font = "10px sans-serif";
		ctx.fillStyle = "#526d66";
		if (range && Number.isFinite(range.min) && Number.isFinite(range.max)) {
			const label = overlay ? viewer.pointLayer.effectiveColorMode === "height" ? t("高度 Z") : viewer.pointLayer.effectiveColorMode.replace(/^field:/, "") : options.colors === "height" ? t("相对高度") : viewer.effectiveColorMode === "height" ? t("高度 Z") : viewer.effectiveColorMode?.replace(/^field:/, "") || "";
			const barWidth = Math.min(90, available * .26), barX = 16, barY = h - 24, gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
			for (let i = 0; i <= 8; i++) gradient.addColorStop(i / 8, `rgb(${samplePalette(i / 8, options.palette, options.reverse).map((v) => Math.round(v * 255)).join(",")})`);
			ctx.fillStyle = gradient;
			ctx.fillRect(barX, barY, barWidth, 8);
			ctx.fillStyle = "#526d66";
			ctx.fillText(`${label} · ${Number(range.min.toPrecision(5))} — ${Number(range.max.toPrecision(5))}`, barX + barWidth + 8, h - 17, Math.max(10, available - barWidth - 8));
		} else if (options.showMesh !== false && options.colors === "surface" && options.mode !== "wire" && viewer.triangleCount) {
			ctx.fillStyle = "#7596ab";
			ctx.fillRect(16, h - 25, 9, 9);
			ctx.fillStyle = "#526d66";
			ctx.fillText(t("非竖直面"), 31, h - 17);
			ctx.fillStyle = "#e8e3d6";
			ctx.fillRect(132, h - 25, 9, 9);
			ctx.fillStyle = "#526d66";
			ctx.fillText(t("近竖直面"), 147, h - 17);
		}
	}
	ctx.restore();
}
function updateSceneGuides(viewer, viewport = null) {
	if (viewer.exportTarget || !viewer.canvas.ownerDocument) return;
	const doc = viewer.canvas.ownerDocument, parent = viewer.canvas.parentElement;
	if (!parent) return;
	if (!viewer.guideCanvas) {
		viewer.guideCanvas = doc.createElement("canvas");
		viewer.guideCanvas.className = "scene-guides";
		viewer.guideCanvas.setAttribute("aria-hidden", "true");
		parent.append(viewer.guideCanvas);
	}
	viewer.guideCanvas.hidden = !(viewer.pointCount || viewer.edgeCount || viewer.triangleCount);
	if (!parent.classList.contains("shared-scene-overlays")) parent.classList.add("shared-scene-overlays");
	const canvas = viewer.guideCanvas, rect = viewport || viewer.canvas.getBoundingClientRect(), dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
	const w = Math.round(Math.min(420, rect.width) * dpr), h = Math.round(160 * dpr);
	const cssWidth = `${w / dpr}px`;
	if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
	if (canvas.width !== w || canvas.height !== h) {
		canvas.width = w;
		canvas.height = h;
	}
	const ctx = canvas.getContext("2d");
	ctx.clearRect(0, 0, w, h);
	ctx.save();
	ctx.translate(0, h - rect.height * dpr);
	drawSceneGuides(ctx, viewer, w, rect.height * dpr, dpr);
	ctx.restore();
}
//#endregion
//#region src/shared/image-export.js
function validateImageSize(width, height, maxSide = 8192) {
	if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 || width > maxSide || height > maxSide || width * height > 33554432) throw Error(t("图片尺寸需为 16–{0} 的整数，总像素不超过 3200 万。", [maxSide]));
	return {
		width,
		height
	};
}
/** Re-render using an RGBA/depth framebuffer, without resizing the visible canvas. */
function renderImagePixels(viewer, width, height, { transparent = false } = {}) {
	const gl = viewer.gl;
	if (viewer.disposed || viewer.contextLost || gl.isContextLost()) throw Error(t("渲染器暂不可用，请重新加载数据。"));
	validateImageSize(width, height, Math.min(8192, gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)));
	const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING), framebuffer = gl.createFramebuffer(), texture = gl.createTexture(), depth = gl.createRenderbuffer();
	try {
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
		if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw Error(t("无法分配导出画布，请降低分辨率。"));
		viewer.exportTarget = {
			width,
			height,
			transparent,
			scale: height / Math.max(1, viewer.canvas.clientHeight)
		};
		viewer.render();
		const raw = new Uint8Array(width * height * 4);
		gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
		if (gl.getError() !== gl.NO_ERROR) throw Error(t("导出读取失败，请降低分辨率。"));
		const pixels = new Uint8ClampedArray(raw.length), stride = width * 4;
		for (let y = 0; y < height; y++) pixels.set(raw.subarray((height - y - 1) * stride, (height - y) * stride), y * stride);
		if (transparent) for (let i = 0; i < pixels.length; i += 4) {
			const a = pixels[i + 3];
			if (a && a < 255) for (let c = 0; c < 3; c++) pixels[i + c] = Math.min(255, Math.round(pixels[i + c] * 255 / a));
		}
		return pixels;
	} finally {
		viewer.exportTarget = null;
		gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.bindRenderbuffer(gl.RENDERBUFFER, null);
		gl.deleteFramebuffer(framebuffer);
		gl.deleteTexture(texture);
		gl.deleteRenderbuffer(depth);
		viewer.render();
	}
}
function projectImagePoint(point, viewer, width, height) {
	if (viewer.projection === "perspective") {
		const p = gsProjectPosition(point, gsViewSpec(viewer, width, height));
		return p ? [p.x, p.y] : [NaN, NaN];
	}
	const [r, u] = viewer.basis(), h = viewer.baseHeight / viewer.camera.zoom, w = h * width / height;
	const p = point.map((v, i) => v - viewer.target[i]);
	const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
	return [(dot(p, r) - viewer.camera.pan[0]) / w * width + width / 2, height / 2 - (dot(p, u) - viewer.camera.pan[1]) / h * height];
}
/** Genuine vector linework. Intentionally no raster embedding or hidden-surface promise. */
function wireframeSVG(viewer, width, height, { transparent = false } = {}) {
	validateImageSize(width, height);
	if ((viewer.edgeCount ?? ((viewer.options.mode === "wire" || viewer.options.mode === "solid-wire" ? viewer.buffers?.allEdges?.count : viewer.buffers?.featureEdges?.count) || 0) / 2) > 2e5) throw Error(t("SVG 超过 20 万条线，请减少选择或使用位图导出。"));
	const segments = viewer.vectorSegments?.();
	if (!segments?.length) throw Error(t("当前没有可导出的线框。"));
	if (segments.length > 2e5) throw Error(t("SVG 超过 20 万条线，请减少选择或使用位图导出。"));
	const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`, "<title>BuildingWebViewer vector wireframe projection</title>"];
	if (!transparent) parts.push(`<rect width="100%" height="100%" fill="#f3f5f6"/>`);
	const stroke = /^#[a-f0-9]{6}$/i.test(viewer.options.wireColor || "") ? viewer.options.wireColor : "#496577";
	parts.push(`<g fill="none" stroke="${stroke}" stroke-width="${Number(viewer.options.lineWidth) || 1}" stroke-linecap="round">`);
	for (const [a, b] of segments) {
		const p = projectImagePoint(a, viewer, width, height), q = projectImagePoint(b, viewer, width, height);
		if ([...p, ...q].every(Number.isFinite)) parts.push(`<path d="M${p.map((n) => n.toFixed(3)).join(" ")}L${q.map((n) => n.toFixed(3)).join(" ")}"/>`);
	}
	parts.push("</g></svg>");
	return parts.join("\n");
}
async function downloadImageBlob(blob, filename, doc = document) {
	return saveLocalBlob(blob, filename, { document: doc });
}
function canvasImageBlob(canvas, format, quality = .92) {
	const mime = {
		png: "image/png",
		jpeg: "image/jpeg",
		webp: "image/webp"
	}[format];
	if (!mime) throw Error(t("不支持的图片格式"));
	return new Promise((resolve, reject) => canvas.toBlob((blob) => blob?.type === mime ? resolve(blob) : reject(Error(t("浏览器不支持此格式或图片尺寸，请改用 PNG 或减小尺寸。"))), mime, quality));
}
function mountImageExport({ root = document, getViewers, pauseSync = (callback) => callback() }) {
	const container = root.querySelector("#settings-panel-camera");
	if (!container) return;
	const doc = container.ownerDocument, section = doc.createElement("section");
	section.className = "inspector-section image-export";
	const el = (tag, text) => {
		const n = doc.createElement(tag);
		if (text) n.textContent = t(text);
		return n;
	};
	section.append(el("h3", "截图与导出"));
	const quick = root.getElementById("screenshot");
	if (quick) {
		quick.textContent = t("快速截图 PNG");
		section.append(quick);
	}
	const help = el("p", "快速截图使用当前渲染像素；高级导出按指定像素重新渲染。");
	help.className = "presentation-help";
	section.append(help);
	const details = el("details");
	details.append(el("summary", "高级导出"));
	section.append(details);
	function field(label, input) {
		input.setAttribute("aria-label", t(label));
		const node = el("label", label);
		node.append(input);
		details.append(node);
		return input;
	}
	const select = (values) => {
		const node = el("select");
		for (const [value, label] of values) {
			const o = el("option", label);
			o.value = value;
			node.append(o);
		}
		return node;
	};
	const format = field("格式", select([
		["png", "PNG · 无损"],
		["jpeg", "JPEG · 较小文件"],
		["webp", "WebP"],
		...root.body.dataset.tool === "pointcloud" || root.body.dataset.tool === "gaussian" ? [] : [["svg", "SVG · 线框矢量"]]
	]));
	const scope = field("导出视窗", select([
		["all", "所有可见视窗"],
		["0", "视窗 1"],
		...["wireframe", "lod"].includes(root.body.dataset.tool) ? [["1", "视窗 2"], ["2", "视窗 3"]] : []
	]));
	const preset = field("分辨率", select([
		["1920x1080", "1920 × 1080"],
		["3840x2160", "3840 × 2160"],
		["current", "当前渲染尺寸"],
		["custom", "自定义像素"]
	]));
	const antialias = field("抗锯齿", select([["1", "标准"], ["2", "2× 超采样"]]));
	const number = (value) => {
		const node = el("input");
		node.type = "number";
		node.min = "16";
		node.max = "8192";
		node.step = "1";
		node.value = value;
		return node;
	};
	const width = field("宽度（px）", number("1920")), height = field("高度（px）", number("1080"));
	const quality = number("92");
	quality.min = "1";
	quality.max = "100";
	field("压缩质量（%）", quality);
	const transparency = el("input");
	transparency.type = "checkbox";
	field("透明背景", transparency);
	const guides = field("截图内容", select([["clean", "纯净画面"], ["overlays", "包含已开启的辅助信息"]]));
	const note = el("p", "纯净画面只含渲染内容；辅助信息包含已开启的方向、标尺、图例与点数。网格随显示设置，页面按钮与编号标签不导出。多视窗横向拼接，宽度为总宽度。");
	note.className = "presentation-help";
	details.append(note);
	const svgNote = el("p", "SVG 仅导出线框投影：不含点云、实体面、遮挡、网格、方向标尺或立体线材质。");
	svgNote.className = "presentation-help";
	svgNote.hidden = true;
	details.append(svgNote);
	const submit = el("button", "导出图片"), status = el("p");
	status.setAttribute("role", "status");
	status.className = "presentation-help";
	details.append(submit, status);
	container.append(section);
	const visible = () => getViewers().filter((v) => !v.disposed && v.canvas.getBoundingClientRect().width > 0 && v.canvas.getBoundingClientRect().height > 0);
	const chosen = () => {
		const list = visible();
		return scope.value === "all" ? list : list[Number(scope.value)] ? [list[Number(scope.value)]] : [];
	};
	preset.onchange = () => {
		if (preset.value === "current") {
			const list = chosen();
			width.value = list.reduce((sum, v) => sum + v.canvas.width, 0) || 1920;
			height.value = list[0]?.canvas.height || 1080;
		} else if (preset.value !== "custom") [width.value, height.value] = preset.value.split("x");
	};
	width.oninput = height.oninput = () => {
		preset.value = "custom";
	};
	format.onchange = () => {
		const svg = format.value === "svg";
		svgNote.hidden = !svg;
		guides.disabled = svg;
		antialias.disabled = svg;
		quality.disabled = ["png", "svg"].includes(format.value);
		transparency.disabled = format.value === "jpeg";
	};
	format.onchange();
	async function save(quickMode = false) {
		const list = quickMode ? visible() : chosen();
		if (!list.length) throw Error(t("没有可导出的视窗。"));
		if (!list.some((v) => (v.pointCount || v.edgeCount || v.triangleCount) > 0)) throw Error(t("请先加载数据。"));
		const fmt = quickMode ? "png" : format.value;
		let w = Number(width.value), h = Number(height.value);
		if (quickMode) {
			pauseSync(() => list.forEach((v) => v.render()));
			w = list.reduce((sum, v) => sum + v.canvas.width, 0);
			h = Math.max(...list.map((v) => v.canvas.height));
		}
		validateImageSize(w, h);
		if (Math.floor(w / list.length) < 16) throw Error(t("每个视窗宽度至少为 16 像素。"));
		if (fmt === "svg") {
			if (list.length !== 1) throw Error(t("SVG 请指定单个视窗。"));
			await downloadImageBlob(new Blob([wireframeSVG(list[0], w, h, { transparent: transparency.checked })], { type: "image/svg+xml" }), "BuildingWebViewer.svg", doc);
			return;
		}
		const q = Number(quality.value);
		if (!quickMode && fmt !== "png" && (!Number.isFinite(q) || q < 1 || q > 100)) throw Error(t("压缩质量需在 1–100 之间。"));
		const output = doc.createElement("canvas");
		output.width = w;
		output.height = h;
		const ctx = output.getContext("2d");
		const transparent = !quickMode && transparency.checked && fmt !== "jpeg";
		if (!transparent) {
			ctx.fillStyle = "#f3f5f6";
			ctx.fillRect(0, 0, w, h);
		}
		let x = 0;
		for (let i = 0; i < list.length; i++) {
			const viewer = list[i], pw = quickMode ? viewer.canvas.width : Math.floor((i + 1) * w / list.length) - Math.floor(i * w / list.length), ph = quickMode ? viewer.canvas.height : h;
			if (quickMode) {
				pauseSync(() => viewer.render());
				ctx.drawImage(viewer.canvas, x, 0);
			} else {
				const aa = Number(antialias.value), pixels = pauseSync(() => renderImagePixels(viewer, pw * aa, ph * aa, { transparent }));
				const part = doc.createElement("canvas");
				part.width = pw * aa;
				part.height = ph * aa;
				part.getContext("2d").putImageData(new ImageData(pixels, pw * aa, ph * aa), 0, 0);
				ctx.drawImage(part, x, 0, pw, ph);
			}
			if (!quickMode && guides.value === "overlays") {
				const scale = ph / Math.max(1, viewer.canvas.clientHeight);
				ctx.save();
				ctx.beginPath();
				ctx.rect(x, 0, pw, ph);
				ctx.clip();
				ctx.translate(x, 0);
				drawSceneGuides(ctx, viewer, Math.min(pw, 420 * scale), ph, scale);
				ctx.restore();
			}
			x += pw;
		}
		await downloadImageBlob(await canvasImageBlob(output, fmt, q / 100), `BuildingWebViewer-${w}x${h}.${fmt === "jpeg" ? "jpg" : fmt}`, doc);
	}
	const run = async (quickMode) => {
		submit.disabled = true;
		if (quick) quick.disabled = true;
		status.textContent = t("正在导出…");
		try {
			await save(quickMode);
			status.textContent = t("图片已导出。");
		} catch (error) {
			status.textContent = error.message;
		} finally {
			submit.disabled = false;
			if (quick) quick.disabled = !visible().some((v) => (v.pointCount || v.edgeCount || v.triangleCount) > 0);
		}
	};
	submit.onclick = () => run(false);
	if (quick) quick.onclick = () => run(true);
}
//#endregion
//#region src/shared/presentation-controls.js
function mountPresentationControls({ root = document, getViewers, pauseSync = (callback) => callback() }) {
	const container = root.querySelector("#settings-panel-display");
	if (!container || container.querySelector(".presentation-controls")) return;
	const doc = container.ownerDocument, section = doc.createElement("section");
	section.className = "inspector-section presentation-controls";
	const el = (tag, text) => {
		const n = doc.createElement(tag);
		if (text) n.textContent = t(text);
		return n;
	};
	section.append(el("h3", "渲染样式"));
	const status = el("p");
	status.className = "presentation-help";
	status.setAttribute("role", "status");
	function field(name, label, kind, values) {
		const row = el("label", label), input = el(kind === "select" ? "select" : "input");
		input.setAttribute("aria-label", t(label));
		input.dataset.mobileKey = "presentation:" + name;
		const initial = currentPresentation()[name];
		if (kind === "select") {
			for (const [value, text] of values) {
				const o = el("option", text);
				o.value = value;
				input.append(o);
			}
			input.value = initial;
		} else if (kind === "checkbox") {
			input.type = "checkbox";
			input.checked = initial;
		} else if (kind === "color") {
			input.type = "color";
			input.value = initial || values;
		} else {
			input.type = "number";
			input.min = values[0];
			input.max = values[1];
			input.step = values[2];
			input.value = initial;
		}
		row.append(input);
		section.append(row);
		input.onchange = () => {
			const value = kind === "checkbox" ? input.checked : ["select", "color"].includes(kind) ? input.value : Number(input.value);
			if (kind === "number" && (!Number.isFinite(value) || value < Number(input.min) || value > Number(input.max))) {
				status.textContent = t("请输入范围内的数值。");
				return;
			}
			const prior = currentPresentation()[name], viewers = Array.from(getViewers()), previous = viewers.map((viewer) => viewer.options?.[name] ?? prior);
			try {
				pauseSync(() => {
					for (const viewer of viewers) viewer.setOptions({ [name]: value });
				});
				rememberPresentation({ [name]: value });
				status.textContent = name === "pointRatio" ? t("仅抽样当前显示点；原始数据与计算、文件导出不变。") : "";
			} catch (error) {
				pauseSync(() => {
					for (const [i, viewer] of viewers.entries()) try {
						viewer.setOptions({ [name]: previous[i] });
					} catch {}
				});
				if (kind === "checkbox") input.checked = prior;
				else input.value = prior;
				status.textContent = error.message;
			}
		};
		if (kind === "number") input.oninput = input.onchange;
		return input;
	}
	field("axes", "XYZ 朝向", "checkbox");
	field("ruler", "坐标比例尺", "checkbox");
	if (root.body.dataset.tool !== "gaussian") field("legend", "颜色图例", "checkbox");
	field("pointCountLabel", "显示点数", "checkbox");
	if (root.body.dataset.tool !== "lod" && root.body.dataset.tool !== "gaussian") {
		field("pointStyle", "点的样式", "select", [
			["disc", "圆点"],
			["square", "方点"],
			["sphere", "球形光照"]
		]);
		const ratio = field("pointRatio", "显示点比例（%）", "number", [
			1,
			100,
			1
		]);
		const slider = el("input");
		slider.type = "range";
		slider.min = 1;
		slider.max = 100;
		slider.step = 1;
		slider.value = ratio.value;
		slider.setAttribute("aria-label", t("拖动调整显示点比例"));
		const pair = el("span");
		pair.className = "presentation-range";
		ratio.before(pair);
		pair.append(slider, ratio);
		let pending = null;
		const applyRatio = ratio.onchange;
		const schedule = () => {
			if (pending === null) pending = requestAnimationFrame(() => {
				pending = null;
				applyRatio();
				slider.value = ratio.value;
			});
		};
		slider.oninput = () => {
			ratio.value = slider.value;
			schedule();
		};
		ratio.oninput = ratio.onchange = () => {
			if (ratio.value !== "" && ratio.checkValidity()) {
				slider.value = ratio.value;
				schedule();
			}
		};
		const help = el("p", "球形光照为拟球着色，不生成球体网格。比例抽样作用于当前勾选显示的点云，100% 恢复全部已加载点。");
		help.className = "presentation-help";
		section.append(help);
	}
	if (root.body.dataset.tool !== "pointcloud" && root.body.dataset.tool !== "gaussian") {
		const style = field("lineStyle", "线的样式", "select", [
			["native", "细线"],
			["cylinder", "圆柱"],
			["box", "方柱"]
		]);
		const width = field("lineWidth", "线宽（屏幕 px）", "number", [
			.5,
			24,
			.5
		]), gradient = field("lineGradient", "端点渐变（立体线）", "checkbox");
		const end = field("lineEndColor", "渐变终点颜色", "color", "#417ec4");
		const availability = () => {
			width.disabled = gradient.disabled = style.value === "native";
			end.disabled = style.value === "native" || !gradient.checked;
		};
		style.addEventListener("change", availability);
		gradient.addEventListener("change", availability);
		availability();
		const help = el("p", "立体线使用实例化绘制；渐变沿文件中的边方向变化。细线宽度由浏览器决定。");
		help.className = "presentation-help";
		section.append(help);
	}
	if (root.body.dataset.tool === "lod") field("surfaceStyle", "面的光照", "select", [
		["matte", "柔和光照"],
		["unlit", "无光照"],
		["gloss", "高光材质"]
	]);
	section.append(status);
	container.append(section);
}
//#endregion
//#region src/shared/sidebar.js
function projectSidebarWidth(value, available, inspector = false) {
	const maximum = Math.max(240, Math.min(500, available - 360 - (inspector && available >= 1200 ? 348 : 0)));
	return Math.round(Math.max(240, Math.min(maximum, Number.isFinite(value) ? value : 300)));
}
var PROJECT_SIDEBAR_STORAGE = "BWV.project-sidebar.v1";
function projectSidebarPreferences(value) {
	return {
		width: Number.isFinite(value?.width) ? Math.max(240, Math.min(500, value.width)) : 300,
		desktopCollapsed: typeof value?.desktopCollapsed === "boolean" ? value.desktopCollapsed : false,
		mobileCollapsed: typeof value?.mobileCollapsed === "boolean" ? value.mobileCollapsed : true
	};
}
function mountProjectSidebar({ workspace, sidebar, toggle, collapse, separator }) {
	const win = sidebar.ownerDocument.defaultView || window;
	const media = win.matchMedia?.("(max-width: 700px)");
	let preferences = projectSidebarPreferences();
	try {
		preferences = projectSidebarPreferences(JSON.parse(win.localStorage.getItem(PROJECT_SIDEBAR_STORAGE)));
	} catch {}
	let preferredWidth = preferences.width, width = preferredWidth, folded = false, resizing = null;
	const save = () => {
		try {
			win.localStorage.setItem(PROJECT_SIDEBAR_STORAGE, JSON.stringify(preferences));
		} catch {}
	};
	const foldKey = () => media?.matches ? "mobileCollapsed" : "desktopCollapsed";
	function apply() {
		width = projectSidebarWidth(preferredWidth, workspace.clientWidth, workspace.classList.contains("inspector-open"));
		workspace.style.setProperty("--project-width", `${width}px`);
		separator.setAttribute("aria-valuenow", String(width));
		separator.setAttribute("aria-valuemax", String(projectSidebarWidth(500, workspace.clientWidth, workspace.classList.contains("inspector-open"))));
	}
	function fold(value, remember = true) {
		const hadSidebarFocus = sidebar.contains(sidebar.ownerDocument.activeElement);
		folded = value;
		workspace.classList.toggle("project-collapsed", value);
		sidebar.inert = value;
		toggle.setAttribute("aria-expanded", String(!value));
		toggle.title = value ? t("展开项目栏") : t("收起项目栏");
		toggle.setAttribute("aria-label", toggle.title);
		toggle.classList.toggle("active", !value);
		collapse.setAttribute("aria-expanded", String(!value));
		collapse.setAttribute("aria-controls", sidebar.id);
		separator.tabIndex = value ? -1 : 0;
		if (value && hadSidebarFocus) toggle.focus();
		if (remember) {
			preferences[foldKey()] = value;
			save();
		}
	}
	toggle.onclick = () => fold(!folded);
	collapse.onclick = () => fold(true);
	separator.onpointerdown = (event) => {
		if (event.button !== 0 || folded) return;
		event.preventDefault();
		resizing = {
			pointer: event.pointerId,
			x: event.clientX,
			width
		};
		separator.setPointerCapture(event.pointerId);
		workspace.classList.add("project-resizing");
	};
	separator.onpointermove = (event) => {
		if (!resizing || event.pointerId !== resizing.pointer) return;
		preferredWidth = projectSidebarWidth(resizing.width + event.clientX - resizing.x, workspace.clientWidth, workspace.classList.contains("inspector-open"));
		preferences.width = preferredWidth;
		apply();
	};
	const stop = () => {
		if (resizing) save();
		resizing = null;
		workspace.classList.remove("project-resizing");
	};
	separator.onpointerup = (event) => {
		stop();
		if (separator.hasPointerCapture(event.pointerId)) separator.releasePointerCapture(event.pointerId);
	};
	separator.onpointercancel = stop;
	separator.onlostpointercapture = stop;
	separator.ondblclick = () => {
		preferredWidth = preferences.width = 300;
		apply();
		save();
	};
	separator.onkeydown = (event) => {
		if (![
			"ArrowLeft",
			"ArrowRight",
			"Home"
		].includes(event.key)) return;
		event.preventDefault();
		preferredWidth = preferences.width = event.key === "Home" ? 300 : projectSidebarWidth(width + (event.key === "ArrowRight" ? 16 : -16), workspace.clientWidth, workspace.classList.contains("inspector-open"));
		apply();
		save();
	};
	const observer = new ResizeObserver(apply);
	observer.observe(workspace);
	const mutation = new MutationObserver(apply);
	mutation.observe(workspace, {
		attributes: true,
		attributeFilter: ["class"]
	});
	const breakpoint = () => {
		stop();
		fold(preferences[foldKey()], false);
		apply();
	};
	if (media?.addEventListener) media.addEventListener("change", breakpoint);
	else media?.addListener?.(breakpoint);
	apply();
	fold(preferences[foldKey()], false);
	return { destroy() {
		stop();
		observer.disconnect();
		mutation.disconnect();
		if (media?.removeEventListener) media.removeEventListener("change", breakpoint);
		else media?.removeListener?.(breakpoint);
		toggle.onclick = collapse.onclick = null;
		for (const name of [
			"onpointerdown",
			"onpointermove",
			"onpointerup",
			"onpointercancel",
			"onlostpointercapture",
			"ondblclick",
			"onkeydown"
		]) separator[name] = null;
	} };
}
//#endregion
//#region src/shared/resource-monitor.js
function viewerResourceStats(viewers) {
	const totals = {
		models: 0,
		triangles: 0,
		points: 0,
		edges: 0,
		bufferBytes: 0,
		contextLost: false
	};
	const seen = /* @__PURE__ */ new Set();
	const addBuffer = (value) => {
		if (!value || seen.has(value)) return;
		seen.add(value);
		totals.bufferBytes += value.byteLength || 0;
	};
	for (const viewer of viewers) {
		if (!viewer || viewer.disposed) continue;
		totals.contextLost ||= Boolean(viewer.contextLost);
		totals.models += viewer.models?.length || 0;
		totals.triangles += viewer.triangleCount || 0;
		for (const entry of viewer.pointLayer?.entries || []) totals.bufferBytes += entry.bytes || 0;
		totals.points += viewer.pointCount || 0;
		totals.edges += viewer.edgeCount || 0;
		for (const buffer of Object.values(viewer.buffers || {})) addBuffer(buffer);
		for (const buffer of Object.values(viewer.styledLines?.shapes || {})) addBuffer(buffer);
		for (const entry of viewer.entityCache?.values() || []) {
			addBuffer(entry.points);
			addBuffer(entry.colors);
			addBuffer(entry.scalar);
			addBuffer(entry.sample);
		}
	}
	return totals;
}
function readableMemory(bytes) {
	if (!Number.isFinite(bytes) || bytes < 0) return t("不可用");
	if (bytes < 1024) return Math.round(bytes) + " B";
	if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + " KiB";
	return bytes >= 1024 ** 3 ? (bytes / 1024 ** 3).toFixed(2) + " GiB" : (bytes / 1024 ** 2).toFixed(1) + " MiB";
}
/** Read existing buffer metadata; never force a render or read back GPU buffers. */
function mountResourceMonitor({ root = document, getViewers = () => [] }) {
	const footer = root.querySelector(".workspace > main > footer");
	if (!footer || root.getElementById("resource-monitor")) return;
	const make = (tag, text) => {
		const node = root.createElement(tag);
		if (text) node.textContent = text;
		return node;
	};
	const details = make("details");
	details.id = "resource-monitor";
	details.className = "resource-monitor";
	const summary = make("summary", t("运行状态"));
	summary.setAttribute("aria-controls", "resource-panel");
	const panel = make("section");
	panel.id = "resource-panel";
	panel.className = "resource-panel";
	panel.setAttribute("aria-label", t("页面运行状态"));
	const heading = make("div");
	heading.className = "resource-heading";
	heading.append(make("strong", t("页面运行状态")));
	const close = make("button", "×");
	close.type = "button";
	close.setAttribute("aria-label", t("关闭运行状态"));
	heading.append(close);
	const list = make("dl"), values = {};
	for (const [key, label] of [
		["heap", "JS 堆内存（近似）"],
		["buffers", "几何缓冲"],
		["refresh", "界面刷新率（采样）"],
		["models", "已加载模型 / 三角面"],
		["clouds", "已加载点 / 线段"],
		["system", "电脑 CPU / GPU 占用"]
	]) {
		const row = make("div");
		values[key] = make("dd", "—");
		row.append(make("dt", t(label)), values[key]);
		list.append(row);
	}
	const note = make("p", t("JS 堆内存不是页面总内存；几何缓冲仅统计已上传的数据（含缓存），不含驱动、纹理和帧缓冲，也不是显存总占用。数据规模按各视窗合计。"));
	const rateNote = make("p", t("刷新率用于观察界面响应，不等于模型渲染帧率。仅展开时采样；后台暂停。系统占用请使用任务管理器。"));
	panel.append(heading, list, note, rateNote);
	details.append(summary, panel);
	footer.insertBefore(details, footer.querySelector(".project-links"));
	let frame = null, last = 0, frames = 0, lastRate = null, disposed = false;
	const count = (n) => Number(n).toLocaleString();
	function refresh() {
		if (disposed || root.hidden) return;
		const data = viewerResourceStats(getViewers());
		let heap = null;
		try {
			heap = globalThis.performance?.memory?.usedJSHeapSize;
		} catch {}
		values.heap.textContent = readableMemory(heap);
		values.buffers.textContent = data.contextLost ? t("上下文已丢失") : readableMemory(data.bufferBytes);
		values.refresh.textContent = lastRate === null ? "—" : Math.round(lastRate) + " Hz";
		values.models.textContent = count(data.models) + " / " + count(data.triangles);
		values.clouds.textContent = count(data.points) + " / " + count(data.edges);
		values.system.textContent = t("浏览器未提供");
		summary.title = t("查看当前页面的数据规模与运行状态");
	}
	function stop() {
		if (frame !== null) cancelAnimationFrame(frame);
		frame = null;
		last = 0;
		frames = 0;
		lastRate = null;
	}
	function tick(now) {
		if (disposed || !details.open || root.hidden) {
			stop();
			return;
		}
		if (!last) last = now;
		else frames++;
		if (now - last >= 1e3) {
			lastRate = frames * 1e3 / (now - last);
			last = now;
			frames = 0;
			refresh();
		}
		frame = requestAnimationFrame(tick);
	}
	function sample() {
		stop();
		refresh();
		if (details.open && !root.hidden) frame = requestAnimationFrame(tick);
	}
	details.addEventListener("toggle", sample);
	close.onclick = () => {
		details.open = false;
		summary.focus();
	};
	const onKey = (event) => {
		if (event.key === "Escape" && details.open) {
			details.open = false;
			summary.focus();
		}
	};
	const onOutside = (event) => {
		if (details.open && !details.contains(event.target)) details.open = false;
	};
	root.addEventListener("visibilitychange", sample);
	root.addEventListener("keydown", onKey);
	root.addEventListener("pointerdown", onOutside);
	refresh();
	return () => {
		disposed = true;
		stop();
		root.removeEventListener("visibilitychange", sample);
		root.removeEventListener("keydown", onKey);
		root.removeEventListener("pointerdown", onOutside);
		details.remove();
	};
}
//#endregion
//#region src/shared/viewer-projection.js
/** Change ordinary orbit-camera projection while preserving its apparent target-plane span. */
function setViewerProjection(viewers, projection, pauseSync = (callback) => callback()) {
	if (!["orthographic", "perspective"].includes(projection)) throw new Error("Unsupported camera projection");
	pauseSync(() => {
		for (const viewer of viewers) {
			viewer.stopNavigation?.();
			if (viewer.projection !== projection) {
				viewer.leaveTraining?.();
				const fy = viewer.orbitLens?.fy;
				const tangent = Number.isFinite(fy) && fy > 0 ? 1 / (2 * fy) : Math.tan((viewer.fov || 55) * Math.PI / 360);
				if (projection === "perspective") viewer.distance = viewer.baseHeight / (2 * tangent);
				else viewer.baseHeight = 2 * viewer.distance * tangent;
				viewer.projection = projection;
			}
			viewer.requestRender();
		}
	});
}
//#endregion
//#region src/shared/viewer-layout.js
/** A shared, non-modal inspector: the canvas remains usable while editing. */
function mountViewerLayout({ root = document, getViewers = () => [], pauseSync = (callback) => callback() } = {}) {
	const primary = getViewers()[0], cameraPanel = root.getElementById("camera-controls");
	if (primary?.navigation && !primary.fly && cameraPanel) {
		const navigationPanel = root.createElement("div");
		cameraPanel.prepend(navigationPanel);
		const setNavigation = primary.setNavigation;
		primary.setNavigation = (options) => pauseSync(() => {
			setNavigation(options);
			for (const other of getViewers()) if (other !== primary) other.setNavigation?.(options);
		});
		mountFlyCameraControls(primary, navigationPanel);
		mountCameraNavigationControls(navigationPanel, primary);
		const label = root.createElement("label"), select = root.createElement("select"), en = document.documentElement.lang === "en";
		label.textContent = en ? "Projection" : "投影模式";
		select.setAttribute("aria-label", label.textContent);
		for (const [value, zh, english] of [[
			"orthographic",
			"正交",
			"Orthographic"
		], [
			"perspective",
			"透视",
			"Perspective"
		]]) {
			const option = root.createElement("option");
			option.value = value;
			option.textContent = en ? english : zh;
			select.append(option);
		}
		select.value = primary.projection;
		select.onchange = () => setViewerProjection(getViewers(), select.value, pauseSync);
		label.append(select);
		cameraPanel.append(label);
		const old = primary.onViewChange;
		primary.onViewChange = (...args) => {
			select.value = primary.projection;
			old?.(...args);
		};
	}
	prepareInspectorNavigation(root);
	mountObjectBrowserControls({ root });
	mountResourceMonitor({
		root,
		getViewers
	});
	mountImageExport({
		root,
		getViewers,
		pauseSync
	});
	mountPresentationControls({
		root,
		getViewers,
		pauseSync
	});
	const sidebar = root.querySelector(".workspace > .sidebar");
	if (sidebar) {
		sidebar.id ||= "project-sidebar";
		const workspace = sidebar.parentElement;
		let toggle = root.getElementById("toggle-project");
		if (!toggle) {
			toggle = root.createElement("button");
			toggle.id = "toggle-project";
			toggle.type = "button";
		}
		root.querySelector(".toolbar.viewer-toolbar").prepend(toggle);
		toggle.innerHTML = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M9 4v16m4-11 3 3-3 3\"/></svg><span>" + t("项目") + "</span>";
		toggle.setAttribute("aria-controls", sidebar.id);
		let collapse = root.getElementById("collapse-project");
		if (!collapse) {
			collapse = root.createElement("button");
			collapse.id = "collapse-project";
			collapse.textContent = "‹";
			collapse.setAttribute("aria-label", t("收起项目栏"));
			sidebar.querySelector(".sidebar-heading").append(collapse);
		}
		let separator = root.querySelector(".project-resizer");
		if (!separator) {
			separator = root.createElement("div");
			separator.className = "project-resizer";
			separator.tabIndex = 0;
			separator.setAttribute("role", "separator");
			separator.setAttribute("aria-orientation", "vertical");
			separator.setAttribute("aria-label", t("调整项目栏宽度"));
			separator.setAttribute("aria-valuemin", "240");
			workspace.append(separator);
		}
		mountProjectSidebar({
			workspace,
			sidebar,
			toggle,
			collapse,
			separator
		});
	}
	const panel = root.getElementById("viewer-inspector");
	if (!panel) return null;
	const workspace = panel.parentElement;
	const triggers = [...root.querySelectorAll("[data-open-settings]")];
	const tabs = [...panel.querySelectorAll("[data-settings-tab]")];
	const sections = [...panel.querySelectorAll("[data-settings-panel]")];
	const closeButton = panel.querySelector("[data-close-settings]");
	let current = "display", returnFocus = null;
	function select(name, focus = false) {
		if (!tabs.some((tab) => tab.dataset.settingsTab === name)) return;
		current = name;
		for (const tab of tabs) {
			const active = tab.dataset.settingsTab === name;
			tab.setAttribute("aria-selected", String(active));
			tab.tabIndex = active ? 0 : -1;
			if (active && focus) tab.focus();
		}
		for (const section of sections) section.hidden = section.dataset.settingsPanel !== name;
		for (const trigger of triggers) {
			const active = !panel.hidden && trigger.dataset.openSettings === name;
			trigger.setAttribute("aria-expanded", String(active));
			trigger.classList.toggle("active", active);
		}
		const palette = panel.querySelector(".palette-panel");
		if (palette) palette.open = true;
		root.dispatchEvent(new CustomEvent("bwv-inspector-change", { detail: {
			open: !panel.hidden,
			tab: current
		} }));
	}
	function close() {
		if (panel.hidden) return;
		const hadFocus = panel.contains(root.activeElement);
		panel.hidden = true;
		workspace.classList.remove("inspector-open");
		select(current);
		if (hadFocus) returnFocus?.focus();
	}
	function open(name, trigger = null) {
		returnFocus = trigger || returnFocus;
		panel.hidden = false;
		workspace.classList.add("inspector-open");
		select(name, true);
	}
	for (const trigger of triggers) trigger.addEventListener("click", () => {
		const name = trigger.dataset.openSettings;
		if (!panel.hidden && name === current) close();
		else open(name, trigger);
	});
	for (const [index, tab] of tabs.entries()) {
		tab.addEventListener("click", () => select(tab.dataset.settingsTab));
		tab.addEventListener("keydown", (event) => {
			const target = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
			if (target < 0) return;
			event.preventDefault();
			select(tabs[target].dataset.settingsTab, true);
		});
	}
	closeButton.addEventListener("click", close);
	root.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && !event.defaultPrevented && !panel.hidden) {
			event.preventDefault();
			close();
		}
	});
	select(current);
	return {
		open,
		close
	};
}
//#endregion
//#region src/shared/orbit-camera.js
function gsOrbitRotate(v, axis, angle) {
	const c = Math.cos(angle), s = Math.sin(angle), d = gsDot3(v, axis);
	const cross = [
		axis[1] * v[2] - axis[2] * v[1],
		axis[2] * v[0] - axis[0] * v[2],
		axis[0] * v[1] - axis[1] * v[0]
	];
	return v.map((x, i) => x * c + cross[i] * s + axis[i] * d * (1 - c));
}
function gsSetOrbitBasis(viewer, basis) {
	const [right, , back] = basis, deg = 180 / Math.PI;
	const az = Math.atan2(back[1], back[0]), el = Math.asin(Math.max(-1, Math.min(1, back[2])));
	const r = [
		-Math.sin(az),
		Math.cos(az),
		0
	], u = [
		-Math.cos(az) * Math.sin(el),
		-Math.sin(az) * Math.sin(el),
		Math.cos(el)
	];
	viewer.camera.azimuth = az * deg;
	viewer.camera.elevation = el * deg;
	viewer.camera.roll = Math.atan2(gsDot3(right, u), gsDot3(right, r)) * deg;
}
/** Estimate depth from the nearest 32 projected Gaussian centers. Not a surface raycast.
* Runs once at gesture start; hidden/deleted/very transparent splats are excluded.
*/
function gsOrbitDepth(viewer, spec, x = spec.width / 2, y = spec.height / 2) {
	if (viewer.pickOrbitDepth) return viewer.pickOrbitDepth(spec, x, y);
	if (!viewer.packed) return null;
	const { centers, opacity } = viewer.packed, [r, u, b] = spec.basis;
	const radius = Math.max(12, Math.min(spec.width, spec.height) * .045), candidates = [];
	let limit = radius * radius;
	for (let i = 0; i < viewer.count; i++) {
		if ((viewer.flags?.[i] || 0) & 6 || opacity[i] < Math.max(.05, viewer.gauss.opacityCutoff)) continue;
		const dx = centers[i * 3] - spec.eye[0], dy = centers[i * 3 + 1] - spec.eye[1], dz = centers[i * 3 + 2] - spec.eye[2];
		const depth = -(dx * b[0] + dy * b[1] + dz * b[2]);
		if (depth <= spec.near) continue;
		const vx = dx * r[0] + dy * r[1] + dz * r[2], vy = dx * u[0] + dy * u[1] + dz * u[2];
		const px = spec.width / 2 + (spec.perspective ? spec.fx * vx / depth : vx * spec.height / spec.worldHeight) - x;
		const py = spec.height / 2 - (spec.perspective ? spec.fy * vy / depth : vy * spec.height / spec.worldHeight) - y;
		const d = px * px + py * py;
		if (d > limit) continue;
		candidates.push({
			d,
			depth
		});
		candidates.sort((a, b) => a.d - b.d);
		if (candidates.length > 32) candidates.pop();
		if (candidates.length === 32) limit = candidates[31].d;
	}
	if (!candidates.length) return null;
	candidates.sort((a, b) => a.depth - b.depth);
	return candidates[Math.floor((candidates.length - 1) * .25)].depth;
}
function gsReanchorOrbit(viewer, { model = false, x = null, y = null } = {}) {
	const spec = gsViewSpec(viewer, viewer.canvas.clientWidth, viewer.canvas.clientHeight), back = spec.basis[2];
	const picked = model ? null : gsOrbitDepth(viewer, spec, x ?? spec.width / 2, y ?? spec.height / 2);
	if (!model && x !== null && picked === null) return false;
	const fallback = Math.max(spec.near * 2, viewer.distance / viewer.camera.zoom);
	let depth = picked ?? fallback;
	let target = model ? viewer.worldCenter().map((v, i) => v - viewer.origin[i]) : spec.eye.map((v, i) => v - back[i] * depth);
	if (!model && x !== null) {
		const sx = spec.perspective ? (x - spec.width / 2) * depth / spec.fx : (x - spec.width / 2) * spec.worldHeight / spec.height;
		const sy = spec.perspective ? -(y - spec.height / 2) * depth / spec.fy : -(y - spec.height / 2) * spec.worldHeight / spec.height;
		target = target.map((v, i) => v + spec.basis[0][i] * sx + spec.basis[1][i] * sy);
	}
	const offset = spec.eye.map((v, i) => v - target[i]);
	depth = gsDot3(offset, back);
	if (depth <= spec.near) return false;
	viewer.target = target;
	viewer.distance = depth * viewer.camera.zoom;
	viewer.camera.pan = [gsDot3(offset, spec.basis[0]), gsDot3(offset, spec.basis[1])];
	if (viewer.trainingPose) {
		viewer.leaveTraining();
		viewer.camera.pan = [gsDot3(offset, spec.basis[0]), gsDot3(offset, spec.basis[1])];
		viewer.orbitLens = {
			fx: spec.fx / spec.height,
			fy: spec.fy / spec.height
		};
	}
	viewer.orbitAnchorHit = picked !== null;
	return picked !== null || model;
}
//#endregion
//#region src/shared/touch-camera.js
/** Pointer gestures shared by mesh, wireframe and point-cloud renderers. */
function mountTouchCamera(viewer, listen, { minElevation = -89 } = {}) {
	const fingers = /* @__PURE__ */ new Map();
	let previous = null;
	const pose = () => {
		const points = [...fingers.values()].slice(0, 2);
		return {
			count: points.length,
			x: points.reduce((n, p) => n + p.x, 0) / points.length,
			y: points.reduce((n, p) => n + p.y, 0) / points.length,
			distance: points.length === 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0
		};
	};
	listen("pointerdown", (event) => {
		if (viewer.fly?.active || event.pointerType !== "touch") return;
		if (!fingers.size) viewer.beginOrbit?.(false);
		event.preventDefault();
		fingers.set(event.pointerId, {
			x: event.clientX,
			y: event.clientY
		});
		viewer.canvas.setPointerCapture(event.pointerId);
		previous = pose();
	});
	listen("pointermove", (event) => {
		if (!fingers.has(event.pointerId)) return;
		event.preventDefault();
		fingers.set(event.pointerId, {
			x: event.clientX,
			y: event.clientY
		});
		const next = pose();
		if (previous && next.count === previous.count) {
			const dx = next.x - previous.x, dy = next.y - previous.y;
			if (viewer.navigatePixels) {
				viewer.navigatePixels(dx, dy, next.count !== 1);
				if (next.count === 2 && previous.distance > 2 && next.distance > 2) viewer.zoomBy(next.distance / previous.distance, false, false);
			} else if (next.count === 1) {
				viewer.camera.azimuth = (viewer.camera.azimuth - dx * .35) % 360;
				viewer.camera.elevation = Math.max(minElevation, Math.min(90, viewer.camera.elevation + dy * .3));
			} else {
				const step = viewer.baseHeight / viewer.camera.zoom / Math.max(1, viewer.canvas.clientHeight);
				viewer.camera.pan[0] -= dx * step;
				viewer.camera.pan[1] += dy * step;
				if (previous.distance > 2 && next.distance > 2) viewer.zoomBy(next.distance / previous.distance, false, false);
			}
			viewer.requestRender();
		}
		previous = next;
	});
	const finish = (event) => {
		if (!fingers.delete(event.pointerId)) return;
		previous = fingers.size ? pose() : null;
		if (viewer.canvas.hasPointerCapture(event.pointerId)) viewer.canvas.releasePointerCapture(event.pointerId);
	};
	for (const event of [
		"pointerup",
		"pointercancel",
		"lostpointercapture"
	]) listen(event, finish);
}
//#endregion
//#region src/shared/camera-controls.js
/** Shared camera snapshots and an optional, local-only control panel. */
var CAMERA_FORMAT = "BuildingWebViewer.camera";
var CAMERA_BOOK_FORMAT = "BuildingWebViewer.camera-bookmarks";
var CAMERA_SPACES = ["raw-world", "lod-arrangement"];
var CAMERA_MAX_BOOKMARKS = 100;
function cameraObject(value) {
	return value && typeof value === "object" && !Array.isArray(value);
}
function cameraFinite(value, label) {
	if (typeof value !== "number" || !Number.isFinite(value)) throw Error(t("{0}必须是有限数值", [label]));
	return value;
}
function cameraVector(value, length, label) {
	if (!Array.isArray(value) || value.length !== length) throw Error(t("{0}需要 {1} 个数值", [label, length]));
	return value.map((number) => cameraFinite(number, label));
}
function cameraSpace(space) {
	if (!CAMERA_SPACES.includes(space)) throw Error(t("相机坐标空间无效"));
	return space;
}
function cameraScene(scene, space) {
	if (scene == null && space === "raw-world") return null;
	if (!cameraObject(scene) || !Array.isArray(scene.ids) || scene.ids.length > 1e4 || scene.ids.some((id) => typeof id !== "string" || id.length > 1024)) throw Error(t("相机场景需要有效的文件或模型 ID 列表"));
	const result = { ids: [...scene.ids] };
	if (space === "lod-arrangement") {
		if (!["real", "normalized"].includes(scene.scale)) throw Error(t("网格相机需要记录实际比例或统一大小模式"));
		result.scale = scene.scale;
	}
	return result;
}
function cameraSameScene(a, b) {
	return a?.scale === b?.scale && a?.ids?.length === b?.ids?.length && a.ids.every((id, index) => id === b.ids[index]);
}
/** Validate before mutating a viewer; snapshots use original-world or synthetic-layout targets. */
function validateCameraSnapshot(value, { space = value?.space, scene = null, checkScene = true } = {}) {
	cameraSpace(space);
	if (!cameraObject(value) || value.format !== CAMERA_FORMAT || ![1, 2].includes(value.version)) throw Error(t("不是受支持的相机 JSON（需要 BuildingWebViewer.camera v1/v2）"));
	if (value.space !== space) throw Error(t("相机坐标空间不匹配：点云/线框视角与网格排列视角不能直接互用"));
	if (!["orthographic", "perspective"].includes(value.projection) || value.version === 1 && value.projection !== "orthographic") throw Error(t("相机投影与文件版本不兼容"));
	const source = value.camera;
	if (!cameraObject(source)) throw Error(t("相机参数缺失"));
	const azimuth = cameraFinite(source.azimuth, t("方位角")), elevation = cameraFinite(source.elevation, t("仰角"));
	const zoom = cameraFinite(source.zoom, t("缩放倍率")), baseHeight = cameraFinite(source.baseHeight, t("基准视野高度"));
	const limits = value.version === 2 ? {
		minElevation: -90,
		minZoom: .02,
		maxZoom: 100
	} : space === "lod-arrangement" ? {
		minElevation: 0,
		minZoom: .15,
		maxZoom: 30
	} : {
		minElevation: -89,
		minZoom: .02,
		maxZoom: 100
	};
	if (Math.abs(azimuth) > 1e6) throw Error(t("方位角数值过大"));
	if (elevation < limits.minElevation || elevation > 90) throw Error(t("仰角需在 {0}° 至 90° 之间", [limits.minElevation]));
	if (zoom < limits.minZoom || zoom > limits.maxZoom) throw Error(t("缩放倍率需在 {0} 至 {1} 之间", [limits.minZoom, limits.maxZoom]));
	if (!(baseHeight > 0) || !Number.isFinite(baseHeight / zoom)) throw Error(t("基准视野高度必须为有效正数"));
	let extended = {};
	if (value.version === 2) {
		const roll = cameraFinite(source.roll, "roll"), distance = cameraFinite(source.distance, "distance"), fov = cameraFinite(source.fov, "fov"), near = cameraFinite(source.near, "near");
		if (Math.abs(roll) > 1e6 || distance <= 0 || fov < 10 || fov > 120 || near <= 0) throw Error("Invalid perspective camera");
		extended = {
			roll,
			distance,
			fov,
			near
		};
		if (source.lens != null) {
			if (!cameraObject(source.lens) || !["fx", "fy"].every((k) => typeof source.lens[k] === "number" && Number.isFinite(source.lens[k]) && source.lens[k] > 0 && source.lens[k] <= 1e6)) throw Error("Invalid camera lens");
			extended.lens = {
				fx: source.lens.fx,
				fy: source.lens.fy
			};
		}
	}
	const savedScene = cameraScene(value.scene, space);
	if (space === "lod-arrangement" && checkScene && !cameraSameScene(savedScene, cameraScene(scene, space))) throw Error(t("网格布局不匹配：此书签需要模型 {0}，比例模式为{1}。请先恢复该布局再加载。", [savedScene.ids.join(", ").slice(0, 160) || t("（空）"), savedScene.scale === "real" ? t("实际比例") : t("统一展示大小")]));
	return {
		format: CAMERA_FORMAT,
		version: value.version,
		space,
		projection: value.projection,
		camera: {
			azimuth: ((azimuth + 180) % 360 + 360) % 360 - 180,
			elevation,
			zoom,
			...extended,
			pan: cameraVector(source.pan, 2, t("平移")),
			target: cameraVector(source.target, 3, t("目标点")),
			baseHeight
		},
		scene: savedScene
	};
}
function captureCameraSnapshot(viewer, { space, scene = null } = {}) {
	cameraSpace(space);
	if (!viewer?.camera) throw Error(t("相机尚未准备好"));
	const origin = space === "raw-world" ? cameraVector(viewer.origin || [
		0,
		0,
		0
	], 3, t("原点")) : [
		0,
		0,
		0
	];
	const camera = {
		...viewer.camera,
		pan: [...viewer.camera.pan]
	}, projection = viewer.projection || "orthographic";
	let localTarget = [...viewer.target], distance = viewer.distance || viewer.baseHeight * 2;
	const pose = viewer.flyPose || viewer.trainingPose;
	if (pose) {
		gsSetOrbitBasis({ camera }, pose.basis);
		distance /= camera.zoom;
		camera.zoom = 1;
		camera.pan = [0, 0];
		localTarget = pose.eye.map((v, i) => v - pose.basis[2][i] * distance);
	}
	let lens = viewer.orbitLens ? {
		fx: viewer.orbitLens.fx,
		fy: viewer.orbitLens.fy
	} : null;
	if (viewer.trainingPose) {
		const p = viewer.trainingPose, w = viewer.canvas?.clientWidth, h = viewer.canvas?.clientHeight;
		if (w > 0 && h > 0) {
			const fit = Math.min(w / p.width, h / p.height);
			lens = {
				fx: p.fx * fit / h,
				fy: p.fy * fit / h
			};
		}
	}
	const version = lens || projection === "perspective" || camera.roll || camera.elevation < -89 || space === "lod-arrangement" && (camera.elevation < 0 || camera.zoom < .15 || camera.zoom > 30) ? 2 : 1;
	const target = cameraVector(localTarget, 3, t("目标点")).map((value, axis) => value + origin[axis]);
	return validateCameraSnapshot({
		format: CAMERA_FORMAT,
		version,
		space,
		projection,
		scene,
		camera: {
			...camera,
			target,
			baseHeight: viewer.baseHeight,
			...version === 2 ? {
				roll: camera.roll || 0,
				distance,
				fov: viewer.fov || 55,
				near: viewer.near || .001,
				...lens ? { lens } : {}
			} : {}
		}
	}, {
		space,
		scene,
		checkScene: false
	});
}
function applyCameraSnapshot(viewers, snapshot, { space = snapshot?.space, scene = null, checkScene = true, pauseSync = (callback) => callback(), render = true } = {}) {
	const value = validateCameraSnapshot(snapshot, {
		space,
		scene,
		checkScene
	});
	if (!Array.isArray(viewers) || !viewers.length || viewers.some((viewer) => !viewer?.camera || typeof viewer.render !== "function")) throw Error(t("请先加载数据，再应用相机"));
	const targets = viewers.map((viewer) => {
		const origin = space === "raw-world" ? cameraVector(viewer.origin || [
			0,
			0,
			0
		], 3, t("原点")) : [
			0,
			0,
			0
		];
		return value.camera.target.map((number, axis) => cameraFinite(number - origin[axis], t("局部目标点")));
	});
	pauseSync(() => {
		viewers.forEach((viewer, index) => {
			viewer.stopNavigation?.();
			if (viewer.fly?.active) viewer.fly.leave();
			viewer.flyPose = null;
			viewer.trainingPose = null;
			viewer.orbitLens = value.camera.lens ? { ...value.camera.lens } : null;
			viewer.projection = value.projection;
			if (value.version === 2) {
				viewer.distance = value.camera.distance;
				viewer.fov = value.camera.fov;
				viewer.near = value.camera.near;
			}
			viewer.camera = {
				...value.version === 2 ? { roll: value.camera.roll } : {},
				azimuth: value.camera.azimuth,
				elevation: value.camera.elevation,
				zoom: value.camera.zoom,
				pan: [...value.camera.pan]
			};
			viewer.target = targets[index];
			viewer.baseHeight = value.camera.baseHeight;
		});
		if (render) viewers.forEach((viewer) => viewer.render());
	});
	return value;
}
function cameraBookmark(record, space, index) {
	if (!cameraObject(record) || typeof record.name !== "string" || !record.name.trim() || record.name.length > 80) throw Error(t("书签名称需为 1–80 个字符"));
	return {
		id: typeof record.id === "string" && record.id.trim() && record.id.length <= 128 ? record.id : `import-${index}`,
		name: record.name.trim(),
		snapshot: validateCameraSnapshot(record.snapshot, {
			space,
			checkScene: false
		}),
		...typeof record.updatedAt === "string" && record.updatedAt.length <= 64 && Number.isFinite(Date.parse(record.updatedAt)) ? { updatedAt: record.updatedAt } : {}
	};
}
function parseCameraBookmarks(input, space) {
	cameraSpace(space);
	const value = typeof input === "string" ? JSON.parse(input) : input;
	if (value?.format === CAMERA_FORMAT) return {
		preserveView: true,
		bookmarks: [{
			id: "import-0",
			name: t("导入视角"),
			snapshot: validateCameraSnapshot(value, {
				space,
				checkScene: false
			})
		}]
	};
	if (!cameraObject(value) || value.format !== CAMERA_BOOK_FORMAT || value.version !== 1 || value.space !== space || !Array.isArray(value.bookmarks) || value.bookmarks.length > CAMERA_MAX_BOOKMARKS) throw Error(t("书签 JSON 格式或坐标空间无效（最多 100 个书签）"));
	const bookmarks = value.bookmarks.map((record, index) => cameraBookmark(record, space, index));
	if (new Set(bookmarks.map((record) => record.id)).size !== bookmarks.length) throw Error(t("书签 ID 重复"));
	return {
		preserveView: value.preserveView !== false,
		bookmarks
	};
}
function serializeCameraBookmarks(bookmarks, space, preserveView = true) {
	const value = {
		format: CAMERA_BOOK_FORMAT,
		version: 1,
		space: cameraSpace(space),
		preserveView: Boolean(preserveView),
		bookmarks
	};
	parseCameraBookmarks(value, space);
	return JSON.stringify(value, null, 2);
}
/**
* Returns {preserveView, capture, restore, refresh, destroy}.
* Pass a separate bookmarkContainer to mount camera and bookmarks in two tabs.
* restore(saved, {checkScene:false}) preserves a view after changing data;
* bookmark loads retain strict mesh scene checking.
*/
function mountCameraControls({ container, bookmarkContainer = null, getViewers, space, getScene = () => null, pauseSync = (callback) => callback() } = {}) {
	cameraSpace(space);
	if (!container || typeof getViewers !== "function") throw Error(t("相机面板需要挂载容器和 getViewers"));
	const doc = container.ownerDocument, win = doc.defaultView || globalThis;
	const separateBookmarks = bookmarkContainer && bookmarkContainer !== container;
	const key = `BuildingWebViewer.camera-bookmarks.v1.${space}`;
	const limits = {
		minElevation: -90,
		minZoom: .02,
		maxZoom: 100
	};
	const watches = /* @__PURE__ */ new Map(), inputs = /* @__PURE__ */ new Map(), sliders = /* @__PURE__ */ new Map(), dragging = /* @__PURE__ */ new Set();
	let bookmarks = [], preserveView = true, selectedBookmark = "", disposed = false, frame = null, idCounter = 0;
	const pendingBookmarks = /* @__PURE__ */ new Map();
	let pendingPreserve = null;
	const el = (tag, text, className) => {
		const node = doc.createElement(tag);
		if (text !== void 0) node.textContent = text;
		if (className) node.className = className;
		return node;
	};
	const panel = el(separateBookmarks ? "section" : "details", void 0, `camera-controls${separateBookmarks ? " camera-controls-docked" : ""}`);
	const body = el("div", void 0, "camera-controls-body"), status = el("p", "", "camera-controls-status");
	status.setAttribute("role", "status");
	if (!separateBookmarks) panel.append(el("summary", t("精确相机与视角书签")));
	panel.append(body);
	container.replaceChildren(panel);
	const bookPanel = el("section", void 0, "camera-bookmarks");
	if (separateBookmarks) bookmarkContainer.replaceChildren(bookPanel);
	const bookStatus = separateBookmarks ? el("p", "", "camera-controls-status") : status;
	bookStatus.setAttribute("role", "status");
	const message = (text = "", error = false) => {
		for (const node of /* @__PURE__ */ new Set([status, bookStatus])) {
			node.textContent = text;
			node.classList.toggle("camera-controls-error", error);
		}
	};
	const attempt = (callback) => {
		try {
			return callback();
		} catch (error) {
			message(error.message || String(error), true);
			return null;
		}
	};
	const controls = [], bar = el("div", void 0, "camera-controls-bar"), preserveLabel = el("label", void 0, "camera-preserve");
	const preserveInput = el("input");
	preserveInput.type = "checkbox";
	preserveInput.checked = true;
	preserveInput.setAttribute("aria-label", t("增删文件时保持当前视角"));
	preserveLabel.append(preserveInput, doc.createTextNode(t("增删文件时保持当前视角")));
	const heightLabel = el("span", "", "camera-view-height");
	bar.append(preserveLabel, heightLabel);
	body.append(bar);
	const grid = el("div", void 0, "camera-controls-grid");
	body.append(grid);
	const advanced = el("details", void 0, "camera-advanced"), advancedGrid = el("div", void 0, "camera-controls-grid");
	advanced.append(el("summary", t("高级：平移与目标点")), advancedGrid);
	body.append(advanced);
	const specifications = [
		[
			"azimuth",
			t("方位角（°）"),
			.1
		],
		[
			"elevation",
			t("仰角（°）"),
			.1
		],
		[
			"zoom",
			t("缩放倍率"),
			.05
		],
		[
			"pan0",
			t("水平平移"),
			.1
		],
		[
			"pan1",
			t("垂直平移"),
			.1
		],
		[
			"target0",
			space === "raw-world" ? t("世界目标 X") : t("排列目标 X"),
			.1
		],
		[
			"target1",
			space === "raw-world" ? t("世界目标 Y") : t("排列目标 Y"),
			.1
		],
		[
			"target2",
			space === "raw-world" ? t("世界目标 Z") : t("排列目标 Z"),
			.1
		]
	];
	const uiScene = () => getScene() || (space === "lod-arrangement" ? {
		ids: [],
		scale: "real"
	} : null);
	const available = () => {
		const viewer = getViewers()?.[0];
		return Boolean(viewer && (space === "lod-arrangement" ? viewer.models?.length || uiScene()?.ids?.length : viewer.bounds));
	};
	function capture() {
		return available() ? captureCameraSnapshot(getViewers()[0], {
			space,
			scene: uiScene()
		}) : null;
	}
	function restore(snapshot, { checkScene = true } = {}) {
		if (!snapshot) return null;
		if (!available()) throw Error(t("请先加载数据，再应用相机"));
		const value = applyCameraSnapshot(getViewers(), snapshot, {
			space,
			scene: uiScene(),
			checkScene,
			pauseSync
		});
		message(t("视角已应用。"));
		refresh();
		return value;
	}
	function inputValue(snapshot, name) {
		return name.startsWith("pan") ? snapshot.camera.pan[Number(name.slice(3))] : name.startsWith("target") ? snapshot.camera.target[Number(name.slice(6))] : snapshot.camera[name];
	}
	function displayNumber(value, name) {
		return name.startsWith("target") ? String(value) : String(Number(value.toPrecision(12)));
	}
	function snapshotWithInput(name, raw) {
		const snapshot = capture();
		if (!snapshot) throw Error(t("请先加载数据，再调整相机"));
		if (!String(raw).trim()) throw Error(t("相机参数不能为空"));
		const value = Number(raw);
		if (snapshot.version === 1) {
			const viewer = getViewers()[0];
			snapshot.version = 2;
			Object.assign(snapshot.camera, {
				roll: viewer.camera.roll || 0,
				distance: viewer.distance || viewer.baseHeight * 2,
				fov: viewer.fov || 55,
				near: viewer.near || .001
			});
		}
		if (name.startsWith("pan")) snapshot.camera.pan[Number(name.slice(3))] = value;
		else if (name.startsWith("target")) snapshot.camera.target[Number(name.slice(6))] = value;
		else snapshot.camera[name] = value;
		return validateCameraSnapshot(snapshot, {
			space,
			scene: uiScene()
		});
	}
	function applyInput(name, raw) {
		restore(snapshotWithInput(name, raw));
		message("");
	}
	function sliderPosition(name, value, slider) {
		if (name === "zoom") return Math.max(0, Math.min(1e3, 1e3 * Math.log(value / limits.minZoom) / Math.log(limits.maxZoom / limits.minZoom)));
		if (name === "azimuth" && value === -180 && Number(slider.value) === 180) return 180;
		return value;
	}
	function sliderNumber(name, raw) {
		const value = Number(raw), slider = sliders.get(name);
		if (!String(raw).trim() || !Number.isFinite(value) || value < Number(slider.min) || value > Number(slider.max)) throw Error(t("滑块数值超出范围"));
		if (name !== "zoom") return value;
		if (value === 0) return limits.minZoom;
		if (value === 1e3) return limits.maxZoom;
		return limits.minZoom * Math.exp(value / 1e3 * Math.log(limits.maxZoom / limits.minZoom));
	}
	for (const [name, label, step] of specifications) {
		const basic = [
			"azimuth",
			"elevation",
			"zoom"
		].includes(name);
		const group = el("div", void 0, `camera-number-field${basic ? " camera-slider-field" : ""}`), caption = el("span", label), row = el("span", void 0, "camera-number-row");
		const minus = el("button", "−"), input = el("input"), plus = el("button", "+");
		for (const button of [minus, plus]) {
			button.type = "button";
			button.setAttribute("aria-label", `${button === minus ? t("减小") : t("增大")}${label}`);
		}
		input.type = "number";
		input.step = String(step);
		input.setAttribute("aria-label", label);
		input.autocomplete = "off";
		if (name === "elevation") {
			input.min = String(limits.minElevation);
			input.max = "90";
		}
		if (name === "zoom") {
			input.min = String(limits.minZoom);
			input.max = String(limits.maxZoom);
		}
		input.addEventListener("input", () => {
			let snapshot;
			try {
				snapshot = snapshotWithInput(name, input.value);
			} catch {
				return;
			}
			attempt(() => {
				restore(snapshot);
				message("");
			});
		});
		input.addEventListener("change", () => attempt(() => applyInput(name, input.value)));
		input.addEventListener("blur", scheduleRefresh);
		for (const [button, direction] of [[minus, -1], [plus, 1]]) button.addEventListener("click", (event) => {
			event.preventDefault();
			attempt(() => {
				const snapshot = capture();
				if (!snapshot) throw Error(t("请先加载数据，再调整相机"));
				applyInput(name, Number((inputValue(snapshot, name) + direction * step).toPrecision(15)));
			});
		});
		row.append(minus, input, plus);
		group.append(caption, row);
		if (basic) {
			const slider = el("input", void 0, "camera-slider");
			slider.type = "range";
			slider.min = String(name === "zoom" ? 0 : name === "azimuth" ? -180 : limits.minElevation);
			slider.max = String(name === "zoom" ? 1e3 : name === "azimuth" ? 180 : 90);
			slider.step = name === "zoom" ? "1" : ".1";
			slider.setAttribute("aria-label", t("{0}滑块", [label]));
			slider.addEventListener("pointerdown", () => dragging.add(name));
			const finish = () => {
				dragging.delete(name);
				scheduleRefresh();
			};
			for (const event of [
				"pointerup",
				"pointercancel",
				"lostpointercapture",
				"change",
				"blur"
			]) slider.addEventListener(event, finish);
			slider.addEventListener("input", () => attempt(() => applyInput(name, sliderNumber(name, slider.value))));
			const endpoints = el("div", void 0, "camera-slider-endpoints");
			endpoints.append(el("span", name === "zoom" ? `${limits.minZoom}×` : `${slider.min}°`), el("span", name === "zoom" ? `${limits.maxZoom}×` : `${slider.max}°`));
			group.append(slider, endpoints);
			sliders.set(name, slider);
			controls.push(slider);
		}
		(basic ? grid : advancedGrid).append(group);
		inputs.set(name, input);
		controls.push(minus, input, plus);
	}
	const help = el("p", space === "raw-world" ? t("平移按屏幕水平/垂直方向，单位与原坐标一致。目标点保留原始坐标精度。") : t("目标点使用网格排列坐标；书签适用于相同模型顺序和比例模式。"), "camera-controls-help");
	advanced.append(help);
	body.append(el("p", t("拖动滑块可连续调整；数字输入与鼠标操作实时同步。缩放滑块采用对数刻度。"), "camera-controls-help"), status);
	if (!separateBookmarks) body.append(bookPanel);
	const bookHeading = el("div", void 0, "camera-bookmark-heading"), bookCount = el("span", "", "camera-bookmark-count");
	bookCount.setAttribute("aria-label", t("已保存书签数量"));
	bookHeading.append(el("strong", t("本机视角书签")), bookCount);
	const storageHelp = el("p", t("保存在此浏览器，下次打开仍可使用。可导出 JSON 备份或转移到其他浏览器。"), "camera-bookmark-storage");
	const bookmarkName = el("input"), bookmarkSelect = el("select");
	bookmarkName.type = "text";
	bookmarkName.maxLength = 80;
	bookmarkName.placeholder = t("输入视角名称");
	bookmarkName.setAttribute("aria-label", t("视角书签名称"));
	bookmarkSelect.size = 5;
	bookmarkSelect.setAttribute("aria-label", t("已保存视角"));
	const bookmarkMeta = el("p", "", "camera-bookmark-meta");
	bookmarkMeta.setAttribute("aria-label", t("选中书签信息"));
	bookPanel.append(bookHeading, storageHelp, bookmarkSelect, bookmarkMeta, bookmarkName);
	const actions = el("div", void 0, "camera-bookmark-actions");
	const action = (text) => {
		const button = el("button", text);
		button.type = "button";
		actions.append(button);
		return button;
	};
	const saveButton = action(t("保存新书签")), loadButton = action(t("加载所选")), updateButton = action(t("更新视角")), renameButton = action(t("重命名")), deleteButton = action(t("删除所选"));
	const files = el("div", void 0, "camera-bookmark-files");
	const exportButton = el("button", t("导出 JSON")), importButton = el("button", t("导入 JSON"));
	exportButton.type = importButton.type = "button";
	files.append(exportButton, importButton);
	const importInput = el("input");
	importInput.type = "file";
	importInput.accept = ".json,application/json";
	importInput.hidden = true;
	bookPanel.append(actions, files, importInput);
	if (separateBookmarks) bookPanel.append(bookStatus);
	function storageUnavailable() {
		storageHelp.textContent = t("当前浏览器无法持久保存；本次书签仍可使用，请导出 JSON 备份。");
		message(storageHelp.textContent, true);
	}
	function syncStored({ notifyDeleted = true } = {}) {
		try {
			const stored = win.localStorage.getItem(key);
			const latest = stored ? parseCameraBookmarks(stored, space) : {
				bookmarks: [],
				preserveView: true
			};
			const merged = new Map(latest.bookmarks.map((bookmark) => [bookmark.id, bookmark]));
			for (const [id, bookmark] of pendingBookmarks) if (bookmark) merged.set(id, bookmark);
			else merged.delete(id);
			bookmarks = [...merged.values()];
			preserveView = pendingPreserve ?? latest.preserveView;
			preserveInput.checked = preserveView;
			const deleted = selectedBookmark && !merged.has(selectedBookmark);
			updateBookmarks();
			if (deleted && notifyDeleted) message(t("所选书签已在另一页面删除，请重新选择；当前视角未改变。"), true);
			return true;
		} catch {
			storageUnavailable();
			return false;
		}
	}
	function persist() {
		if (!syncStored()) return false;
		try {
			win.localStorage.setItem(key, serializeCameraBookmarks(bookmarks, space, preserveView));
			pendingBookmarks.clear();
			pendingPreserve = null;
			storageHelp.textContent = t("保存在此浏览器，下次打开仍可使用。可导出 JSON 备份或转移到其他浏览器。");
			return true;
		} catch {
			storageUnavailable();
			return false;
		}
	}
	function updateBookmarks() {
		bookmarkSelect.replaceChildren();
		if (!bookmarks.length) {
			const empty = el("option", t("暂无书签"));
			empty.value = "";
			bookmarkSelect.append(empty);
		}
		for (const bookmark of bookmarks) {
			const option = el("option", bookmark.name);
			option.value = bookmark.id;
			bookmarkSelect.append(option);
		}
		const selected = bookmarks.find((bookmark) => bookmark.id === selectedBookmark);
		if (!selected) selectedBookmark = "";
		bookmarkSelect.value = selectedBookmark;
		bookCount.textContent = `${bookmarks.length} / ${CAMERA_MAX_BOOKMARKS}`;
		bookmarkMeta.textContent = selected ? t("{0}\n更新：{1}", [selected.name, selected.updatedAt ? new Date(selected.updatedAt).toLocaleString("zh-CN", { hour12: false }) : t("未记录（旧版书签）")]) : t("选择书签后可加载、更新、重命名或删除。");
		loadButton.disabled = updateButton.disabled = !available() || !selectedBookmark;
		renameButton.disabled = deleteButton.disabled = !selectedBookmark;
		exportButton.disabled = !bookmarks.length;
	}
	function scheduleRefresh() {
		if (disposed || frame !== null) return;
		frame = win.requestAnimationFrame(() => {
			frame = null;
			refresh();
		});
	}
	function watchViewers() {
		for (const viewer of getViewers() || []) {
			if (watches.has(viewer) || typeof viewer.render !== "function") continue;
			const original = viewer.render;
			const wrapped = function(...args) {
				const result = original.apply(this, args);
				scheduleRefresh();
				return result;
			};
			watches.set(viewer, {
				original,
				wrapped
			});
			viewer.render = wrapped;
		}
	}
	function refresh() {
		if (disposed) return;
		watchViewers();
		const snapshot = attempt(capture), enabled = Boolean(snapshot);
		controls.forEach((control) => {
			control.disabled = !enabled;
		});
		saveButton.disabled = !enabled;
		if (snapshot) {
			for (const [name, input] of inputs) if (doc.activeElement !== input) input.value = displayNumber(inputValue(snapshot, name), name);
			for (const [name, slider] of sliders) {
				if (!dragging.has(name)) slider.value = String(sliderPosition(name, inputValue(snapshot, name), slider));
				slider.setAttribute("aria-valuetext", `${displayNumber(inputValue(snapshot, name), name)}${name === "zoom" ? t(" 倍") : t(" 度")}`);
			}
			heightLabel.textContent = t("可视高度 {0}（原坐标单位）", [((snapshot.projection === "perspective" ? snapshot.camera.lens ? snapshot.camera.distance / snapshot.camera.lens.fy : 2 * snapshot.camera.distance * Math.tan(snapshot.camera.fov * Math.PI / 360) : snapshot.camera.baseHeight) / snapshot.camera.zoom).toPrecision(6)]);
		} else {
			dragging.clear();
			for (const input of inputs.values()) if (doc.activeElement !== input) input.value = "";
			heightLabel.textContent = t("加载数据后可调整");
		}
		loadButton.disabled = updateButton.disabled = !enabled || !selectedBookmark;
	}
	const finishDragging = () => {
		if (dragging.size) {
			dragging.clear();
			scheduleRefresh();
		}
	};
	win.addEventListener?.("pointerup", finishDragging);
	win.addEventListener?.("pointercancel", finishDragging);
	function freshId() {
		let id;
		do
			id = win.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}-${++idCounter}`;
		while (bookmarks.some((bookmark) => bookmark.id === id));
		return id;
	}
	function validName() {
		const name = bookmarkName.value.trim();
		if (!name || name.length > 80) throw Error(t("请填写 1–80 个字符的书签名称"));
		return name;
	}
	function uniqueName(name) {
		let result = name, number = 2;
		while (bookmarks.some((bookmark) => bookmark.name === result)) {
			const suffix = ` (${number++})`;
			result = name.slice(0, 80 - suffix.length) + suffix;
		}
		return result;
	}
	preserveInput.addEventListener("change", () => {
		const requested = preserveInput.checked;
		syncStored();
		pendingPreserve = requested;
		preserveView = requested;
		preserveInput.checked = requested;
		persist();
	});
	bookmarkSelect.addEventListener("change", () => {
		selectedBookmark = bookmarkSelect.value;
		const selected = bookmarks.find((bookmark) => bookmark.id === selectedBookmark);
		if (selected) bookmarkName.value = selected.name;
		updateBookmarks();
	});
	saveButton.addEventListener("click", () => attempt(() => {
		syncStored();
		const snapshot = capture();
		if (!snapshot) throw Error(t("请先加载数据，再保存视角"));
		if (bookmarks.length >= CAMERA_MAX_BOOKMARKS) throw Error(t("最多保存 100 个书签，请先删除不需要的视角"));
		const name = uniqueName(validName()), record = {
			id: freshId(),
			name,
			snapshot,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		bookmarks.push(record);
		pendingBookmarks.set(record.id, record);
		selectedBookmark = record.id;
		bookmarkName.value = name;
		updateBookmarks();
		if (persist()) message(t("已保存新书签“{0}”，下次打开仍可使用。", [name]));
	}));
	loadButton.addEventListener("click", () => attempt(() => {
		syncStored();
		const bookmark = bookmarks.find((record) => record.id === selectedBookmark);
		if (bookmark) restore(bookmark.snapshot);
	}));
	updateButton.addEventListener("click", () => attempt(() => {
		syncStored();
		const bookmark = bookmarks.find((record) => record.id === selectedBookmark);
		if (!bookmark) return;
		const snapshot = capture();
		if (!snapshot) throw Error(t("请先加载数据，再更新视角"));
		bookmark.snapshot = snapshot;
		bookmark.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		pendingBookmarks.set(bookmark.id, bookmark);
		updateBookmarks();
		if (persist()) message(t("已更新“{0}”的视角。", [bookmark.name]));
	}));
	renameButton.addEventListener("click", () => attempt(() => {
		syncStored();
		const bookmark = bookmarks.find((record) => record.id === selectedBookmark);
		if (!bookmark) return;
		const name = validName();
		if (bookmarks.some((record) => record.id !== bookmark.id && record.name === name)) throw Error(t("已有同名书签，请使用其他名称"));
		bookmark.name = name;
		bookmark.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		pendingBookmarks.set(bookmark.id, bookmark);
		updateBookmarks();
		if (persist()) message(t("已重命名为“{0}”。", [name]));
	}));
	deleteButton.addEventListener("click", () => {
		syncStored();
		if (!selectedBookmark) return;
		pendingBookmarks.set(selectedBookmark, null);
		bookmarks = bookmarks.filter((bookmark) => bookmark.id !== selectedBookmark);
		selectedBookmark = "";
		bookmarkName.value = "";
		updateBookmarks();
		if (persist()) message(t("书签已删除。"));
	});
	exportButton.addEventListener("click", async () => {
		try {
			syncStored();
			await saveLocalBlob(new Blob([serializeCameraBookmarks(bookmarks, space, preserveView)], { type: "application/json" }), `BuildingWebViewer-camera-${space}.json`, {
				document: doc,
				window: win
			});
			message(t("相机书签 JSON 已导出，不含模型数据。"));
		} catch (error) {
			message(error.message, true);
		}
	});
	importButton.addEventListener("click", () => importInput.click());
	importInput.addEventListener("change", async () => {
		const file = importInput.files?.[0];
		importInput.value = "";
		if (!file) return;
		try {
			if (file.size > 1048576) throw Error(t("相机 JSON 超过 1 MB，请检查是否选择了正确文件"));
			const incoming = parseCameraBookmarks(await file.text(), space);
			if (disposed) return;
			syncStored();
			if (bookmarks.length + incoming.bookmarks.length > CAMERA_MAX_BOOKMARKS) throw Error(t("导入后超过 100 个书签，请先删除不需要的视角"));
			for (const bookmark of incoming.bookmarks) {
				const record = {
					...bookmark,
					name: uniqueName(bookmark.name),
					id: freshId(),
					updatedAt: bookmark.updatedAt || (/* @__PURE__ */ new Date()).toISOString()
				};
				bookmarks.push(record);
				pendingBookmarks.set(record.id, record);
			}
			selectedBookmark = incoming.bookmarks.length ? bookmarks.at(-1).id : selectedBookmark;
			if (selectedBookmark) bookmarkName.value = bookmarks.find((bookmark) => bookmark.id === selectedBookmark).name;
			updateBookmarks();
			if (persist()) message(t("已导入 {0} 个书签；选择后点击“加载所选”应用。", [incoming.bookmarks.length]));
		} catch (error) {
			message(error.message || String(error), true);
		}
	});
	const onStorage = (event) => {
		if (!disposed && (event.key === key || event.key === null)) syncStored();
	};
	win.addEventListener?.("storage", onStorage);
	syncStored({ notifyDeleted: false });
	preserveInput.checked = preserveView;
	updateBookmarks();
	refresh();
	return {
		get preserveView() {
			return preserveView;
		},
		capture,
		restore,
		refresh,
		destroy() {
			disposed = true;
			if (frame !== null) win.cancelAnimationFrame(frame);
			for (const [viewer, { original, wrapped }] of watches) if (viewer.render === wrapped) viewer.render = original;
			win.removeEventListener?.("storage", onStorage);
			win.removeEventListener?.("pointerup", finishDragging);
			win.removeEventListener?.("pointercancel", finishDragging);
			panel.remove();
			if (separateBookmarks) bookPanel.remove();
			watches.clear();
			dragging.clear();
		}
	};
}
//#endregion
export { gsUnit3 as A, cameraNavigationScale as C, gsDot3 as D, gsCross3 as E, paletteUniforms as F, rememberPalettePreferences as I, samplePalette as L, PALETTE_GLSL as M, currentPalettePreferences as N, gsProjectPosition as O, normalizePaletteOptions as P, validatePaletteOptions as R, CameraNavigation as S, mountFlyCameraControls as T, displaySampleIndices as _, serializeCameraBookmarks as a, mountCameraNavigationControls as b, gsOrbitRotate as c, mountViewerLayout as d, setViewerProjection as f, currentPresentation as g, updateSceneGuides as h, parseCameraBookmarks as i, gsViewSpec as j, gsTrainingPose as k, gsReanchorOrbit as l, drawSceneGuides as m, captureCameraSnapshot as n, validateCameraSnapshot as o, validateImageSize as p, mountCameraControls as r, mountTouchCamera as s, applyCameraSnapshot as t, gsSetOrbitBasis as u, rgbHex as v, cameraNavigationSettings as w, CAMERA_NAV_STORAGE as x, saveLocalBlob as y };
