//#region \0vite/modulepreload-polyfill.js
(function polyfill() {
	const relList = document.createElement("link").relList;
	if (relList && relList.supports && relList.supports("modulepreload")) return;
	for (const link of document.querySelectorAll("link[rel=\"modulepreload\"]")) processPreload(link);
	new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (mutation.type !== "childList") continue;
			for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
		}
	}).observe(document, {
		childList: true,
		subtree: true
	});
	function getFetchOpts(link) {
		const fetchOpts = {};
		if (link.integrity) fetchOpts.integrity = link.integrity;
		if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
		if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
		else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
		else fetchOpts.credentials = "same-origin";
		return fetchOpts;
	}
	function processPreload(link) {
		if (link.ep) return;
		link.ep = true;
		const fetchOpts = getFetchOpts(link);
		fetch(link.href, fetchOpts);
	}
})();
//#endregion
//#region src/shared/app-navigation.js
/** Explicit application entry links share only an explicit locale, never a project or file. */
function appLinkURL(href, baseURI, search = "") {
	const target = new URL(href, baseURI);
	if (![
		"https:",
		"http:",
		"file:"
	].includes(target.protocol)) throw new Error("Unsupported app link protocol");
	const locale = new URLSearchParams(search).get("lang");
	target.search = "";
	target.hash = "";
	if (locale === "en" || locale === "zh") target.searchParams.set("lang", locale);
	return target.href;
}
function initializeAppLinks(doc = document, location = globalThis.location) {
	const locale = new URLSearchParams(location?.search || "").get("lang");
	const language = locale === "en" || locale === "zh" ? locale : doc.documentElement?.lang === "en" ? "en" : "zh";
	for (const link of doc.querySelectorAll("a[data-app-link], a[data-app-route]")) {
		link.href = appLinkURL(link.getAttribute("href"), doc.baseURI, "?lang=" + language);
		if (link.target === "_blank") link.rel = "noopener noreferrer";
	}
}
//#endregion
//#region src/shared/vite-startup.js
/** Gate module startup before importing app chunks. No dev-server requirement in production. */
async function startViewer(load) {
	if (/^https?:$/.test(location.protocol) && !window.Capacitor?.isNativePlatform?.()) {
		const current = document.querySelector("meta[name=\"application-build\"]")?.content;
		if (current) {
			const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 2500);
			try {
				const response = await fetch(new URL("version.json", location.href), {
					cache: "no-store",
					credentials: "omit",
					signal: controller.signal
				});
				if (response.ok) {
					const next = await response.json();
					if (/^[a-f0-9]{16}$/.test(next.build) && next.build !== current) {
						const url = new URL(location.href);
						if (url.searchParams.get("_bwvRefresh") !== next.build) {
							url.searchParams.set("_bwvRefresh", next.build);
							url.searchParams.set("build", next.build);
							location.replace(url.href);
						}
						window.BuildingViewerBoot?.fail();
						return;
					}
				}
			} catch {} finally {
				clearTimeout(timeout);
			}
		}
	}
	try {
		await load();
	} catch (error) {
		window.BuildingViewerBoot?.fail();
		console.error(error);
		throw error;
	}
}
//#endregion
//#region \0vite/preload-helper.js
var scriptRel = "modulepreload";
var assetsURL = function(dep, importerUrl) {
	return new URL(dep, importerUrl).href;
};
var seen = {};
var isCssPreloadUrl = function isCssPreloadUrl(url) {
	return url.pathname.endsWith(".css");
};
var preloadOnce = function preloadOnce(seen, href, preload) {
	if (href in seen) return seen[href];
	const promise = preload();
	if (!promise) {
		seen[href] = void 0;
		return;
	}
	const preloadPromise = promise.then(() => {
		seen[href] = void 0;
	}, (err) => {
		seen[href] = void 0;
		throw err;
	});
	seen[href] = preloadPromise;
	return preloadPromise;
};
var __vitePreload = function preload(baseModule, deps, importerUrl) {
	let promise = Promise.resolve();
	if (deps && deps.length > 0) {
		let preloadedHrefs;
		const cspNonceMeta = document.querySelector("meta[property=csp-nonce]");
		const cspNonce = cspNonceMeta?.nonce || cspNonceMeta?.getAttribute("nonce");
		function allSettled(promises) {
			return Promise.all(promises.map((p) => Promise.resolve(p).then((value) => ({
				status: "fulfilled",
				value
			}), (reason) => ({
				status: "rejected",
				reason
			}))));
		}
		function importMetaResolve(specifier) {
			if (import.meta.resolve) return new URL(import.meta.resolve(specifier));
			return new URL(
				specifier,
				/** #__KEEP__ */
				import.meta.url
			);
		}
		promise = allSettled(deps.map((depString) => {
			depString = assetsURL(depString, importerUrl);
			const dep = importMetaResolve(depString);
			const isCss = isCssPreloadUrl(dep);
			return preloadOnce(seen, dep.href, () => {
				if (preloadedHrefs === void 0) {
					preloadedHrefs = {
						all: /* @__PURE__ */ new Set(),
						styles: /* @__PURE__ */ new Set()
					};
					const links = document.getElementsByTagName("link");
					for (let i = links.length - 1; i >= 0; i--) {
						const link = links[i];
						preloadedHrefs.all.add(link.href);
						if (link.rel === "stylesheet") preloadedHrefs.styles.add(link.href);
					}
				}
				if ((isCss ? preloadedHrefs.styles : preloadedHrefs.all).has(dep.href)) return;
				const link = document.createElement("link");
				link.rel = isCss ? "stylesheet" : scriptRel;
				if (!isCss) link.as = "script";
				link.crossOrigin = "";
				link.href = dep.href;
				if (cspNonce) link.setAttribute("nonce", cspNonce);
				document.head.appendChild(link);
				if (isCss) return new Promise((res, rej) => {
					link.addEventListener("load", res);
					link.addEventListener("error", () => rej(/* @__PURE__ */ new Error(`Unable to preload CSS for ${dep}`)));
				});
			});
		}).filter((p) => p !== void 0));
	}
	function handlePreloadError(err) {
		const e = new Event("vite:preloadError", { cancelable: true });
		e.payload = err;
		window.dispatchEvent(e);
		if (!e.defaultPrevented) throw err;
	}
	return promise.then((res) => {
		for (const item of res || []) {
			if (item.status !== "rejected") continue;
			handlePreloadError(item.reason);
		}
		return baseModule().catch(handlePreloadError);
	});
};
//#endregion
export { startViewer as n, initializeAppLinks as r, __vitePreload as t };
