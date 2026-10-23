import { a as t, n as initializeLocale } from "./i18n-CQYkw1yO.js";
import { i as mobileProjects } from "./mobile-project-DIn9Vanq.js";
import { n as showRenderDiagnostics } from "./render-diagnostics-BSzIU3Qv.js";
//#region src/mobile/update-check.js
/** This candidate has no distribution authority. Never call legacy health/install methods. */
async function runMobileUpdate() {
	return "disabled";
}
Object.freeze({
	enabled: false,
	reason: "SIGNED_DISTRIBUTION_NOT_CONFIGURED"
});
//#endregion
//#region src/mobile/mobile-updates.js
/** Read-only local version UI. No download, installation, health or activation authority. */
function initializeMobileUpdates(api, doc = document) {
	const en = doc.documentElement.lang === "en";
	const panel = doc.getElementById("mobile-updates"), status = doc.getElementById("update-status");
	const disabled = () => {
		status.textContent = en ? "Automatic updates are disabled until signed distribution is configured. Offline projects remain available." : "签名分发尚未配置，自动更新暂未开放。本地项目仍可离线使用。";
	};
	doc.getElementById("show-updates").onclick = () => {
		panel.hidden = !panel.hidden;
		disabled();
	};
	doc.getElementById("check-update").onclick = async () => {
		await runMobileUpdate();
		disabled();
	};
	doc.getElementById("show-release-notes").onclick = async () => {
		try {
			const result = await api.showReleaseNotes();
			status.textContent = String(result.notes?.[en ? "en" : "zh"] || "");
		} catch {
			status.textContent = en ? "Local release notes unavailable." : "本地版本说明暂不可用。";
		}
	};
	disabled();
}
//#endregion
//#region src/mobile/home.js
initializeLocale();
var cadDownload = document.getElementById("cad-app-download");
if (cadDownload) cadDownload.onclick = async () => {
	const api = mobileProjects();
	if (!api?.openCadAppDownload) {
		mobileHomeSay("CAD App 下载地址尚未确认。");
		return;
	}
	try {
		if (!(await api.openCadAppDownload())?.available) mobileHomeSay("CAD App 下载地址尚未确认。");
	} catch (error) {
		mobileHomeSay(error.message);
	}
};
document.getElementById("mobile-language").href = "?lang=" + (document.documentElement.lang === "en" ? "zh" : "en");
var mobileHomeAPI = mobileProjects();
var mobileHomeList = document.getElementById("projects");
var mobileHomeStatus = document.getElementById("status");
var mobileShowTrash = false;
function mobileHomeSay(text) {
	mobileHomeStatus.textContent = text;
}
function mobileHomeButton(text, action) {
	const b = document.createElement("button");
	b.textContent = t(text);
	b.onclick = () => Promise.resolve().then(action).catch((error) => mobileHomeSay(error.message));
	return b;
}
async function mobileHomeOpen(project, tool) {
	if (tool === "gaussian") {
		if ((await mobileHomeAPI.runtimeInfo()).nativeGaussianWorkspace) {
			await mobileHomeAPI.openNativeGaussian({
				id: project.id,
				keys: [],
				lang: document.documentElement.lang === "en" ? "en" : "zh"
			});
			await refreshMobileProjects();
			return;
		}
	}
	location.href = `../../${tool}.html?project=${encodeURIComponent(project.id)}&lang=${document.documentElement.lang === "en" ? "en" : "zh"}`;
}
async function refreshMobileProjects() {
	if (!mobileHomeAPI) {
		mobileHomeSay(t("此页面需要 Android App。网页版请使用工具首页。"));
		return;
	}
	const { projects } = await mobileHomeAPI.listProjects();
	mobileHomeList.replaceChildren();
	for (const p of projects.filter((p) => Boolean(p.trashed) === mobileShowTrash)) {
		const card = document.createElement("article"), heading = document.createElement("h2"), info = document.createElement("p"), tools = document.createElement("div"), actions = document.createElement("div");
		tools.className = "mobile-tools";
		actions.className = "mobile-actions";
		heading.textContent = p.name;
		info.textContent = t("{0} 个文件 · {1} MB", [p.files.length, (p.files.reduce((n, f) => n + f.size, 0) / 1048576).toFixed(1)]) + " · " + new Date(p.updatedAt).toLocaleString();
		card.append(heading, info);
		if (p.status !== "ready") {
			const note = document.createElement("p");
			note.className = "mobile-warning";
			note.textContent = p.error || t("导入未完成，可重试或清理");
			card.append(note);
			if (p.importJob) actions.append(mobileHomeButton("重试导入", async () => {
				await mobileHomeAPI.retryImport({ id: p.id });
				await refreshMobileProjects();
			}), mobileHomeButton("清理未完成导入", async () => {
				await mobileHomeAPI.discardImport({ id: p.id });
				await refreshMobileProjects();
			}));
		}
		if (mobileShowTrash) actions.append(mobileHomeButton("恢复项目", async () => {
			await mobileHomeAPI.trashProject({
				id: p.id,
				trashed: false
			});
			await refreshMobileProjects();
		}));
		else {
			for (const [tool, title] of [
				["lod", "网格模型"],
				["wireframe", "线框"],
				["pointcloud", "点云"],
				["gaussian", "高斯泼溅"],
				["generate", "点云创作与修订"]
			]) tools.append(mobileHomeButton(title, () => mobileHomeOpen(p, tool)));
			actions.append(mobileHomeButton("导出项目备份", async () => {
				mobileHomeSay(t("正在导出备份…"));
				await mobileHomeAPI.backupProject({ id: p.id });
				mobileHomeSay(t("已发起分享"));
			}), mobileHomeButton("添加文件", async () => {
				mobileHomeSay(t("正在导入…"));
				await mobileHomeAPI.pickFiles({ id: p.id });
				await refreshMobileProjects();
				mobileHomeSay(t("已保存"));
			}), mobileHomeButton("重命名", async () => {
				const name = prompt(t("项目名称"), p.name);
				if (name) {
					await mobileHomeAPI.renameProject({
						id: p.id,
						name
					});
					await refreshMobileProjects();
				}
			}), mobileHomeButton("移入回收站", async () => {
				await mobileHomeAPI.trashProject({
					id: p.id,
					trashed: true
				});
				await refreshMobileProjects();
			}));
		}
		const more = document.createElement("details"), summary = document.createElement("summary");
		summary.textContent = t("项目管理");
		more.className = "project-management";
		more.append(summary, actions);
		card.append(tools, more);
		mobileHomeList.append(card);
	}
	if (!mobileHomeList.children.length) {
		const empty = document.createElement("p");
		empty.textContent = t("从分享接收文件，或新建一个项目。");
		mobileHomeList.append(empty);
	}
}
document.getElementById("new-project").onclick = async () => {
	try {
		const name = prompt(t("项目名称"), (/* @__PURE__ */ new Date()).toLocaleDateString());
		if (name === null) return;
		await mobileHomeAPI.createProject({ name });
		await refreshMobileProjects();
	} catch (error) {
		mobileHomeSay(error.message);
	}
};
document.getElementById("import-project").onclick = async () => {
	try {
		mobileHomeSay(t("正在导入…"));
		const result = await mobileHomeAPI.pickFiles({});
		await refreshMobileProjects();
		mobileHomeSay(result.cancelled ? "" : t("导入完成，请选择查看工具"));
	} catch (error) {
		mobileHomeSay(error.message);
		await refreshMobileProjects();
	}
};
document.getElementById("trash").onclick = async () => {
	mobileShowTrash = !mobileShowTrash;
	document.getElementById("trash").textContent = t(mobileShowTrash ? "返回项目" : "回收站");
	await refreshMobileProjects();
};
refreshMobileProjects().catch((error) => mobileHomeSay(error.message));
if (mobileHomeAPI) mobileHomeAPI.addListener("projectsChanged", async (info) => {
	mobileHomeSay(info.error || t("收到新项目，请选择查看工具"));
	await refreshMobileProjects();
}).catch((error) => mobileHomeSay(error.message));
document.getElementById("clean-storage").disabled = true;
document.getElementById("empty-trash").disabled = true;
document.getElementById("show-diagnostics").textContent = document.documentElement.lang === "en" ? "Rendering diagnostics" : "渲染诊断";
document.getElementById("show-diagnostics").onclick = () => showRenderDiagnostics();
if (mobileHomeAPI) {
	mobileHomeAPI.runtimeInfo().then((info) => {
		document.getElementById("version-info").textContent = (document.documentElement.lang === "en" ? "Local web v" : "本地网页 v") + info.current + " · APK " + (info.apkVersion || "—") + " · Android " + info.android + " · WebView " + info.webview;
	}).catch(() => {});
	initializeMobileUpdates(mobileHomeAPI);
}
document.getElementById("native-recovery").onclick = async () => {
	try {
		if (!mobileHomeAPI) throw new Error("需要 Android App");
		await mobileHomeAPI.openRecovery();
	} catch (error) {
		mobileHomeSay(error.message);
	}
};
//#endregion
