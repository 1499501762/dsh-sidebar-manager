/**
 * dsh-sidebar-manager — client half (v2).
 *
 * Three jobs:
 *
 *  1. LAYOUT GUARD. The left sidebar is a fixed-height flex column whose middle
 *     section (`regionArea` → workspaces/session tree) is `flex:1` with
 *     `min-height:0`; once the rows above and below exceed the window it
 *     collapses to 0px and the session tree disappears. The guard keeps a
 *     usable minimum, lets the panel list shrink and scroll, and neutralises
 *     the frame-wide footer overrides another plugin injects.
 *
 *  2. ADOPTION. Older hand-written plugins skip the slot system: they draw a
 *     plain <button> into the sidebar root and open an absolutely positioned
 *     overlay over the centre column. Those rows are promoted here into REAL
 *     global panels: the row is drawn by this plugin (so the host's own list
 *     cannot drop it) and a keyed `main` panel opens the payload by clicking
 *     the hidden legacy row. Nothing about which plugins they are is hard-coded.
 *
 *  3. SIDEBAR MANAGER. The shell's panel list is re-rendered by this plugin so
 *     its entries can be reordered, hidden, and folded into user-created groups
 *     (a group row opens a floating submenu to its right). The Settings page is
 *     a menu editor for that list: rows with a ▸, floating context menus, and a
 *     "move into group" submenu.
 *
 * No build step and no imports beyond React: the file IS the bundle, in the
 * `window.__ModuleLoader__.load` format the client-modules service expects.
 */
window.__ModuleLoader__.load({
	id: "dsh-sidebar-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");

		/* ------------------------------------------------------------- constants */

		/** Dictionary namespace owned by this plugin. */
		var NS = "sidebar-manager";
		/** localStorage key holding the arrangement (v2 model). */
		var STORAGE_KEY = "dsh-sidebar-manager:v2";
		/** The v1 key, read once to migrate a previous arrangement. */
		var LEGACY_KEY = "dsh-sidebar-manager:v1";
		/** The sidebar column the shell renders (one per window). */
		var ROOT_SEL = "[data-dsh-sidebar-root]";
		/** Style tag id. */
		var STYLE_ID = "dsh-sidebar-manager-style";
		/** Attribute that hides a managed entry. */
		var HIDDEN_ATTR = "data-dsm-hidden";
		/** Attribute marking a legacy row promoted into the global panel list. */
		var ADOPTED_ATTR = "data-dsm-adopted";
		/** Attribute on the container this plugin renders the panel list into. */
		var NAV_HOST_ATTR = "data-dsm-nav";
		/** Attribute on the shell's own (now hidden) panel list. */
		var NATIVE_NAV_ATTR = "data-dsm-native-nav";
		/** Fallback minimum height for the workspace/session tree: half the window. */
		var MIN_REGION = "50vh";
		/** Order bands for the sidebar column's direct children. */
		var BAND = { logo: 0, newSession: 1, quickBase: 10, switcher: 40, panelList: 50, region: 60, footer: 70 };

		/** Client root context, kept for slots and panel switching. */
		var slotCtx = null;
		/** Adopted legacy rows: key -> {id, label, el}. */
		var adopted = {};
		/** Adopted legacy rows by panel id: id -> key. */
		var adoptedIds = {};
		var adoptedRegistrations = {};
		var adoptionRetryAt = 0;

		/* -------------------------------------------------------------- locales */

		var zh = {
			nav: "侧边栏/顶栏管理",
			title: "侧边栏/顶栏管理",
			hint: "管理左侧边栏的条目顺序、分组和显示状态。点行右侧的 ⋯ 打开操作菜单；带 ▸ 的行可以向右展开二级菜单。",
			listTitle: "侧边栏条目",
			newGroup: "新建分组",
			groupDefault: "新分组",
			badgePanel: "全局面板",
			badgeQuick: "快捷入口",
			badgeGroup: "分组",
			badgeHidden: "已隐藏",
			more: "更多操作",
			moveUp: "上移",
			moveDown: "下移",
			moveInto: "移入分组",
			moveOut: "移出分组",
			hide: "隐藏",
			show: "显示",
			rename: "重命名",
			removeGroup: "删除分组（条目回到列表）",
			openGroup: "展开分组",
			emptyGroup: "空分组 —— 用「移入分组」把条目放进来",
			empty: "侧边栏还没有可管理的条目。",
			noGroups: "还没有分组",
			renameHint: "分组名，回车确认",
			other: "其他",
			reset: "恢复默认",
			settingsRow: "设置入口",
			toolbarTitle: "顶部工具栏",
			badgeToolbar: "顶部工具栏",
			regionMin: "工作区最小高度",
			regionReset: "默认",
			regionHint: "默认留出窗口高度的一半。设为 0 或清空即恢复默认；侧边栏放不下时优先让上面的面板列表滚动。",
			aggressive: "允许跨区搬移（顶栏 ↔ 侧边栏）",
			aggressiveHint: "开启后，条目行的 ⋯ 菜单会多出「移到顶栏 / 移到侧边栏」。搬过去的都是代理入口：侧边栏入口在顶栏变成一个同款按钮，点它打开原面板；顶栏组件在侧边栏变成一行带「顶栏」标记的入口，点它触发该组件的主动作。原控件只是被隐藏，关掉这个开关立刻还原。",
			experimental: "实验性",
			experimentalNote: "实验性功能",
			setIcon: "设置图标",
			uploadIcon: "上传图片…",
			usageCard: "用量卡片",
			pasteSvg: "粘贴 SVG 代码…",
			applySvg: "应用 SVG",
			askAgent: "让 Agent 生成一个",
			fromHeader: "顶栏",
			clearIcon: "恢复默认图标",
			iconHint: "图标（emoji 或短字符），回车确认",
			dragHint: "也可以直接拖动行来排序，拖到分组名上就归进该分组。",
			moveToHeader: "移到顶栏",
			moveToSidebar: "移到侧边栏"
		};
		var en = {
			nav: "Sidebar / Top bar",
			title: "Sidebar / Top bar manager",
			hint: "Order, groups and visibility of the left sidebar entries. Use ⋯ for actions; rows with ▸ open a submenu to the right.",
			listTitle: "Sidebar entries",
			newGroup: "New group",
			groupDefault: "New group",
			badgePanel: "Panel",
			badgeQuick: "Quick",
			badgeGroup: "Group",
			badgeHidden: "Hidden",
			more: "More actions",
			moveUp: "Move up",
			moveDown: "Move down",
			moveInto: "Move into group",
			moveOut: "Move out of group",
			hide: "Hide",
			show: "Show",
			rename: "Rename",
			removeGroup: "Delete group (items return to the list)",
			openGroup: "Open group",
			emptyGroup: "Empty group — use “Move into group” to fill it",
			empty: "No manageable entries in this sidebar.",
			noGroups: "No groups yet",
			renameHint: "Group name, Enter to confirm",
			other: "Other",
			reset: "Reset to defaults",
			settingsRow: "Settings",
			toolbarTitle: "Top toolbar",
			badgeToolbar: "Toolbar",
			regionMin: "Workspace min height",
			regionReset: "Default",
			regionHint: "Defaults to half the window height. 0 or empty restores the default; the panel list scrolls first.",
			aggressive: "Allow cross-surface moves (top bar ↔ sidebar)",
			aggressiveHint: "Adds “Move to top bar / Move to sidebar” to the ⋯ menu. What moves is a proxy: a sidebar entry becomes a native-looking button up top, a top-bar widget becomes a “from top bar” row below. The original control is only hidden, so turning this off restores everything.",
			experimental: "Experimental",
			experimentalNote: "Experimental",
			setIcon: "Set icon",
			uploadIcon: "Upload image…",
			usageCard: "Usage card",
			pasteSvg: "Paste SVG markup…",
			applySvg: "Apply SVG",
			askAgent: "Ask an agent to draw one",
			fromHeader: "Top bar",
			clearIcon: "Reset icon",
			iconHint: "Icon (emoji or short text), Enter to confirm",
			dragHint: "You can also drag rows to reorder, or drop one on a group to file it.",
			moveToHeader: "Move to top bar",
			moveToSidebar: "Move to sidebar"
		};

		/** Copy lookup; replaced by the locale service once it is bound. */
		var t = function (key) {
			var lang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
			var dict = lang.indexOf("zh") === 0 ? zh : en;
			return dict[key] || zh[key] || key;
		};

		/* --------------------------------------------------------------- config */

		/** @returns {object} a fresh arrangement. */
		function defaults() {
			return { v: 2, layout: [], headerLayout: [], hidden: {}, icons: {}, regionMin: 0, aggressive: false };
		}

		/**
		 * Read the saved arrangement, migrating a v1 one when present.
		 * @returns {object} the arrangement.
		 */
		function loadConfig() {
			try {
				var raw = window.localStorage.getItem(STORAGE_KEY);
				if (raw) {
					var parsed = JSON.parse(raw);
					if (parsed && typeof parsed === "object" && Array.isArray(parsed.layout)) {
						var headerLayout = Array.isArray(parsed.headerLayout) ? sanitiseLayout(parsed.headerLayout) : [];
						if (headerLayout.length === 0 && Array.isArray(parsed.toolbarOrder)) {
							/* migrate the flat v0.3 toolbar order into a tree */
							headerLayout = sanitiseLayout(parsed.toolbarOrder.map(function (key) { return { kind: "item", key: key }; }));
						}
						return {
							v: 2,
							layout: sanitiseLayout(parsed.layout),
							headerLayout: headerLayout,
							hidden: parsed.hidden && typeof parsed.hidden === "object" ? parsed.hidden : {},
							icons: sanitiseIcons(parsed.icons),
							regionMin: typeof parsed.regionMin === "number" && parsed.regionMin > 0 ? parsed.regionMin : 0,
							aggressive: parsed.aggressive === true
						};
					}
				}
				var legacy = window.localStorage.getItem(LEGACY_KEY);
				if (legacy) {
					var old = JSON.parse(legacy);
					var next = defaults();
					next.hidden = old && old.hidden && typeof old.hidden === "object" ? old.hidden : {};
					var panels = old && old.order && Array.isArray(old.order.panels) ? old.order.panels : [];
					next.layout = panels.map(function (key) { return { kind: "item", key: key }; });
					return next;
				}
			} catch (error) {
				/* corrupt storage: fall back to defaults */
			}
			return defaults();
		}

		/**
		 * Keep only well-formed icon overrides.
		 * @param {*} icons - raw map.
		 * @returns {Object} key -> icon value.
		 */
		function sanitiseIcons(icons) {
			var out = {};
			if (!icons || typeof icons !== "object") return out;
			for (var key in icons) {
				if (!Object.prototype.hasOwnProperty.call(icons, key)) continue;
				var value = cleanIcon(icons[key]);
				if (value !== "") out[key] = value;
			}
			return out;
		}

		/**
		 * The custom icon of one entry, if any.
		 * @param {string} key - entry key.
		 * @returns {string} the icon value, "" when the shell icon is kept.
		 */
		function entryIcon(key) {
			var map = config.icons || {};
			return typeof map[key] === "string" ? map[key] : "";
		}

		/**
		 * Override (or clear) one entry's icon.
		 * @param {string} key - entry key.
		 * @param {string} icon - the icon value; "" restores the shell icon.
		 */
		function setEntryIcon(key, icon) {
			var value = cleanIcon(icon === undefined || icon === null ? "" : icon);
			updateConfig(function (draft) {
				if (!draft.icons || typeof draft.icons !== "object") draft.icons = {};
				if (value === "") delete draft.icons[key];
				else draft.icons[key] = value;
			});
		}

		/**
		 * Normalise a stored icon value.
		 * @param {*} icon - raw value.
		 * @returns {string} the value to persist.
		 */
		function cleanIcon(icon) {
			if (typeof icon !== "string") return "";
			if (icon.indexOf("data:image/") === 0) return icon.length > 26000 ? "" : icon;
			if (icon.indexOf("svg:") === 0) return icon.slice(4, 64) === libraryPath(icon.slice(4)) || libraryPath(icon.slice(4)) !== "" ? icon.slice(0, 72) : "";
			if (icon.indexOf("svgdata:") === 0) {
				var safe = sanitizeSvg(icon.slice(8));
				return safe === null ? "" : "svgdata:" + safe;
			}
			return icon.trim().slice(0, 6);
		}

		/**
		 * Keep only well-formed layout nodes (and no duplicate keys).
		 * @param {Array} layout - raw layout.
		 * @returns {Array} sanitised layout.
		 */
		function sanitiseLayout(layout) {
			var out = [];
			var seen = {};
			for (var i = 0; i < layout.length; i++) {
				var node = layout[i];
				if (!node || typeof node !== "object") continue;
				if (node.kind === "item" && typeof node.key === "string" && seen[node.key] !== true) {
					seen[node.key] = true;
					out.push({ kind: "item", key: node.key });
				} else if (node.kind === "group" && typeof node.id === "string") {
					var items = Array.isArray(node.items) ? node.items.filter(function (key) {
						return typeof key === "string" && seen[key] !== true;
					}) : [];
					for (var j = 0; j < items.length; j++) seen[items[j]] = true;
					out.push({
						kind: "group",
						id: node.id,
						name: typeof node.name === "string" ? node.name : t("groupDefault"),
						icon: cleanIcon(node.icon),
						items: items
					});
				}
			}
			return out;
		}

		var config = defaults();
		/** Subscribers: the Settings page re-renders on every notify. */
		var listeners = [];
		/** Latest inventory for the Settings page. */
		var inventory = { entries: [], layout: [] };
		/** Signature of the last published inventory. */
		var lastSignature = "";
		/** Layout actually applied per pool (unknown entries appended). */
		var effectiveLayout = [];
		var headerEffectiveLayout = [];

		/** Pools the manager edits. */
		var POOLS = [
			{ id: "sidebar", titleKey: "listTitle", badgeKey: "badgePanel", configKey: "layout" },
			{ id: "header", titleKey: "toolbarTitle", badgeKey: "badgeToolbar", configKey: "headerLayout" }
		];

		/**
		 * The applied layout of one pool.
		 * @param {string} poolId - pool id.
		 * @returns {Array} layout nodes.
		 */
		function layoutOf(poolId) {
			return poolId === "header" ? headerEffectiveLayout : effectiveLayout;
		}

		function persist() {
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
			} catch (error) {
				/* private mode / quota: the arrangement still applies for this page */
			}
		}

		function notify() {
			for (var i = 0; i < listeners.length; i++) {
				try {
					listeners[i]();
				} catch (error) {
					/* a dead subscriber must not stop the others */
				}
			}
		}

		/**
		 * Mutate the arrangement, persist it and re-apply it.
		 * @param {(draft: object) => void} mutator - receives a mutable copy.
		 */
		function updateConfig(mutator) {
			var draft = JSON.parse(JSON.stringify(config));
			mutator(draft);
			config = draft;
			persist();
			applyRegionMin();
			applyAll();
			notify();
		}

		/** @returns {string} a fresh group id. */
		function newGroupId() {
			return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
		}

		/* ----------------------------------------------------------------- css */

		/**
		 * Inject this plugin's stylesheet (replacing the text when it changed).
		 *
		 * The layout guard is scoped to an EXPANDED sidebar column so the 56px
		 * rail keeps its own rules. `!important` is load-bearing: the overrides we
		 * neutralise are same-specificity rules from another plugin.
		 */
		function injectCss() {
			if (typeof document === "undefined") return;
			var open = "[data-dsh-sidebar-root]:not([class*=\"collapsed\"]) ";
			var css = [
				/* ---- layout guard ---- */
				/* 会话树保底高度：设置项优先，否则窗口高度的一半 */
				open + "[class*=\"regionArea\"]{min-height:var(--dsh-sidebar-region-min, 50vh)}",
				open + "[class*=\"panelList\"], " + open + "[" + NAV_HOST_ATTR + "]{flex:0 1 auto!important;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}",
				open + "> button{flex:0 0 auto;min-height:0}",
				open + "> button[data-dsh-no-drag]{height:30px}",
				open + "[class*=\"footArea\"]{flex-flow:column!important;align-items:stretch!important}",
				open + "[class*=\"footArea\"]>[class*=\"footerActions\"]{display:flex!important;flex-direction:row!important;flex-wrap:nowrap;align-items:center;gap:6px;width:auto!important;min-width:0}",
				open + "[class*=\"footArea\"]>[class*=\"settingsArea\"]{flex:none!important;width:100%!important;min-width:0}",
				open + "[class*=\"footArea\"]>[data-dsh-usage-foot-card]{flex:none!important;width:100%!important;min-width:0}",
				open + "[class*=\"footerActions\"]>[data-slot=\"sidebar.footer.action\"]{flex-direction:row!important;flex-wrap:wrap;align-items:center;gap:4px;width:100%;min-width:0}",
				open + "[class*=\"footerActions\"] [class*=\"entryRow\"]{flex:0 0 auto!important;width:auto!important;min-width:0}",
				/* ---- state attributes ---- */
				"[" + HIDDEN_ATTR + "]{display:none!important}",
				"[" + ADOPTED_ATTR + "]{display:none!important}",
				"[" + NATIVE_NAV_ATTR + "]{display:none!important}",
				"[class*=\"collapsed\"] [" + NATIVE_NAV_ATTR + "]{display:flex!important}",
				"[class*=\"collapsed\"] [" + NAV_HOST_ATTR + "]{display:none!important}",
				".dsm-adopted-panel{position:absolute;inset:0;pointer-events:none}",
				".dsm-nav-icon svg{display:block;width:100%;height:100%}",
				/* ---- sidebar: our panel list ---- */
				"[" + NAV_HOST_ATTR + "]{display:flex;flex-direction:column;gap:4px}",
				"[" + NAV_HOST_ATTR + "] > *{flex:0 0 auto}",
				/* cloned rows inherit the shell's wide-fade animation, which leaves the
				   label at opacity 0 on a freshly inserted clone: force it visible */
				"[" + NAV_HOST_ATTR + "] [class*=\"panelTitle\"]{opacity:1!important;animation:none!important;transform:none!important}",
				"[" + NAV_HOST_ATTR + "] [class*=\"panelGlyph\"]{animation:none!important}",
				"[data-dsm-row]{cursor:pointer}",
				".dsm-nav-chevron{flex:none;opacity:.55;font-size:10px;line-height:1;margin-left:2px}",
				".dsm-nav-count{flex:none;opacity:.5;font-size:11px;margin-left:auto;margin-right:2px}",
				/* ---- floating submenu (sidebar) ---- */
				".dsm-flyout{position:fixed;z-index:4000;min-width:180px;max-width:280px;padding:5px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));background:var(--dsw-alias-bg-elevated,#1c1d21);box-shadow:0 12px 32px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:2px}",
				".dsm-flyout-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:7px;border:none;background:transparent;color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:13px;cursor:pointer;text-align:left}",
				".dsm-flyout-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}",
				".dsm-flyout-row .dsm-nav-icon{width:16px;height:16px;flex:none}",
				".dsm-flyout-empty{padding:8px;font-size:12px;opacity:.6}",
				".dsm-flyout-down{z-index:4000;min-width:170px;max-width:300px}",
				".dsm-hbtn{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 8px;border-radius:6px;border:none;background:transparent;color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}",
				".dsm-hbtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}",
				".dsm-hbtn-count{margin-left:4px;opacity:.5;font-size:11px}",
				".dsm-hbtn-chevron{margin-left:2px;font-size:10px;opacity:.7}",
				".dsm-nest{display:flex;align-items:center;min-height:36px;padding:2px 8px;border-radius:8px;overflow:hidden;max-width:100%;box-sizing:border-box}",
				".dsm-proxy-row{display:flex;align-items:center;gap:8px;width:100%;height:36px;padding:0 10px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:13px;cursor:pointer;text-align:left}",
				".dsm-proxy-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.14))}",
				".dsm-proxy-count{flex:none;font-size:10px;opacity:.5;border:1px solid currentColor;border-radius:999px;padding:0 5px;line-height:1.5}",
				".dsm-proxy-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
				".dsm-proxy-hint{flex:none;font-size:10px;opacity:.45;border:1px solid currentColor;border-radius:999px;padding:1px 6px}",
				".dsm-nest:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}",
				".dsm-nest-inner{display:flex;align-items:center;min-width:0;max-width:100%;line-height:1.4;transform:scale(.82);transform-origin:left center}",
				".dsm-nest-widget{max-width:100%}",
				/* ---- settings page (menu editor) ---- */
				".dsm-root{display:flex;flex-direction:column;gap:14px;font-size:13px;color:var(--dsw-alias-label-primary,inherit)}",
				".dsm-title{margin:0;font-size:16px;font-weight:600;line-height:1.3;letter-spacing:.2px}",
				".dsm-hint{margin:0;color:var(--dsw-alias-label-secondary,#8a8f98);font-size:12px;line-height:1.6}",
				".dsm-card{border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));border-radius:12px;background:var(--dsw-alias-bg-elevated,rgba(255,255,255,.02));overflow:hidden}",
				".dsm-card-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.14))}",
				".dsm-card-title{font-size:12px;font-weight:600;letter-spacing:.3px;color:var(--dsw-alias-label-secondary,#8a8f98)}",
				".dsm-add{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.28));background:transparent;color:var(--dsw-alias-label-primary,inherit);border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer}",
				".dsm-add:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}",
				".dsm-list{display:flex;flex-direction:column;padding:6px}",
				".dsm-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;position:relative;cursor:default}",
				".dsm-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}",
				".dsm-item[data-hidden=\"true\"] .dsm-name{opacity:.45;text-decoration:line-through}",
				".dsm-chevron{width:14px;flex:none;color:var(--dsw-alias-label-secondary,#8a8f98);font-size:11px;cursor:pointer;text-align:center;opacity:.8}",
				".dsm-gap{width:14px;flex:none}",
				".dsm-row-icon{width:16px;height:16px;flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary,#8a8f98);opacity:.9}",
				".dsm-row-icon svg{width:100%;height:100%;display:block}",
				".dsm-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
				".dsm-badge{flex:none;font-size:11px;line-height:1;padding:3px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.24));color:var(--dsw-alias-label-secondary,#8a8f98)}",
				".dsm-badge[data-kind=\"group\"]{color:#7aa2ff;border-color:rgba(122,162,255,.35)}",
				".dsm-badge[data-kind=\"hidden\"]{color:#ff9a9a;border-color:rgba(255,154,154,.35)}",
				".dsm-more{width:26px;height:24px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#8a8f98);cursor:pointer;font-size:14px;line-height:1;opacity:.32;transition:opacity .12s}",
				".dsm-item:hover .dsm-more,.dsm-more:focus-visible{opacity:1}",
				".dsm-more:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.2));color:var(--dsw-alias-label-primary,inherit)}",
				".dsm-rename{flex:1;min-width:0;background:transparent;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:6px;padding:2px 6px;color:inherit;font:inherit;font-size:13px;outline:none}",
				".dsm-empty{padding:14px;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary,#8a8f98)}",
				".dsm-footcard{padding:10px 12px;display:flex;flex-direction:column;gap:8px}",
				".dsm-line{display:flex;align-items:center;gap:8px;font-size:12px}",
				".dsm-line input{width:16px;height:16px;accent-color:#4d6bfe;cursor:pointer}",
				".dsm-item[draggable=\"true\"]{cursor:grab}",
				".dsm-item[data-dragging=\"true\"]{opacity:.4}",
				".dsm-item[data-drop=\"before\"]{box-shadow:inset 0 2px 0 0 #4d6bfe}",
				".dsm-item[data-drop=\"after\"]{box-shadow:inset 0 -2px 0 0 #4d6bfe}",
				".dsm-item[data-drop=\"into\"]{background:rgba(77,107,254,.16);outline:1px dashed rgba(77,107,254,.55);outline-offset:-2px}",
				".dsm-icon-img{width:16px;height:16px;object-fit:contain;border-radius:4px;display:block}",
				".dsm-icon-pop{padding:6px;width:236px}",
				".dsm-icon-cell{display:inline-flex;align-items:center;justify-content:center;height:26px;border:none;border-radius:6px;background:transparent;cursor:pointer;color:var(--dsw-alias-label-primary,inherit);padding:0}",
				".dsm-icon-cell svg{width:16px;height:16px}",
				".dsm-icon-custom{display:flex;flex-direction:column;gap:4px;border-top:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.2));padding-top:5px;margin-top:2px}",
				".dsm-icon-area{width:100%;box-sizing:border-box;resize:vertical;min-height:34px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.28));background:transparent;color:inherit;font:inherit;font-size:11px;padding:4px 6px}",
				".dsm-icon-area[data-invalid=\"true\"]{border-color:#e5484d}",
				".dsm-icon-area[data-copied=\"true\"]{border-color:rgba(77,107,254,.8)}",
				".dsm-icon-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:2px;margin-bottom:4px}",
				".dsm-icon-grid .dsm-icon-cell:hover{background:rgba(128,128,128,.22)}",
				".dsm-icon-cell{width:auto!important;height:24px;border:none;border-radius:6px;background:transparent;cursor:pointer;font-size:14px;line-height:1;padding:0}",
				".dsm-icon-cell:hover{background:rgba(128,128,128,.22)}",
				".dsm-icon-cell[data-active=\"true\"]{background:rgba(77,107,254,.28);outline:1px solid rgba(77,107,254,.7)}",
				".dsm-icon-actions{display:flex;gap:4px;border-top:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.2));padding-top:4px}",
				".dsm-icon-actions .dsm-menu-item{flex:1;justify-content:center}",
				".dsm-edit-icon{cursor:pointer;border-radius:6px}",
				".dsm-edit-icon:hover{background:rgba(128,128,128,.2)}",
				".dsm-icon-empty{opacity:.35;font-size:12px;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center}",
				".dsm-group-icon{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;font-size:13px;flex:none;cursor:pointer;line-height:1}",
				".dsm-group-icon:hover{background:rgba(128,128,128,.18)}",
				".dsm-icon-input{width:46px!important;text-align:center;font-size:14px}",
				".dsm-drag-hint{margin:2px 0 6px;opacity:.65}",
				".dsm-chevron{cursor:pointer;user-select:none;transition:transform .12s ease}",
				".dsm-chevron[data-expanded=\"true\"]{transform:rotate(90deg)}",
				".dsm-child{padding-left:30px!important;opacity:.95}",
				".dsm-child-empty{padding:6px 10px 6px 30px;font-size:12px;opacity:.55}",
				".dsm-child-out{margin-left:6px;border:none;background:transparent;color:inherit;opacity:.45;cursor:pointer;font-size:12px;padding:2px 6px;border-radius:6px}",
				".dsm-child-out:hover{opacity:1;background:rgba(128,128,128,.18)}",
				".dsm-tag{flex:none;font-size:10px;line-height:1;letter-spacing:.2px;padding:3px 7px;border-radius:999px;color:#ffc166;border:1px solid rgba(255,193,102,.45);background:rgba(255,193,102,.09)}",
				".dsm-subtitle{display:flex;align-items:center;gap:8px;margin:12px 0 2px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#8a8f98)}",
				".dsm-subtitle:before{content:'';flex:1;height:1px;background:var(--dsw-alias-border-l1,rgba(128,128,128,.18));order:2}",
				".dsm-subtitle > span{order:1}",
				".dsm-subtitle > .dsm-tag{order:3}",
				".dsm-line input.dsm-num{width:92px;height:26px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.28));border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:12px;padding:0 6px}",
				".dsm-reset{align-self:flex-start;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.28));background:transparent;color:var(--dsw-alias-label-primary,inherit);border-radius:8px;padding:4px 12px;font-size:12px;cursor:pointer}",
				".dsm-reset:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}",
				/* ---- floating menu (settings) ---- */
				".dsm-menu{position:fixed;z-index:4000;min-width:190px;padding:5px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));background:var(--dsw-alias-bg-elevated,#1c1d21);box-shadow:0 16px 40px rgba(0,0,0,.42);display:flex;flex-direction:column;gap:1px}",
				".dsm-menu-item{display:flex;align-items:center;gap:8px;padding:6px 9px;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:12.5px;cursor:pointer;text-align:left;white-space:nowrap}",
				".dsm-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.18))}",
				".dsm-menu-item[data-danger=\"true\"]{color:#ff8f8f}",
				".dsm-menu-sep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l1,rgba(128,128,128,.18))}",
				".dsm-menu-sub{margin-left:auto;opacity:.6;font-size:10px}",
				".dsm-menu-label{padding:5px 9px 3px;font-size:11px;color:var(--dsw-alias-label-secondary,#8a8f98)}"
			].join("\n");
			var existing = document.getElementById(STYLE_ID);
			if (existing !== null) {
				if (existing.textContent !== css) existing.textContent = css;
				return;
			}
			var style = document.createElement("style");
			style.id = STYLE_ID;
			style.dataset.plugin = "dsh-sidebar-manager";
			style.textContent = css;
			document.head.appendChild(style);
		}

		/* --------------------------------------------------------------- helpers */

		/**
		 * Visible label of a sidebar row (visible text wins, `aria-label` is the
		 * fallback for icon-only rows such as the footer actions).
		 * @param {Element} el - row element.
		 * @returns {string} a single-line label.
		 */
		function labelOf(el) {
			var text = (el.textContent || "").replace(/\s+/g, " ").trim();
			if (text !== "") return text;
			var aria = el.getAttribute ? el.getAttribute("aria-label") : null;
			return aria === null ? "" : aria.trim();
		}

		/**
		 * The `data-dsh-<x>-entry` marker the legacy plugins stamp on their rows.
		 * @param {Element} el - candidate row.
		 * @returns {{name: string, value: string}|null} the marker, if any.
		 */
		function entryMarker(el) {
			var attrs = el.attributes;
			if (!attrs) return null;
			for (var i = 0; i < attrs.length; i++) {
				var name = attrs[i].name;
				if (/^data-dsh-.+-entry$/.test(name)) return { name: name, value: attrs[i].value || "" };
			}
			return null;
		}

		/**
		 * Is this direct child of the sidebar root an injected legacy row?
		 * @param {Element} el - direct child of the sidebar root.
		 * @param {Element|null} own - the shell's own `newSession` button.
		 * @returns {boolean} true for an injected sidebar row.
		 */
		function isQuickEntry(el, own) {
			if (!el || el.tagName !== "BUTTON") return false;
			if (own !== null && el === own) return false;
			if (el.getAttribute(ADOPTED_ATTR) !== null) return false;
			return true;
		}

		/**
		 * The shell's own "new session" row inside a sidebar column.
		 * @param {Element} root - the sidebar column.
		 * @returns {Element|null} the button, or null on a shell without it.
		 */
		function ownNewSession(root) {
			return root.querySelector('[class*="newSession"]');
		}

		/**
		 * Stable identity for one legacy row.
		 * @param {Element} el - the row.
		 * @returns {string} the key.
		 */
		function quickKey(el) {
			var marker = entryMarker(el);
			if (marker === null) return "qe:text:" + labelOf(el);
			var parts = [marker.name.replace(/^data-dsh-/, "").replace(/-entry$/, ""), marker.value];
			var board = el.getAttribute("data-dsh-board");
			if (board !== null && board !== "") parts.push(board);
			else parts.push(labelOf(el));
			return "qe:" + parts.filter(function (part) { return part !== ""; }).join(":");
		}

		/**
		 * The box a `display:contents` slot wrapper effectively renders as.
		 * @param {Element} el - slot wrapper or real element.
		 * @returns {Element} the element that actually occupies layout space.
		 */
		function effectiveBox(el) {
			if (!el) return null;
			try {
				if (window.getComputedStyle(el).display === "contents") return el.firstElementChild || el;
			} catch (error) {
				/* fall through */
			}
			return el;
		}

		/* ------------------------------------------------------------- adoption */

		/**
		 * Adopt the legacy rows into the shell's GLOBAL PANEL list.
		 * @param {Array} items - discovered legacy rows.
		 */
		function adoptQuickEntries(items) {
			if (slotCtx === null || typeof slotCtx.slots !== "object") return;
			for (var i = 0; i < items.length; i++) {
				var item = items[i];
				var known = adopted[item.key];
				if (known !== undefined) {
					/* the shell re-rendered this row: rebind to the live element and
					   make sure our panel registration is still alive */
					if (known.el !== item.el) {
						known.el = item.el;
						item.el.setAttribute(ADOPTED_ATTR, known.id);
					}
					ensureAdoptedRegistered(known.id, known.label, known.order);
					continue;
				}
				if (item.el === null || item.el.getAttribute(ADOPTED_ATTR) !== null) continue;
				var id = panelIdFor(item.key);
				var order = 100 + i;
				adopted[item.key] = { id: id, label: item.label, el: item.el, order: order };
				adoptedIds[id] = item.key;
				item.el.setAttribute(ADOPTED_ATTR, id);
				registerAdopted(id, item.label, order);
			}
		}

		/**
		 * Keep every known adoption alive: the bridge rows carry ADOPTED_ATTR and
		 * are filtered out of collect(), so they must be repaired from the
		 * registry itself or a dropped registration is never noticed.
		 */
		var adoptionRepairs = 0;
		var adoptionRefreshedAt = 0;

		/**
		 * Keep the adoption bridge healthy.
		 *
		 * The sidebar rows are drawn by this plugin, so a shell list that forgets
		 * an entry can no longer hide it. What still needs watching is the payload
		 * panel registration, which the host may dispose on a sidebar remount: it
		 * is refreshed on a slow timer (and immediately when it is missing).
		 */
		function reconcileAdoptions() {
			if (slotCtx === null) return;
			var now = Date.now();
			var refresh = now - adoptionRefreshedAt >= 30000;
			for (var key in adopted) {
				if (!Object.prototype.hasOwnProperty.call(adopted, key)) continue;
				var record = adopted[key];
				if (record.el === null || record.el.isConnected !== true) {
					var live = resolveAdoptedElement(record.id);
					if (live !== null) record.el = live;
				}
				if (refresh || adoptedRegistrations[record.id] === undefined) {
					adoptionRepairs += 1;
					registerAdopted(record.id, record.label, record.order);
				}
			}
			if (refresh) adoptionRefreshedAt = now;
		}

		/**
		 * Re-register an adopted panel when the host dropped our entries (the
		 * sidebar remounting disposes injected registrations — that is why the
		 * legacy rows used to disappear for good).
		 * @param {string} id - panel id.
		 * @param {string} label - row label.
		 * @param {number} order - fallback order.
		 */
		function ensureAdoptedRegistered(id, label, order) {
			if (slotCtx === null) return;
			var live = null;
			try {
				live = slotEntriesOf("sidebar.panellist");
			} catch (error) {
				live = null;
			}
			if (live !== null) {
				for (var i = 0; i < live.length; i++) {
					if (live[i].id === id) return;
				}
			}
			/* the host may not report our entries at all (or report nothing):
			   re-register with a backoff instead of giving up */
			var now = Date.now();
			if (now < adoptionRetryAt) return;
			adoptionRetryAt = now + 1500;
			registerAdopted(id, label, order);
		}

		/**
		 * Register one adopted row as a global panel (helper: parameters are
		 * per-call bindings, so the lazily-run slot callbacks see THIS row).
		 * @param {string} id - panel id.
		 * @param {string} label - row label.
		 * @param {number} order - fallback position among global panels.
		 */
		function registerAdopted(id, label, order) {
			try {
				var previous = adoptedRegistrations[id];
				if (previous !== undefined) {
					for (var p = 0; p < previous.length; p++) {
						try { if (typeof previous[p] === "function") previous[p](); } catch (error) { /* already gone */ }
					}
				}
				void order;
				void label;
				var handles = [];
				/* only the payload panel is registered now: the sidebar row itself is
				   drawn by this plugin, so a shell list that forgets it cannot make
				   the entry disappear. */
				handles.push(slotCtx.slots.inject("main", function () {
					return slotCtx.slots.register({ name: "main", key: id, locale: NS }, makeAdoptedPanel(id));
				}));
				adoptedRegistrations[id] = handles;
				adoptionRetryAt = 0;
			} catch (error) {
				/* a transient slot error must not disable the bridge for good:
				   back off and try again on the next pass */
				adoptionRetryAt = Date.now() + 2500;
			}
		}

		/**
		 * The live element behind an adopted panel.
		 *
		 * The host may re-render (and replace) the legacy row at any time; the
		 * stored node then goes stale. This looks the row up again by its key so a
		 * click still reaches the real board.
		 * @param {string} id - panel id.
		 * @returns {Element|null} the element.
		 */
		function resolveAdoptedElement(id) {
			var marked = document.querySelector('[' + ADOPTED_ATTR + '="' + id + '"]');
			if (marked !== null) return marked;
			var key = adoptedIds[id];
			if (key === undefined) return null;
			var record = adopted[key];
			if (record !== undefined && record.el !== null && record.el.isConnected) return record.el;
			var root = document.querySelector(ROOT_SEL);
			if (root === null) return null;
			var own = ownNewSession(root);
			var kids = Array.prototype.slice.call(root.children);
			for (var i = 0; i < kids.length; i++) {
				if (!isQuickEntry(kids[i], own) && kids[i].getAttribute(ADOPTED_ATTR) === null) continue;
				if (quickKey(kids[i]) === key) {
					kids[i].setAttribute(ADOPTED_ATTR, id);
					if (record !== undefined) record.el = kids[i];
					return kids[i];
				}
			}
			return null;
		}

		/**
		 * Panel id for an adopted row: stable across reloads, safe as a slot key.
		 * @param {string} key - the row key.
		 * @returns {string} the panel id.
		 */
		function panelIdFor(key) {
			var id = "dsm-" + key.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
			if (adoptedIds[id] !== undefined) id = id + "-" + Object.keys(adoptedIds).length;
			return id;
		}

		/**
		 * `main` panel of an adopted row: no content of its own, it opens the
		 * legacy board by clicking the hidden row and closes it on unmount.
		 * @param {string} id - the panel id.
		 * @returns {Function} the React component.
		 */
		function makeAdoptedPanel(id) {
			return function AdoptedPanel() {
				React.useEffect(function () {
					var ownRow = document.querySelector('[data-dsm-row="panel:' + id + '"]');
					if (ownRow !== null) ownRow.setAttribute("data-dsm-active", "true");
					var button = resolveAdoptedElement(id);
					if (button !== null) {
						try {
							button.click();
						} catch (error) {
							/* the board stays closed */
						}
					}
					var closedSeen = 0;
					var watch = window.setInterval(function () {
						if (boardVisible()) {
							closedSeen = 0;
							return;
						}
						closedSeen += 1;
						if (closedSeen < 3) return;
						window.clearInterval(watch);
						try {
							var layout = slotCtx === null ? null : (slotCtx.layout || (typeof slotCtx.get === "function" ? slotCtx.get("layout") : null));
							if (layout !== null && typeof layout.selectPanel === "function") layout.selectPanel("conversation");
						} catch (error) {
							/* stay on the empty panel rather than break the shell */
						}
					}, 400);
					return function () {
						window.clearInterval(watch);
						var ownRow = document.querySelector('[data-dsm-row="panel:' + id + '"]');
						if (ownRow !== null) ownRow.removeAttribute("data-dsm-active");
						try {
							document.dispatchEvent(new CustomEvent("dsh-panel-activate", { detail: "__dsh-sidebar-manager__leave__" }));
						} catch (error) {
							/* the board keeps its own state */
						}
					};
				}, []);
				return React.createElement("div", { className: "dsm-adopted-panel", "data-dsm-adopted-panel": id });
			};
		}

		/**
		 * The glyph markup of a panel button (for the Settings rows).
		 * @param {Element} el - the shell's panel button.
		 * @returns {string} inner HTML of the glyph seat, or an empty string.
		 */
		function iconMarkupOf(el) {
			try {
				var glyph = el.querySelector('[data-slot="sidebar.panellist"]');
				return glyph === null ? "" : glyph.innerHTML;
			} catch (error) {
				return "";
			}
		}

		/** Overlays found by the last scan (kept so the poll stays cheap). */
		var legacyOverlays = null;
		var legacyScanAt = 0;

		/**
		 * Does an element carry a `data-dsh-<something>-view` marker?
		 *
		 * Legacy plugins tag their overlay that way. The manager must not know
		 * which plugins exist, so the marker is matched by shape instead.
		 * @param {Element} el - candidate element.
		 * @returns {boolean} true when the marker is present.
		 */
		function isLegacyOverlay(el) {
			if (el === null || el.attributes === undefined) return false;
			for (var i = 0; i < el.attributes.length; i++) {
				var name = el.attributes[i].name;
				if (name.indexOf("data-dsh-") === 0 && name.length > 12 && name.slice(-5) === "-view") return true;
			}
			return false;
		}

		/**
		 * Is a legacy overlay currently on screen?
		 * @returns {boolean} true when one is visible.
		 */
		function boardVisible() {
			if (typeof document === "undefined" || document.body === null) return false;
			if (legacyOverlays !== null) {
				for (var c = 0; c < legacyOverlays.length; c++) {
					if (legacyOverlays[c].isConnected && legacyOverlays[c].offsetParent !== null) return true;
				}
				legacyOverlays = null;
			}
			var now = Date.now();
			if (now - legacyScanAt < 1200) return false;
			legacyScanAt = now;
			var host = document.querySelector('[class*="centerCol"]') || document.body;
			var found = [];
			var nodes = host.getElementsByTagName("*");
			for (var n = 0; n < nodes.length && found.length < 8; n++) {
				if (isLegacyOverlay(nodes[n])) found.push(nodes[n]);
			}
			if (found.length === 0) return false;
			legacyOverlays = found;
			for (var f = 0; f < found.length; f++) {
				if (found[f].offsetParent !== null) return true;
			}
			return false;
		}

		/**
		 * Icon component for an adopted row: re-uses the glyph the legacy plugin
		 * already rendered into its hidden row, so both stay identical.
		 * @param {string} id - the panel id.
		 * @returns {Function} the React component.
		 */
		function makeAdoptedIcon(id) {
			return function AdoptedIcon(props) {
				var markup = iconMarkupFor(id);
				var size = props !== null && props !== undefined && props.size !== undefined ? props.size : 16;
				var style = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: size + "px", height: size + "px" };
				if (markup === "") return React.createElement("span", { className: "dsm-nav-icon", style: style });
				return React.createElement("span", { className: "dsm-nav-icon", style: style, dangerouslySetInnerHTML: { __html: markup } });
			};
		}

		/**
		 * The glyph inside a legacy row (its first child that carries an SVG).
		 * @param {string} id - the panel id.
		 * @returns {string} inner SVG markup, or an empty string.
		 */
		function iconMarkupFor(id) {
			var row = document.querySelector('[' + ADOPTED_ATTR + '="' + id + '"]');
			if (row === null) return "";
			var kids = row.children;
			for (var i = 0; i < kids.length; i++) {
				var svg = kids[i].querySelector ? kids[i].querySelector("svg") : null;
				if (svg !== null) return svg.outerHTML;
			}
			return "";
		}

		/* ------------------------------------------------------------ inventory */

		/**
		 * Collect every manageable entry the sidebar currently shows.
		 * @param {Element} root - the sidebar column.
		 * @returns {{quick: Array, panels: Array, footer: Array, switcher: Element|null, panelList: Element|null}} groups.
		 */
		function collect(root) {
			var quick = [];
			var own = ownNewSession(root);
			var kids = Array.prototype.slice.call(root.children);
			for (var i = 0; i < kids.length; i++) {
				var el = kids[i];
				if (!isQuickEntry(el, own)) continue;
				quick.push({ key: quickKey(el), label: labelOf(el), el: el, kind: "quick" });
			}

			var panels = [];
			var panelList = root.querySelector('[class*="panelList"]');
			if (panelList !== null) {
				var buttons = panelList.querySelectorAll(":scope > button");
				var entries = panelEntries();
				for (var b = 0; b < buttons.length; b++) {
					var label = labelOf(buttons[b]);
					var entry = matchEntry(entries, buttons, b, label);
					panels.push({
						key: entry === null ? "panel:" + label : "panel:" + entry.id,
						label: entry === null ? label : entry.label,
						el: buttons[b],
						kind: "panel"
					});
				}
			}

			/* plugins that mount a row at the top of the region (MCP connector does) */
			var region = [];
			var regionBox = root.querySelector('[class*="regionArea"]');
			if (regionBox !== null) {
				var regionKids = Array.prototype.slice.call(regionBox.children);
				for (var r = 0; r < regionKids.length; r++) {
					var mount = regionKids[r];
					if (mount.hasAttribute("data-slot")) continue;      /* the workspace/session tree */
					/* our own row hides the mount: keep collecting it anyway */
					if (mount.hasAttribute(HIDDEN_ATTR) && !mount.hasAttribute("data-dsm-region")) continue;
					var launcher = mount.tagName === "BUTTON" ? mount : mount.querySelector("button, [role=\"button\"]");
					if (launcher === null) continue;
					var regionLabel = labelOf(launcher);
					if (regionLabel === "") continue;
					region.push({ key: "region:" + regionKeyOf(mount), label: regionLabel, el: launcher, host: mount, kind: "region" });
				}
			}

			var foot = [];
			var footActions = root.querySelector('[class*="footerActions"]');
			if (footActions !== null) {
				var slot = footActions.querySelector('[data-slot="sidebar.footer.action"]');
				var host = slot !== null ? slot : footActions;
				var rows = Array.prototype.slice.call(host.children);
				for (var f = 0; f < rows.length; f++) {
					var rowLabel = labelOf(rows[f]);
					var rowKey = "footer:" + (rows[f].getAttribute("data-dsh-plugin") || rowLabel);
					if (rowLabel === "" && rowKey === "footer:") continue;
					foot.push({ key: rowKey, label: rowLabel === "" ? rowKey : rowLabel, el: rows[f], kind: "footer", orderable: true, hideable: true });
				}
			}
			var usage = root.querySelector("[data-dsh-usage-foot-card]");
			if (usage !== null) foot.push({ key: "footer:usage-card", label: t("usageCard"), el: usage, kind: "footer", orderable: false, hideable: true });
			var settingsArea = root.querySelector("[data-dsh-sidebar-settings]");
			if (settingsArea !== null) foot.push({ key: "footer:settings", label: t("settingsRow"), el: settingsArea, kind: "footer", orderable: false, hideable: false });

			return {
				quick: quick,
				panels: panels,
				region: region,
				footer: foot,
				switcher: root.querySelector('[data-slot="sidebar.quickSwitcher"]'),
				panelList: panelList
			};
		}

		/**
		 * A stable key for a plugin mount at the top of the region.
		 * @param {Element} mount - the mount element.
		 * @returns {string} key tail.
		 */
		function regionKeyOf(mount) {
			var attributes = Array.prototype.slice.call(mount.attributes);
			for (var i = 0; i < attributes.length; i++) {
				if (attributes[i].name.indexOf("data-") === 0 && attributes[i].name !== "data-slot") {
					return attributes[i].name.slice(5) + "=" + attributes[i].value;
				}
			}
			var cls = String(mount.className || "").split(" ")[0];
			return cls === "" ? "entry" : cls;
		}

		/**
		 * One list slot's entries (id + label), when the runtime exposes them; used
		 * to key rendered rows by a stable id instead of their text.
		 * @param {string} name - slot name.
		 * @returns {Array<{id: string, label: string}>} entries, or an empty array.
		 */
		function slotEntriesOf(name) {
			if (slotCtx === null || typeof slotCtx.slots.entriesOfSlot !== "function") return [];
			try {
				var entries = slotCtx.slots.entriesOfSlot(name);
				var out = [];
				for (var i = 0; i < entries.length; i++) {
					var options = entries[i].options || {};
					if (typeof options.id !== "string") continue;
					out.push({ id: options.id, label: resolveLabel(options.label, options.id) });
				}
				return out;
			} catch (error) {
				return [];
			}
		}

		/** @returns {Array<{id: string, label: string}>} sidebar panel slot entries. */
		function panelEntries() {
			return slotEntriesOf("sidebar.panellist");
		}

		/**
		 * A short label for one top-toolbar widget: the first actionable child's
		 * own label, falling back to the widget's text.
		 * @param {Element} el - the widget.
		 * @returns {string} the label.
		 */
		function toolbarLabel(el) {
			var first = el.querySelector('button, [role="button"], [class*="button"]');
			var text = "";
			if (first !== null) text = (first.textContent || "").replace(/\s+/g, " ").trim();
			if (text === "" && first !== null) text = (first.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
			if (text === "") text = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
			if (text === "") text = el.getAttribute("data-dsh-plugin") || "toolbar";
			return text.length > 22 ? text.slice(0, 22) + "…" : text;
		}

		/**
		 * A stable key from a widget's own `data-*` marker, when it has one.
		 * @param {Element} el - the widget.
		 * @returns {string|null} e.g. `attr:data-undo-header:true`.
		 */
		function markerKeyOf(el) {
			var attrs = el.attributes;
			if (!attrs) return null;
			for (var i = 0; i < attrs.length; i++) {
				var name = attrs[i].name;
				if (name.indexOf("data-") !== 0) continue;
				if (name.indexOf("data-dsm-") === 0) continue;
				if (name === "data-slot" || name === "data-dsh-surface" || name === "data-pane") continue;
				return "attr:" + name + ":" + String(attrs[i].value || "").slice(0, 24);
			}
			return null;
		}

		/**
		 * Collect the entries of the shell's top toolbar
		 * (`conversation.session.header.actions`, a list slot).
		 *
		 * Feature-detected by construction: a shell without that slot simply has
		 * no container, so this returns an empty list and the Settings card does
		 * not render.
		 * @returns {Array<{key: string, label: string, el: Element}>} entries.
		 */
		function collectToolbar() {
			var out = [];
			var wrap = document.querySelector('[data-slot="conversation.session.header.actions"]');
			if (wrap === null) return out;
			var kids = Array.prototype.slice.call(wrap.children);
			if (kids.length === 0) return out;
			var entries = slotEntriesOf("conversation.session.header.actions");
			var byIndex = entries.length === kids.length;
			for (var i = 0; i < kids.length; i++) {
				var el = kids[i];
				/* our own group buttons live in the same bar: never treat them as entries */
				if (el.hasAttribute("data-dsm-header-group")) continue;
				var label = toolbarLabel(el);
				var id = byIndex ? entries[i].id : null;
				/* a widget stamped with its own data-* marker gets a marker key
				   (stable across locales); otherwise the slot id, then the text */
				var marker = markerKeyOf(el);
				var key = marker !== null ? "header:" + marker : (id === null ? "header:" + (label || i) : "header:" + id);
				var tip = (el.textContent || "").replace(/\s+/g, " ").trim();
				out.push({
					key: key,
					label: id === null ? label : (label || entries[i].label),
					tip: tip.length > 140 ? tip.slice(0, 140) + "…" : tip,
					el: el
				});
			}
			return out;
		}

		/** Header widgets of the current pass: key -> entry. */
		var headerEntryMap = {};

		/** Adopted legacy rows as entries, with a live element each. */
		function adoptedEntryList() {
			var out = [];
			for (var key in adopted) {
				if (!Object.prototype.hasOwnProperty.call(adopted, key)) continue;
				var record = adopted[key];
				if (record.el === null || record.el.isConnected !== true) {
					var live = resolveAdoptedElement(record.id);
					if (live !== null) record.el = live;
				}
				if (record.el === null) continue;
				out.push({ id: record.id, label: record.label, el: record.el });
			}
			return out;
		}

		/**
		 * Open an adopted panel through the shell's layout service.
		 * @param {string} id - panel id.
		 * @returns {boolean} true when the shell accepted the request.
		 */
		function openAdoptedPanel(id) {
			try {
				var layout = slotCtx === null ? null : (slotCtx.layout || (typeof slotCtx.get === "function" ? slotCtx.get("layout") : null));
				if (layout !== null && typeof layout.selectPanel === "function") {
					layout.selectPanel(id);
					return true;
				}
			} catch (error) {
				/* fall through to the raw click */
			}
			var button = resolveAdoptedElement(id);
			if (button !== null) {
				try { button.click(); return true; } catch (error) { /* ignore */ }
			}
			return false;
		}

		/** Sidebar entries of the current pass (panels + adopted rows). */
		var sidebarEntryListCache = [];

		/** @returns {Array} the sidebar entries known to the current pass. */
		function sidebarEntryList() {
			return sidebarEntryListCache;
		}

		/** Proxy buttons this plugin put in the header bar: key -> element. */
		var headerProxies = {};

		/**
		 * A header-bar button for a sidebar entry that was moved up here. It is a
		 * clone of the shell's own row (so it looks native) and forwards clicks.
		 * @param {Element} wrap - the header actions container.
		 * @param {Object} entry - the sidebar entry.
		 * @param {number} position - order value.
		 * @returns {Element|null} the button.
		 */
		function ensureHeaderProxy(wrap, entry, position) {
			if (wrap === null) return null;
			var existing = headerProxies[entry.key];
			if (existing !== undefined && existing.parentElement !== null) {
				existing.style.order = String(position);
				return existing;
			}
			var button = document.createElement("button");
			button.type = "button";
			button.className = "dsm-hbtn dsm-hproxy";
			button.setAttribute("data-dsm-header-proxy", entry.key);
			button.setAttribute("data-dsm-toolbar", "");
			try {
				var glyph = entry.el.querySelector('[data-slot="sidebar.panellist"]');
				if (glyph !== null) {
					var icon = glyph.cloneNode(true);
					icon.className = "dsm-nav-icon";
					icon.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:none;margin-right:5px";
					button.appendChild(icon);
				}
			} catch (error) {
				/* icon is optional */
			}
			var text = document.createElement("span");
			text.textContent = entry.label;
			button.appendChild(text);
			button.addEventListener("click", function (event) {
				event.preventDefault();
				event.stopPropagation();
				try { entry.el.click(); } catch (error) { /* nothing else to do */ }
				window.setTimeout(syncActiveAll, 60);
			});
			forwardInteraction(button, entry.el);
			wrap.appendChild(button);
			headerProxies[entry.key] = button;
			button.style.order = String(position);
			return button;
		}

		/**
		 * Remove proxies whose entry is no longer placed in the header.
		 * @param {Object} active - key -> true for the proxies that stay.
		 */
		function dropStaleHeaderProxies(active) {
			for (var key in headerProxies) {
				if (!Object.prototype.hasOwnProperty.call(headerProxies, key)) continue;
				if (active[key] === true) continue;
				var el = headerProxies[key];
				if (el.parentElement !== null) el.remove();
				delete headerProxies[key];
			}
		}

		/**
		 * Apply the header pool: order, groups and visibility.
		 *
		 * Group rows are OUR buttons appended to the shell's header bar (the bar
		 * itself is React's; we only add siblings and hide the member widgets).
		 * A group opens a DOWNWARD flyout, because the bar is horizontal.
		 * @returns {{entries: Array, layout: Array}} inventory for the Settings page.
		 */
		function applyToolbar() {
			var items = collectToolbar();
			if (items.length === 0) {
				removeHeaderGroupButtons();
				headerEffectiveLayout = [];
				return { entries: [], layout: [] };
			}
			var hidden = config.hidden || {};
			var headerItems = [];
			for (var h = 0; h < items.length; h++) {
				items[h].kind = "header";
				headerItems.push(items[h]);
			}
			var sidebarItems = sidebarEntryList();
			var all = sidebarItems.concat(headerItems);
			var placement = placementMap(all);
			var layout = resolveLayout(config.headerLayout, all, "header", placement);
			headerEffectiveLayout = layout;
			var byKey = {};
			for (var i = 0; i < all.length; i++) byKey[all[i].key] = all[i];
			headerEntryMap = {};
			for (var hm = 0; hm < headerItems.length; hm++) headerEntryMap[headerItems[hm].key] = headerItems[hm];
			var wrap = document.querySelector('[data-slot="conversation.session.header.actions"]');
			var position = 0;
			var grouped = {};
			var liveGroups = {};
			for (var g = 0; g < layout.length; g++) {
				if (layout[g].kind === "group") liveGroups[layout[g].id] = true;
			}
			dropStaleHeaderGroupButtons(liveGroups);
			var activeProxies = {};
			for (var n = 0; n < layout.length; n++) {
				var node = layout[n];
				if (node.kind === "group") {
					for (var m = 0; m < node.items.length; m++) grouped[node.items[m]] = node.id;
					var button = ensureHeaderGroupButton(wrap, node, byKey);
					if (button !== null) button.style.order = String(position++);
				} else {
					var entry = byKey[node.key];
					if (entry === undefined) continue;
					if (entry.kind === "header") {
						entry.el.style.order = String(position++);
						entry.el.setAttribute("data-dsm-toolbar", "");
					} else {
						ensureHeaderProxy(wrap, entry, position++);
						activeProxies[entry.key] = true;
						/* the real row lives in the sidebar: hide it there */
						entry.el.setAttribute(HIDDEN_ATTR, "");
					}
				}
			}
			/* visibility: hidden entries, grouped widgets, and widgets moved away */
			for (var k = 0; k < items.length; k++) {
				var item = items[k];
				var inGroup = grouped[item.key] !== undefined;
				var movedAway = placement[item.key] === "sidebar" && config.aggressive === true;
				if (hidden[item.key] === true || inGroup || movedAway) item.el.setAttribute(HIDDEN_ATTR, "");
				else item.el.removeAttribute(HIDDEN_ATTR);
			}
			dropStaleHeaderProxies(activeProxies);
			return {
				entries: items.map(function (item) {
					return { key: item.key, label: item.label, tip: item.tip || "", hidden: hidden[item.key] === true };
				}),
				layout: layout
			};
		}

		/** Group buttons this plugin added to the header bar: id -> element. */
		var headerGroupButtons = {};

		/** Remove every group button we appended. */
		function removeHeaderGroupButtons() {
			for (var id in headerGroupButtons) {
				if (!Object.prototype.hasOwnProperty.call(headerGroupButtons, id)) continue;
				var el = headerGroupButtons[id];
				if (el.parentElement !== null) el.remove();
			}
			headerGroupButtons = {};
			closeHeaderFlyoutNow();
		}

		/**
		 * Remove the buttons of groups that no longer exist (keeps the live ones,
		 * so a hover/flyout is not destroyed by the 120ms apply pass).
		 * @param {Object} liveGroups - id -> true for the groups still present.
		 */
		function dropStaleHeaderGroupButtons(liveGroups) {
			var removed = false;
			for (var id in headerGroupButtons) {
				if (!Object.prototype.hasOwnProperty.call(headerGroupButtons, id)) continue;
				if (liveGroups[id] === true) continue;
				var el = headerGroupButtons[id];
				if (el.parentElement !== null) el.remove();
				delete headerGroupButtons[id];
				removed = true;
			}
			if (removed) closeHeaderFlyoutNow();
		}

		/**
		 * Create (or move) the button that represents a header group.
		 * @param {Element} wrap - the shell's header actions container.
		 * @param {Object} node - layout group node.
		 * @param {Object} byKey - entries by key.
		 * @returns {Element|null} the button.
		 */
		function ensureHeaderGroupButton(wrap, node, byKey) {
			if (wrap === null) return null;
			var existing = headerGroupButtons[node.id];
			if (existing !== undefined && existing.parentElement !== null) {
				existing.__dsmNode = node;
				existing.__dsmByKey = byKey;
				var existingCount = existing.querySelector(".dsm-hbtn-count");
				if (existingCount !== null) existingCount.textContent = String(node.items.length);
				var existingText = existing.querySelector(".dsm-hbtn-label");
				if (existingText !== null) existingText.textContent = node.name;
				var existingGlyph = existing.querySelector(".dsm-hbtn-glyph");
				if (existingGlyph !== null) paintIcon(existingGlyph, node.icon || "");
				return existing;
			}
			var button = document.createElement("button");
			button.type = "button";
			button.className = "dsm-hbtn";
			button.setAttribute("data-dsm-header-group", node.id);
			button.setAttribute("data-dsm-toolbar", "");
			var glyph = document.createElement("span");
			glyph.className = "dsm-hbtn-glyph";
			glyph.style.cssText = "margin-right:5px;opacity:.85;font-size:12px;display:inline-flex;align-items:center";
			paintIcon(glyph, node.icon || "");
			button.appendChild(glyph);
			var text = document.createElement("span");
			text.className = "dsm-hbtn-label";
			text.textContent = node.name;
			button.appendChild(text);
			var count = document.createElement("span");
			count.className = "dsm-hbtn-count";
			count.textContent = String(node.items.length);
			button.appendChild(count);
			var chevron = document.createElement("span");
			chevron.className = "dsm-hbtn-chevron";
			chevron.textContent = "▾";
			button.appendChild(chevron);
			button.addEventListener("mouseenter", function () {
				if (button.__dsmNode) openHeaderFlyout(button, button.__dsmNode, button.__dsmByKey);
			});
			button.addEventListener("mouseleave", closeHeaderFlyoutSoon);
			button.addEventListener("click", function (event) {
				event.preventDefault();
				event.stopPropagation();
				if (button.__dsmNode) openHeaderFlyout(button, button.__dsmNode, button.__dsmByKey);
			});
			wrap.appendChild(button);
			headerGroupButtons[node.id] = button;
			return button;
		}

		var headerFlyout = null;
		var headerFlyoutTimer = null;

		/**
		 * Open the DOWNWARD flyout of a header group.
		 * @param {Element} anchor - the group button.
		 * @param {Object} node - the group node.
		 * @param {Object} byKey - entries by key.
		 */
		function openHeaderFlyout(anchor, node, byKey) {
			closeHeaderFlyoutNow();
			var fly = document.createElement("div");
			fly.className = "dsm-flyout dsm-flyout-down";
			fly.setAttribute("data-dsm-header-flyout", node.id);
			if (node.items.length === 0) {
				var empty = document.createElement("div");
				empty.className = "dsm-flyout-empty";
				empty.textContent = t("emptyGroup");
				fly.appendChild(empty);
			}
			for (var i = 0; i < node.items.length; i++) {
				var entry = byKey[node.items[i]];
				if (entry === undefined) continue;
				var row = document.createElement("button");
				row.type = "button";
				row.className = "dsm-flyout-row";
				var label = document.createElement("span");
				label.textContent = entry.label;
				label.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
				row.appendChild(label);
				row.addEventListener("click", (function (target) {
					return function (event) {
						event.preventDefault();
						event.stopPropagation();
						triggerWidget(target);
						closeHeaderFlyoutNow();
					};
				})(entry.el));
				fly.appendChild(row);
			}
			document.body.appendChild(fly);
			var rect = anchor.getBoundingClientRect();
			fly.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - fly.offsetWidth - 8)) + "px";
			fly.style.top = Math.round(rect.bottom + 6) + "px";
			fly.addEventListener("mouseenter", cancelHeaderFlyoutClose);
			fly.addEventListener("mouseleave", closeHeaderFlyoutSoon);
			headerFlyout = fly;
		}

		/**
		 * Fire a header widget's primary action (its first button, or itself).
		 * @param {Element} el - the widget.
		 */
		function triggerWidget(el) {
			try {
				var target = el.tagName === "BUTTON" ? el : el.querySelector('button, [role="button"]');
				if (target !== null) target.click();
				else el.click();
			} catch (error) {
				/* the widget keeps its own state */
			}
		}

		/** Close the header flyout after a grace period. */
		function closeHeaderFlyoutSoon() {
			cancelHeaderFlyoutClose();
			headerFlyoutTimer = window.setTimeout(closeHeaderFlyoutNow, 200);
		}

		/** Cancel a pending header-flyout close. */
		function cancelHeaderFlyoutClose() {
			if (headerFlyoutTimer !== null) {
				window.clearTimeout(headerFlyoutTimer);
				headerFlyoutTimer = null;
			}
		}

		/** Close the header flyout immediately. */
		function closeHeaderFlyoutNow() {
			cancelHeaderFlyoutClose();
			if (headerFlyout !== null && headerFlyout.parentElement !== null) headerFlyout.remove();
			headerFlyout = null;
		}

		/**
		 * Resolve a slot label option (string, thunk, or missing).
		 * @param {*} label - the option.
		 * @param {string} fallback - id fallback.
		 * @returns {string} resolved text.
		 */
		function resolveLabel(label, fallback) {
			try {
				var value = typeof label === "function" ? label() : label;
				return typeof value === "string" && value !== "" ? value : String(fallback);
			} catch (error) {
				return String(fallback);
			}
		}

		/**
		 * Match one rendered panel button to its slot entry.
		 *
		 * The shell renders the list in slot order, so the index is the primary
		 * key; the label is the fallback when the counts disagree (an entry whose
		 * component failed to render).
		 * @param {Array} entries - slot entries.
		 * @param {NodeList} buttons - rendered buttons.
		 * @param {number} index - current index.
		 * @param {string} label - current button label.
		 * @returns {{id: string, label: string}|null} the matching entry.
		 */
		function matchEntry(entries, buttons, index, label) {
			if (entries.length === 0) return null;
			if (entries.length === buttons.length && entries[index] !== undefined) return entries[index];
			for (var i = 0; i < entries.length; i++) {
				if (entries[i].label === label) return entries[i];
			}
			return null;
		}

		/* --------------------------------------------------------------- apply */

		/**
		 * Apply the arrangement to one sidebar column.
		 * @param {Element} root - the sidebar column.
		 * @returns {{entries: Array, layout: Array}} the inventory.
		 */
		function applyTo(root) {
			var groups = collect(root);
			/* legacy rows first: promoting them changes the panel list itself */
			adoptQuickEntries(groups.quick);

			var logo = root.querySelector('[class*="logoRow"]');
			if (logo !== null) logo.style.order = String(BAND.logo);
			var newSession = ownNewSession(root);
			if (newSession !== null) newSession.style.order = String(BAND.newSession);

			var hidden = config.hidden || {};
			var quick = groups.quick.filter(function (item) { return item.el.getAttribute(ADOPTED_ATTR) === null; });

			for (var q = 0; q < quick.length; q++) {
				quick[q].el.style.order = String(BAND.quickBase + q);
				if (hidden[quick[q].key]) quick[q].el.setAttribute(HIDDEN_ATTR, "");
				else quick[q].el.removeAttribute(HIDDEN_ATTR);
			}

			if (groups.switcher !== null) {
				var switcherBox = effectiveBox(groups.switcher);
				if (switcherBox !== null) {
					switcherBox.style.order = String(BAND.switcher);
					switcherBox.style.flex = "0 0 auto";
				}
			}

			var region = root.querySelector('[class*="regionArea"]');
			if (region !== null) region.style.order = String(BAND.region);
			var footer = root.querySelector('[class*="footArea"]');
			if (footer !== null) footer.style.order = String(BAND.footer);
			if (groups.panelList !== null) {
				groups.panelList.style.order = String(BAND.panelList);
				markOverflow(groups.panelList);
			}

			for (var f = 0; f < groups.footer.length; f++) {
				var foot = groups.footer[f];
				if (foot.orderable) foot.el.style.order = String(f);
				if (foot.hideable !== false && hidden[foot.key]) foot.el.setAttribute(HIDDEN_ATTR, "");
				else foot.el.removeAttribute(HIDDEN_ATTR);
			}

			var entries = [];
			for (var p = 0; p < groups.panels.length; p++) {
				entries.push({ key: groups.panels[p].key, label: groups.panels[p].label, kind: "panel", el: groups.panels[p].el, icon: iconMarkupOf(groups.panels[p].el) });
			}
			for (var w = 0; w < quick.length; w++) {
				entries.push({ key: quick[w].key, label: quick[w].label, kind: "quick", el: quick[w].el, icon: iconMarkupOf(quick[w].el) });
			}
			for (var ad = 0; ad < adoptedEntryList().length; ad++) {
				var adoptedEntry = adoptedEntryList()[ad];
				entries.push({
					key: "panel:" + adoptedEntry.id,
					label: adoptedEntry.label,
					kind: "adopted",
					el: adoptedEntry.el,
					id: adoptedEntry.id,
					icon: iconMarkupOf(adoptedEntry.el)
				});
			}
			for (var rg = 0; rg < groups.region.length; rg++) {
				var regionEntry = groups.region[rg];
				entries.push({ key: regionEntry.key, label: regionEntry.label, kind: "region", el: regionEntry.el, icon: iconMarkupOf(regionEntry.el) });
				/* the clone in our list is the visible row; hide the original mount */
				regionEntry.host.setAttribute("data-dsm-region", "");
				regionEntry.host.setAttribute(HIDDEN_ATTR, "");
			}
			sidebarEntryListCache = entries;
			var headerItems = collectToolbar();
			for (var hi = 0; hi < headerItems.length; hi++) headerItems[hi].kind = "header";
			var all = entries.concat(headerItems);
			var placement = placementMap(all);
			effectiveLayout = resolveLayout(config.layout, all, "sidebar", placement);
			renderPanelList(root, groups.panelList, all, hidden);

			return {
				entries: entries.map(function (entry) {
					return { key: entry.key, label: entry.label, kind: entry.kind, icon: entry.icon || "", hidden: hidden[entry.key] === true };
				}),
				layout: effectiveLayout
			};
		}

		/** @param {object} entry @returns {string} the pool an entry belongs to. */
		function homeOf(entry) {
			return entry.kind === "header" ? "header" : "sidebar";
		}

		/**
		 * Explicit placements across BOTH pools: key -> pool id.
		 * @returns {Object} the map.
		 */
		function placementMap(entries) {
			var map = {};
			var byKey = {};
			for (var e = 0; e < (entries || []).length; e++) byKey[entries[e].key] = entries[e];
			var crossOk = config.aggressive === true;
			var mark = function (layout, poolId) {
				for (var i = 0; i < layout.length; i++) {
					var node = layout[i];
					var keys = node.kind === "item" ? [node.key] : (node.kind === "group" ? node.items : []);
					for (var j = 0; j < keys.length; j++) {
						/* a foreign placement only counts while the experiment is on;
						   otherwise the entry falls back to its own pool */
						var entry = byKey[keys[j]];
						if (!crossOk && entry !== undefined && homeOf(entry) !== poolId) continue;
						map[keys[j]] = poolId;
					}
				}
			};
			mark(config.layout || [], "sidebar");
			mark(config.headerLayout || [], "header");
			return map;
		}

		/**
		 * Merge the saved layout of one pool with what actually exists now.
		 *
		 * With `aggressive` on, an entry may live in the OTHER pool's layout; with
		 * it off, foreign placements are ignored and the entry falls back home.
		 * @param {Array} layout - saved layout of this pool.
		 * @param {Array} entries - every known entry (both pools).
		 * @param {string} poolId - "sidebar" or "header".
		 * @param {Object} placement - explicit placements across both pools.
		 * @returns {Array} the effective layout.
		 */
		function resolveLayout(layout, entries, poolId, placement) {
			var byKey = {};
			for (var i = 0; i < entries.length; i++) byKey[entries[i].key] = entries[i];
			var placed = {};
			var out = [];
			var crossOk = config.aggressive === true;
			var acceptable = function (key) {
				if (byKey[key] === undefined || placed[key] === true) return false;
				return crossOk || homeOf(byKey[key]) === poolId;
			};
			for (var l = 0; l < layout.length; l++) {
				var node = layout[l];
				if (node.kind === "item") {
					if (!acceptable(node.key)) continue;
					placed[node.key] = true;
					out.push({ kind: "item", key: node.key });
				} else if (node.kind === "group") {
					var items = (node.items || []).filter(acceptable);
					for (var j = 0; j < items.length; j++) placed[items[j]] = true;
					out.push({ kind: "group", id: node.id, name: node.name, icon: typeof node.icon === "string" ? node.icon : "", items: items });
				}
			}
			/* entries nobody placed stay in their own pool */
			for (var e = 0; e < entries.length; e++) {
				var entry = entries[e];
				if (placed[entry.key] === true) continue;
				if (placement[entry.key] !== undefined) continue;
				if (homeOf(entry) !== poolId) continue;
				out.push({ kind: "item", key: entry.key });
			}
			return out;
		}

		/**
		 * Render this plugin's version of the panel list. Rows are clones of the
		 * shell's buttons; an entry that was moved over from the TOP BAR is the
		 * real widget, re-parented into a row container.
		 * @param {Element} root - the sidebar column.
		 * @param {Element|null} panelList - the shell's panel list.
		 * @param {Array} entries - every known entry (both pools).
		 * @param {Object} hidden - hidden map.
		 */
		function renderPanelList(root, panelList, entries, hidden) {
			if (panelList === null) return;
			panelList.setAttribute(NATIVE_NAV_ATTR, "");
			var host = root.querySelector("[" + NAV_HOST_ATTR + "]");
			if (host === null) {
				host = document.createElement("div");
				host.setAttribute(NAV_HOST_ATTR, "");
				host.style.order = String(BAND.panelList);
				if (panelList.parentElement === root) root.insertBefore(host, panelList.nextElementSibling);
				else root.appendChild(host);
			}
			var byKey = {};
			for (var i = 0; i < entries.length; i++) byKey[entries[i].key] = entries[i];

			var visible = effectiveLayout.map(function (node) {
				if (node.kind === "group") {
					return { kind: "group", id: node.id, name: node.name, icon: node.icon || "", items: node.items.filter(function (key) { return hidden[key] !== true; }) };
				}
				return { kind: "item", key: node.key };
			}).filter(function (node) {
				if (node.kind === "group") return true;
				return hidden[node.key] !== true && byKey[node.key] !== undefined;
			});

			var signature = JSON.stringify({
				rows: visible,
				labels: entries.map(function (entry) { return entry.key + "|" + entry.label; }),
				icons: entries.map(function (entry) { return entry.key + "|" + entryIcon(entry.key); })
			});
			if (host.getAttribute("data-dsm-sig") !== signature) {
				host.setAttribute("data-dsm-sig", signature);
				/* detach moved widgets first so re-parenting them stays cheap and safe */
				releaseMovedWidgets();
				while (host.firstChild !== null) host.removeChild(host.firstChild);
				for (var n = 0; n < visible.length; n++) {
					var node = visible[n];
					if (node.kind === "group") host.appendChild(buildGroupRow(node, byKey));
					else {
						var entry = byKey[node.key];
						if (entry !== undefined && entry.kind === "header") host.appendChild(buildMovedWidgetRow(entry));
						else host.appendChild(buildItemRow(node.key, byKey));
					}
				}
			}
			restoreOrphanWidgets(host);
			syncActive(host);
		}

		/**
		 * Put back any re-parented widget that the current rows do not host.
		 * @param {Element} host - our panel list.
		 */
		function restoreOrphanWidgets(host) {
			for (var key in movedWidgets) {
				if (!Object.prototype.hasOwnProperty.call(movedWidgets, key)) continue;
				var record = movedWidgets[key];
				if (host.contains(record.el)) continue;
				if (record.parent !== null && record.parent.isConnected) {
					try {
						record.parent.insertBefore(record.el, record.next !== null && record.next.parentElement === record.parent ? record.next : null);
					} catch (error) {
						try { record.parent.appendChild(record.el); } catch (e) { /* detached */ }
					}
				}
				record.el.classList.remove("dsm-nest-widget");
				delete movedWidgets[key];
			}
		}

		/** Widgets this plugin re-parented: key -> {el, parent, next}. */
		var movedWidgets = {};

		/**
		 * Detach every re-parented widget from our rows (keeps the home record).
		 */
		function releaseMovedWidgets() {
			for (var key in movedWidgets) {
				if (!Object.prototype.hasOwnProperty.call(movedWidgets, key)) continue;
				var el = movedWidgets[key].el;
				if (el.parentElement !== null) el.parentElement.removeChild(el);
			}
		}

		/**
		 * Put every re-parented widget back where the shell rendered it.
		 */
		function restoreMovedWidgets() {
			for (var key in movedWidgets) {
				if (!Object.prototype.hasOwnProperty.call(movedWidgets, key)) continue;
				var record = movedWidgets[key];
				var el = record.el;
				if (record.parent === null || record.parent.isConnected === false) {
					delete movedWidgets[key];
					continue;
				}
				if (el.parentElement !== record.parent) {
					try {
						record.parent.insertBefore(el, record.next !== null && record.next.parentElement === record.parent ? record.next : null);
					} catch (error) {
						try { record.parent.appendChild(el); } catch (e) { /* detached */ }
					}
				}
				delete movedWidgets[key];
			}
		}

		/**
		 * Probe a header widget for its actionable children.
		 *
		 * Composite widgets (the undo cluster) expose several buttons with real
		 * aria-labels; a simple widget (创造模式) exposes none, so the widget
		 * itself is the action.
		 * @param {Element} el - the widget root.
		 * @returns {Array<{el: Element, label: string}>} actions, primary first.
		 */
		function widgetActions(el) {
			var out = [];
			var seen = [];
			var nodes = el.querySelectorAll('button, [role="button"], [aria-label]');
			for (var i = 0; i < nodes.length; i++) {
				var node = nodes[i];
				var label = node.getAttribute("aria-label") || node.getAttribute("title") || (node.textContent || "").trim();
				label = String(label || "").split(/[(（]/)[0].trim();
				if (label === "") continue;
				if (seen.indexOf(node) >= 0) continue;
				seen.push(node);
				out.push({ el: node, label: label });
			}
			if (out.length === 0) out.push({ el: el, label: "" });
			return out;
		}

		/**
		 * Mirror hover / right-click / middle-click from a proxy onto the control it
		 * stands for. CSS-only hover states cannot be reproduced, but every JS
		 * handler (tooltips, context menus, middle-click open) still fires.
		 * @param {Element} proxy - our row or button.
		 * @param {Element} target - the real control.
		 */
		function forwardInteraction(proxy, target) {
			proxy.addEventListener("mouseenter", function () {
				try {
					target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
					target.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
				} catch (error) { /* not all engines allow synthetic hover */ }
			});
			proxy.addEventListener("mouseleave", function () {
				try {
					target.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
					target.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
				} catch (error) { /* ignore */ }
			});
			proxy.addEventListener("contextmenu", function (event) {
				event.preventDefault();
				event.stopPropagation();
				var rect = proxy.getBoundingClientRect();
				try {
					target.dispatchEvent(new MouseEvent("contextmenu", {
						bubbles: true,
						cancelable: true,
						button: 2,
						clientX: Math.round(rect.left + 10),
						clientY: Math.round(rect.top + rect.height / 2)
					}));
				} catch (error) { /* ignore */ }
			});
			proxy.addEventListener("auxclick", function (event) {
				if (event.button !== 1) return;
				event.preventDefault();
				try { target.click(); } catch (error) { /* ignore */ }
			});
		}

		var proxyFlyout = null;

		/** Close the proxy flyout. */
		function closeProxyFlyout() {
			cancelProxyFlyoutClose();
			if (proxyFlyout !== null && proxyFlyout.parentElement !== null) proxyFlyout.remove();
			proxyFlyout = null;
		}

		/**
		 * List every action of a multi-button widget, to the right of its row.
		 * @param {Element} anchor - the proxy row.
		 * @param {Array<{el: Element, label: string}>} actions - the actions.
		 */
		function openProxyFlyout(anchor, actions) {
			closeProxyFlyout();
			var fly = document.createElement("div");
			fly.className = "dsm-flyout";
			fly.setAttribute("data-dsm-proxy-flyout", "1");
			for (var i = 0; i < actions.length; i++) {
				(function (action) {
					var row = document.createElement("button");
					row.type = "button";
					row.className = "dsm-flyout-row";
					row.textContent = action.label;
					row.addEventListener("click", function (event) {
						event.preventDefault();
						event.stopPropagation();
						try { action.el.click(); } catch (error) { /* ignore */ }
						closeProxyFlyout();
					});
					forwardInteraction(row, action.el);
					fly.appendChild(row);
				})(actions[i]);
			}
			document.body.appendChild(fly);
			var rect = anchor.getBoundingClientRect();
			fly.style.left = Math.round(Math.min(rect.right + 8, window.innerWidth - fly.offsetWidth - 8)) + "px";
			fly.style.top = Math.round(Math.max(8, Math.min(rect.top, window.innerHeight - fly.offsetHeight - 8))) + "px";
			fly.addEventListener("mouseenter", cancelProxyFlyoutClose);
			fly.addEventListener("mouseleave", closeProxyFlyoutSoon);
			proxyFlyout = fly;
		}

		var proxyFlyoutTimer = null;

		/** Close the proxy flyout after a short grace period. */
		function closeProxyFlyoutSoon() {
			cancelProxyFlyoutClose();
			proxyFlyoutTimer = window.setTimeout(function () {
				proxyFlyoutTimer = null;
				closeProxyFlyout();
			}, 200);
		}

		/** Cancel a pending proxy-flyout close. */
		function cancelProxyFlyoutClose() {
			if (proxyFlyoutTimer !== null) {
				window.clearTimeout(proxyFlyoutTimer);
				proxyFlyoutTimer = null;
			}
		}

		/**
		 * A sidebar row for an entry moved down from the TOP BAR.
		 *
		 * The widget stays where the shell rendered it (hidden). This row is a
		 * proxy: it forwards the primary action on click, the full action list on
		 * hover, and hover / right-click / middle-click through to the control it
		 * stands for.
		 * @param {Object} entry - the header entry.
		 * @returns {Element} the row.
		 */
		function buildMovedWidgetRow(entry) {
			var actions = widgetActions(entry.el);
			var row = document.createElement("div");
			row.className = "dsm-proxy-row";
			row.setAttribute("data-dsm-row", entry.key);
			row.setAttribute("data-dsm-proxy", entry.key);
			row.setAttribute("role", "button");
			row.tabIndex = 0;

			var glyph = document.createElement("span");
			glyph.className = "dsm-nav-icon";
			glyph.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:none;font-size:12px;opacity:.8";
			glyph.textContent = "⇡";
			row.appendChild(glyph);

			var text = document.createElement("span");
			text.className = "dsm-proxy-label";
			text.textContent = entry.label;
			row.appendChild(text);

			if (actions.length > 1) {
				var count = document.createElement("span");
				count.className = "dsm-proxy-count";
				count.textContent = String(actions.length);
				row.appendChild(count);
			}

			var hint = document.createElement("span");
			hint.className = "dsm-proxy-hint";
			hint.textContent = t("fromHeader");
			row.appendChild(hint);

			row.addEventListener("click", function (event) {
				event.preventDefault();
				event.stopPropagation();
				try { actions[0].el.click(); } catch (error) { /* ignore */ }
			});
			row.addEventListener("keydown", function (event) {
				if (event.key !== "Enter" && event.key !== " ") return;
				event.preventDefault();
				try { actions[0].el.click(); } catch (error) { /* ignore */ }
			});
			if (actions.length > 1) {
				row.addEventListener("mouseenter", function () { openProxyFlyout(row, actions); });
				row.addEventListener("mouseleave", closeProxyFlyoutSoon);
			}
			forwardInteraction(row, actions[0].el);
			return row;
		}

		/**
		 * One clickable row: a clone of the shell's own panel button.
		 * @param {string} key - entry key.
		 * @param {Object} byKey - entries by key.
		 * @returns {Element} the row.
		 */
		function buildItemRow(key, byKey) {
			var entry = byKey[key];
			if (entry === undefined) return document.createElement("div");
			var row = entry.el.cloneNode(true);
			row.removeAttribute("aria-current");
			row.setAttribute("data-dsm-row", key);
			var custom = entryIcon(key);
			if (custom !== "") {
				var glyph = row.querySelector('[data-slot="sidebar.panellist"]');
				if (glyph !== null) paintIcon(glyph, custom);
			}
			row.addEventListener("click", function (event) {
				event.preventDefault();
				event.stopPropagation();
				if (entry.kind === "adopted") openAdoptedPanel(entry.id);
				else {
					try {
						entry.el.click();
					} catch (error) {
						/* nothing else to do */
					}
				}
				window.setTimeout(syncActiveAll, 60);
			});
			return row;
		}

		/**
		 * One group row: same look as a panel row, plus a count and a chevron.
		 * @param {Object} node - layout group node.
		 * @param {Object} byKey - entries by key.
		 * @returns {Element} the row.
		 */
		function buildGroupRow(node, byKey) {
			void byKey;
			var row = document.createElement("div");
			var sample = document.querySelector('[class*="panelList"] > button');
			var base = sample === null ? "" : String(sample.className).split(" ")[0];
			row.className = base + " dsm-group-row";
			row.setAttribute("data-dsm-group", node.id);
			var glyph = document.createElement("span");
			glyph.className = "dsm-nav-icon";
			glyph.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:none;font-size:13px;opacity:.9";
			paintIcon(glyph, node.icon || "");
			row.appendChild(glyph);
			var title = document.createElement("span");
			title.textContent = node.name;
			title.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
			row.appendChild(title);
			var count = document.createElement("span");
			count.className = "dsm-nav-count";
			count.textContent = String(node.items.length);
			row.appendChild(count);
			var chevron = document.createElement("span");
			chevron.className = "dsm-nav-chevron";
			chevron.textContent = "▸";
			row.appendChild(chevron);
			row.addEventListener("mouseenter", function () { openSidebarFlyout(row, node); });
			row.addEventListener("mouseleave", closeSidebarFlyoutSoon);
			row.addEventListener("click", function (event) {
				event.preventDefault();
				event.stopPropagation();
				openSidebarFlyout(row, node);
			});
			return row;
		}

		/**
		 * A flyout row that stands for a top-bar widget inside a group flyout.
		 * @param {Object} entry - the header entry.
		 * @returns {Element} the row.
		 */
		function buildFlyoutProxyRow(entry) {
			var actions = widgetActions(entry.el);
			var row = document.createElement("button");
			row.type = "button";
			row.className = "dsm-flyout-row";
			row.setAttribute("data-dsm-row", entry.key);
			var icon = document.createElement("span");
			icon.className = "dsm-nav-icon";
			icon.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:none;font-size:11px;opacity:.75";
			icon.textContent = "⇡";
			row.appendChild(icon);
			var text = document.createElement("span");
			text.textContent = entry.label;
			text.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left";
			row.appendChild(text);
			if (actions.length > 1) {
				var count = document.createElement("span");
				count.className = "dsm-proxy-count";
				count.textContent = String(actions.length);
				row.appendChild(count);
			}
			row.addEventListener("click", function (event) {
				event.preventDefault();
				event.stopPropagation();
				try { actions[0].el.click(); } catch (error) { /* ignore */ }
			});
			if (actions.length > 1) {
				row.addEventListener("mouseenter", function () { openProxyFlyout(row, actions); });
			}
			forwardInteraction(row, actions[0].el);
			return row;
		}

		var sidebarFlyout = null;

		/**
		 * Open the floating submenu of a group row.
		 * @param {Element} row - the group row.
		 * @param {Object} node - the group node.
		 */
		function openSidebarFlyout(row, node) {
			closeSidebarFlyoutNow();
			var originals = panelButtonMap();
			var fly = document.createElement("div");
			fly.className = "dsm-flyout";
			fly.setAttribute("data-dsm-flyout", node.id);
			if (node.items.length === 0) {
				var empty = document.createElement("div");
				empty.className = "dsm-flyout-empty";
				empty.textContent = t("emptyGroup");
				fly.appendChild(empty);
			}
			for (var i = 0; i < node.items.length; i++) {
				var key = node.items[i];
				var original = originals[key];
				if (original === undefined) {
					var headerEntry = headerEntryMap[key];
					if (headerEntry === undefined) continue;
					fly.appendChild(buildFlyoutProxyRow(headerEntry));
					continue;
				}
				var item = document.createElement("button");
				item.type = "button";
				item.className = "dsm-flyout-row";
				item.setAttribute("data-dsm-row", key);
				var icon = document.createElement("span");
				icon.className = "dsm-nav-icon";
				icon.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:none";
				try {
					var glyph = original.querySelector('[data-slot="sidebar.panellist"]');
					if (glyph !== null) icon.appendChild(glyph.cloneNode(true));
				} catch (error) {
					/* icon is optional */
				}
				var text = document.createElement("span");
				text.textContent = labelOf(original);
				text.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
				item.appendChild(icon);
				item.appendChild(text);
				item.addEventListener("click", (function (button) {
					return function (event) {
						event.preventDefault();
						event.stopPropagation();
						try {
							button.click();
						} catch (error) {
							/* nothing else to do */
						}
						closeSidebarFlyoutNow();
						window.setTimeout(syncActiveAll, 60);
					};
				})(original));
				fly.appendChild(item);
			}
			document.body.appendChild(fly);
			var rect = row.getBoundingClientRect();
			fly.style.left = Math.max(8, Math.min(rect.right + 6, window.innerWidth - fly.offsetWidth - 8)) + "px";
			fly.style.top = Math.max(8, Math.min(rect.top, window.innerHeight - fly.offsetHeight - 8)) + "px";
			fly.addEventListener("mouseenter", cancelSidebarFlyoutClose);
			fly.addEventListener("mouseleave", closeSidebarFlyoutSoon);
			sidebarFlyout = fly;
		}

		var flyoutCloseTimer = null;

		/** Close the sidebar flyout after a grace period (pointer may be moving). */
		function closeSidebarFlyoutSoon() {
			cancelSidebarFlyoutClose();
			flyoutCloseTimer = window.setTimeout(closeSidebarFlyoutNow, 220);
		}

		/** Cancel a pending flyout close. */
		function cancelSidebarFlyoutClose() {
			if (flyoutCloseTimer !== null) {
				window.clearTimeout(flyoutCloseTimer);
				flyoutCloseTimer = null;
			}
		}

		/** Close the sidebar flyout immediately. */
		function closeSidebarFlyoutNow() {
			cancelSidebarFlyoutClose();
			if (sidebarFlyout !== null && sidebarFlyout.parentElement !== null) sidebarFlyout.remove();
			sidebarFlyout = null;
		}

		/** Mirror the shell's active marker onto every cloned row. */
		function syncActiveAll() {
			var roots = document.querySelectorAll(ROOT_SEL);
			for (var i = 0; i < roots.length; i++) {
				var host = roots[i].querySelector("[" + NAV_HOST_ATTR + "]");
				if (host !== null) syncActive(host);
			}
		}

		/**
		 * Copy the active aria-current / hashed active class of each original
		 * button onto its clone (clones are not React-managed, so not a prop).
		 * @param {Element} host - our panel list.
		 */
		function syncActive(host) {
			var rows = host.querySelectorAll("[data-dsm-row]");
			var originals = panelButtonMap();
			for (var i = 0; i < rows.length; i++) {
				var row = rows[i];
				var original = originals[row.getAttribute("data-dsm-row")];
				if (original === undefined) continue;
				var current = original.getAttribute("aria-current");
				if (current === null) row.removeAttribute("aria-current");
				else row.setAttribute("aria-current", current);
				var originalParts = String(original.className).split(" ");
				var isActive = false;
				for (var p = 0; p < originalParts.length; p++) {
					if (originalParts[p].indexOf("panelActive") >= 0) {
						isActive = true;
						if (row.classList.contains(originalParts[p]) === false) row.classList.add(originalParts[p]);
					}
				}
				if (!isActive) {
					var parts = String(row.className).split(" ");
					for (var q = parts.length - 1; q >= 0; q--) {
						if (parts[q].indexOf("panelActive") >= 0) row.classList.remove(parts[q]);
					}
				}
			}
		}

		/**
		 * Map entry key -> the shell's original panel button.
		 * @returns {Object} the map.
		 */
		function panelButtonMap() {
			var out = {};
			var root = document.querySelector(ROOT_SEL);
			if (root === null) return out;
			var panelList = root.querySelector('[class*="panelList"]');
			if (panelList === null) return out;
			var buttons = panelList.querySelectorAll(":scope > button");
			var entries = panelEntries();
			for (var i = 0; i < buttons.length; i++) {
				var label = labelOf(buttons[i]);
				var entry = matchEntry(entries, buttons, i, label);
				out[entry === null ? "panel:" + label : "panel:" + entry.id] = buttons[i];
			}
			return out;
		}

		/**
		 * Flag a scroll container that is taller than its box, so the stylesheet
		 * can fade its bottom edge and make "there is more below" visible.
		 * @param {Element} el - the scroll container.
		 */
		function markOverflow(el) {
			var overflowing = el.scrollHeight > el.clientHeight + 1;
			if (!overflowing) {
				el.removeAttribute("data-dsm-overflow");
				el.removeAttribute("data-dsm-atend");
				return;
			}
			el.setAttribute("data-dsm-overflow", "");
			if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) el.setAttribute("data-dsm-atend", "");
			else el.removeAttribute("data-dsm-atend");
			if (el.getAttribute("data-dsm-scrollbound") === null) {
				el.setAttribute("data-dsm-scrollbound", "");
				el.addEventListener("scroll", function () { markOverflow(el); }, { passive: true });
			}
		}

		/** Apply the arrangement to every sidebar column on the page. */
		function applyAll() {
			if (typeof document === "undefined") return;
			var roots = document.querySelectorAll(ROOT_SEL);
			var next = null;
			for (var i = 0; i < roots.length; i++) {
				try {
					var result = applyTo(roots[i]);
					if (i === 0) next = result;
				} catch (error) {
					/* a hostile DOM must never take the shell down */
					console.warn("[dsh-sidebar-manager] sidebar pass failed", error);
				}
			}
			if (roots.length === 0) sidebarEntryListCache = [];
			try {
				reconcileAdoptions();
			} catch (error) {
				console.warn("[dsh-sidebar-manager] adoption reconcile failed", error);
			}
			observedRoot = roots.length > 0 ? roots[0] : null;
			var base = next !== null ? next : { entries: [], layout: [] };
			var header = { entries: [], layout: [] };
			try {
				header = applyToolbar();
			} catch (error) {
				/* a shell without the toolbar slot simply yields nothing */
				console.warn("[dsh-sidebar-manager] header pass failed", error);
			}
			base.header = header;
			base.toolbar = header.entries;
			if (roots.length > 0 || header.entries.length > 0) publish(base);
			else publish({ entries: [], layout: [], header: { entries: [], layout: [] }, toolbar: [] });
		}

		/**
		 * Publish the inventory (only notifies when it actually changed).
		 * @param {{entries: Array, layout: Array}} next - inventory.
		 */
		function publish(next) {
			var signature = JSON.stringify(next);
			if (signature === lastSignature) return;
			lastSignature = signature;
			inventory = next;
			notify();
		}

		/* -------------------------------------------------------- region height */

		/**
		 * Push the "minimum height of the workspace/session tree" into CSS.
		 * 0 means "auto": half the window height (50vh, handled by the fallback).
		 */
		function applyRegionMin() {
			if (typeof document === "undefined") return;
			var style = document.documentElement.style;
			var value = Math.round(Number(config.regionMin) || 0);
			if (value > 0) {
				/* never let the reservation push the footer off-screen: the header,
				   the workbench switcher and the footer are all fixed-height */
				var foot = document.querySelector('[class*="footArea"]');
				var reserved = (foot === null ? 128 : foot.getBoundingClientRect().height) + 170;
				var cap = Math.max(160, Math.round(window.innerHeight - reserved));
				style.setProperty("--dsh-sidebar-region-min", Math.min(value, cap) + "px");
				document.documentElement.setAttribute("data-dsm-region-effective", String(Math.min(value, cap)));
			} else {
				style.removeProperty("--dsh-sidebar-region-min");
				document.documentElement.removeAttribute("data-dsm-region-effective");
			}
		}

		/**
		 * The largest value the reservation may take right now.
		 * @returns {number} pixels.
		 */
		function regionMinCap() {
			var foot = document.querySelector('[class*="footArea"]');
			var reserved = (foot === null ? 128 : foot.getBoundingClientRect().height) + 170;
			return Math.max(160, Math.round(window.innerHeight - reserved));
		}

		var regionResizeTimer = null;

		/** Re-clamp the reservation when the window is resized. */
		function watchRegionResize() {
			if (typeof window === "undefined" || window.__dsmRegionWatch) return;
			window.__dsmRegionWatch = true;
			window.addEventListener("resize", function () {
				if (regionResizeTimer !== null) window.clearTimeout(regionResizeTimer);
				regionResizeTimer = window.setTimeout(function () {
					regionResizeTimer = null;
					applyRegionMin();
				}, 120);
			});
		}

		/* ------------------------------------------------------------- observer */

		var observer = null;
		var scheduled = false;
		var observedRoot = null;

		function scheduleApply() {
			if (scheduled) return;
			scheduled = true;
			window.setTimeout(function () {
				scheduled = false;
				applyAll();
			}, 120);
		}

		function startObserver() {
			if (observer !== null || typeof document === "undefined") return;
			observer = new MutationObserver(function (records) {
				var root = document.querySelector(ROOT_SEL);
				if (root === null || root !== observedRoot) {
					scheduleApply();
					return;
				}
				var toolbar = document.querySelector('[data-slot="conversation.session.header.actions"]');
				for (var i = 0; i < records.length; i++) {
					var target = records[i].target;
					if (target === root || root.contains(target)) {
						scheduleApply();
						return;
					}
					if (toolbar !== null && (target === toolbar || toolbar.contains(target))) {
						scheduleApply();
						return;
					}
				}
			});
			observer.observe(document.documentElement, { childList: true, subtree: true });
			document.addEventListener("click", onDocumentClick, true);
			startAdoptionWatchdog();
		}

		var adoptionWatchdog = null;

		/**
		 * Poll the adoption bridge: the host can dispose our slot registrations
		 * without touching the DOM, so a mutation observer alone cannot notice.
		 */
		function startAdoptionWatchdog() {
			if (adoptionWatchdog !== null) return;
			adoptionWatchdog = window.setInterval(function () {
				if (typeof document === "undefined" || document.visibilityState === "hidden") return;
				try {
					applyAll();
				} catch (error) {
					/* the watchdog never throws into the shell */
				}
			}, 3000);
		}

		/** Stop the adoption watchdog. */
		function stopAdoptionWatchdog() {
			if (adoptionWatchdog === null) return;
			window.clearInterval(adoptionWatchdog);
			adoptionWatchdog = null;
		}

		function stopObserver() {
			if (observer !== null) {
				try {
					observer.disconnect();
				} catch (error) {
					/* already gone */
				}
				observer = null;
			}
			document.removeEventListener("click", onDocumentClick, true);
			stopAdoptionWatchdog();
			restoreMovedWidgets();
			closeSidebarFlyoutNow();
		}

		/**
		 * A click outside the sidebar flyout closes it.
		 * @param {Event} event - the click.
		 */
		function onDocumentClick(event) {
			if (sidebarFlyout === null) return;
			var target = event.target;
			if (!(target instanceof Element)) return;
			if (sidebarFlyout.contains(target)) return;
			if (target.closest("[data-dsm-group]") !== null) return;
			closeSidebarFlyoutNow();
		}

		/* ---------------------------------------------------------- config ops */

		/**
		 * The applied layout of one pool, in the config draft.
		 * @param {object} draft - config draft.
		 * @param {string} poolId - pool id.
		 * @returns {Array} layout nodes.
		 */
		function draftLayoutOf(draft, poolId) {
			return poolId === "header" ? draft.headerLayout : draft.layout;
		}

		/**
		 * Edit a copy of the EFFECTIVE layout of a pool, then store it.
		 * @param {string} poolId - pool id.
		 * @param {object} draft - config draft.
		 * @param {(layout: Array) => void} edit - mutation callback.
		 */
		function applyLayoutEdit(poolId, draft, edit) {
			var layout = JSON.parse(JSON.stringify(layoutOf(poolId)));
			edit(layout);
			draft[poolId === "header" ? "headerLayout" : "layout"] = sanitiseLayout(layout);
		}

		/**
		 * Find an entry inside a raw layout copy.
		 * @param {Array} layout - layout copy.
		 * @param {string} key - entry key.
		 * @returns {{container: Array, index: number, groupId: string|null}|null} location.
		 */
		function relocate(layout, key) {
			for (var i = 0; i < layout.length; i++) {
				var node = layout[i];
				if (node.kind === "item" && node.key === key) return { container: layout, index: i, groupId: null };
				if (node.kind === "group") {
					var at = node.items.indexOf(key);
					if (at >= 0) return { container: node.items, index: at, groupId: node.id };
				}
			}
			return null;
		}

		/**
		 * Move an entry one step inside its container.
		 * @param {string} poolId - pool id.
		 * @param {string} key - entry key.
		 * @param {number} delta - -1 up, +1 down.
		 */
		function moveEntry(poolId, key, delta) {
			updateConfig(function (draft) {
				applyLayoutEdit(poolId, draft, function (layout) {
					var target = relocate(layout, key);
					if (target === null) return;
					var to = target.index + delta;
					if (to < 0 || to >= target.container.length) return;
					var swap = target.container[target.index];
					target.container[target.index] = target.container[to];
					target.container[to] = swap;
				});
			});
		}

		/**
		 * Find a group node in a draft layout.
		 * @param {Array} layout - layout copy.
		 * @param {string} id - group id.
		 * @returns {Object|null} the node.
		 */
		function findGroup(layout, id) {
			for (var i = 0; i < layout.length; i++) {
				if (layout[i].kind === "group" && layout[i].id === id) return layout[i];
			}
			return null;
		}

		/**
		 * Perform a drag-and-drop move inside one pool.
		 * @param {string} poolId - pool id.
		 * @param {{kind: string, key: (string|undefined), id: (string|undefined)}} moving - what is dragged.
		 * @param {Object} target - {kind:"item", key, edge} or {kind:"group", id}.
		 */
		function dropNode(poolId, moving, target) {
			updateConfig(function (draft) {
				applyLayoutEdit(poolId, draft, function (layout) {
					var fromContainer = null;
					var fromIndex = -1;
					if (moving.kind === "group") {
						for (var i = 0; i < layout.length; i++) {
							if (layout[i].kind === "group" && layout[i].id === moving.id) { fromContainer = layout; fromIndex = i; }
						}
					} else {
						var found = relocate(layout, moving.key);
						if (found !== null) { fromContainer = found.container; fromIndex = found.index; }
					}
					if (fromContainer === null || fromIndex < 0) return;

					var destContainer = null;
					var destIndex = 0;
					if (target.kind === "group") {
						var group = findGroup(layout, target.id);
						if (group === null) return;
						if (moving.kind === "group") {
							destContainer = layout;
							destIndex = layout.indexOf(group) + 1;
						} else {
							destContainer = group.items;
							destIndex = group.items.length;
						}
					} else {
						var to = relocate(layout, target.key);
						if (to === null) return;
						if (moving.kind === "group") {
							var ownerIndex = to.container === layout ? to.index : -1;
							if (ownerIndex < 0) {
								for (var k = 0; k < layout.length; k++) {
									if (layout[k].kind === "group" && layout[k].items === to.container) ownerIndex = k;
								}
							}
							if (ownerIndex < 0) return;
							destContainer = layout;
							destIndex = ownerIndex + (target.edge === "after" ? 1 : 0);
						} else {
							destContainer = to.container;
							destIndex = to.index + (target.edge === "after" ? 1 : 0);
						}
					}
					if (destContainer === null) return;
					if (moving.kind === "group" && destContainer !== layout) return;
					if (destContainer === fromContainer && destContainer.indexOf(fromContainer[fromIndex]) === destIndex) return;

					var moved = fromContainer.splice(fromIndex, 1)[0];
					if (destContainer === fromContainer && fromIndex < destIndex) destIndex -= 1;
					/* a group's items array stores KEYS; the top-level array stores nodes */
					var isKey = typeof moved === "string";
					var value;
					if (destContainer === layout) value = isKey ? { kind: "item", key: moved } : moved;
					else value = isKey ? moved : moved.key;
					if (value === undefined || value === null) return;
					destContainer.splice(Math.max(0, Math.min(destIndex, destContainer.length)), 0, value);
				});
			});
		}

		/**
		 * Place an entry at an explicit position, optionally in the other pool.
		 * @param {string} poolId - target pool.
		 * @param {string} key - entry key.
		 * @param {string|null} groupId - target group, null for the top level.
		 * @param {number|undefined} index - position, defaults to the end.
		 */
		function placeEntry(poolId, key, groupId, index) {
			updateConfig(function (draft) {
				var strip = function (layout) {
					for (var i = layout.length - 1; i >= 0; i--) {
						var node = layout[i];
						if (node.kind === "item" && node.key === key) { layout.splice(i, 1); continue; }
						if (node.kind === "group") {
							var at = node.items.indexOf(key);
							if (at >= 0) node.items.splice(at, 1);
						}
					}
				};
				var sidebar = draft.layout || [];
				var header = draft.headerLayout || [];
				strip(sidebar);
				strip(header);
				var target = poolId === "header" ? header : sidebar;
				draft.layout = sidebar;
				draft.headerLayout = header;
				var group = groupId ? findGroup(target, groupId) : null;
				if (group !== null) {
					var at = index === undefined || index === null || index < 0 ? group.items.length : index;
					group.items.splice(Math.max(0, Math.min(at, group.items.length)), 0, key);
				} else {
					var pos = index === undefined || index === null || index < 0 ? target.length : index;
					target.splice(Math.max(0, Math.min(pos, target.length)), 0, { kind: "item", key: key });
				}
			});
		}

		/**
		 * Move an entry to the end of a group (or back to the top level).
		 * @param {string} poolId - pool id.
		 * @param {string} key - entry key.
		 * @param {string|null} groupId - target group, null for the top level.
		 */
		function moveEntryInto(poolId, key, groupId) {
			updateConfig(function (draft) {
				applyLayoutEdit(poolId, draft, function (layout) {
					var target = relocate(layout, key);
					if (target === null) return;
					target.container.splice(target.index, 1);
					if (groupId === null) {
						layout.push({ kind: "item", key: key });
						return;
					}
					for (var i = 0; i < layout.length; i++) {
						if (layout[i].kind === "group" && layout[i].id === groupId) {
							layout[i].items.push(key);
							return;
						}
					}
				});
			});
		}

		/**
		 * Move an entry to the other surface (sidebar <-> top bar).
		 * @param {string} key - entry key.
		 * @param {string} targetPool - "sidebar" | "header".
		 */
		function moveAcross(key, targetPool) {
			updateConfig(function (draft) {
				var strip = function (layout) {
					for (var i = layout.length - 1; i >= 0; i--) {
						var node = layout[i];
						if (node.kind === "item" && node.key === key) { layout.splice(i, 1); continue; }
						if (node.kind === "group") {
							var at = node.items.indexOf(key);
							if (at >= 0) node.items.splice(at, 1);
						}
					}
				};
				var sidebar = draft.layout || [];
				var header = draft.headerLayout || [];
				strip(sidebar);
				strip(header);
				var target = targetPool === "header" ? header : sidebar;
				target.push({ kind: "item", key: key });
				draft.layout = sidebar;
				draft.headerLayout = header;
			});
		}

		/** Flip one entry's visibility. @param {string} key - entry key. */
		function toggleHidden(key) {
			updateConfig(function (draft) {
				if (draft.hidden[key]) delete draft.hidden[key];
				else draft.hidden[key] = true;
			});
		}

		/**
		 * Add an empty group at the end of a pool.
		 * @param {string} poolId - pool id.
		 * @returns {string} its id.
		 */
		function addGroup(poolId) {
			var id = newGroupId();
			updateConfig(function (draft) {
				applyLayoutEdit(poolId, draft, function (layout) {
					layout.push({ kind: "group", id: id, name: t("groupDefault"), items: [] });
				});
			});
			return id;
		}

		/**
		 * Rename a group.
		 * @param {string} poolId - pool id.
		 * @param {string} id - group id.
		 * @param {string} name - new name.
		 */
		function renameGroup(poolId, id, name) {
			updateConfig(function (draft) {
				applyLayoutEdit(poolId, draft, function (layout) {
					for (var i = 0; i < layout.length; i++) {
						if (layout[i].kind === "group" && layout[i].id === id) layout[i].name = name;
					}
				});
			});
		}

		/**
		 * Built-in icon set: 24×24 line icons drawn with currentColor so they sit
		 * next to the shell's own icons (no emoji, no colour fills).
		 */
		var ICON_LIBRARY = [
			{ id: "folder", d: "M3 7.5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
			{ id: "doc", d: "M7 3h6l4 4v14H7zM13 3v4h4" },
			{ id: "star", d: "M12 4l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.3l5-.7z" },
			{ id: "bolt", d: "M13 3L5 14h5l-1 7 8-11h-5z" },
			{ id: "chart", d: "M4 20h16M7 20v-9M12 20V5M17 20v-6" },
			{ id: "chat", d: "M4 6h16v10H9l-5 4z" },
			{ id: "clock", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2" },
			{ id: "gear", d: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" },
			{ id: "home", d: "M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6H9v6H5a1 1 0 0 1-1-1z" },
			{ id: "tag", d: "M4 12l8-8h8v8l-8 8zM15 9h.01" },
			{ id: "pin", d: "M12 21c0 0 6-6.2 6-10a6 6 0 1 0-12 0c0 3.8 6 10 6 10zM12 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" },
			{ id: "link", d: "M9 15l6-6M10.5 6.5L12.3 4.7a3.5 3.5 0 0 1 5 5l-1.8 1.8M13.5 17.5l-1.8 1.8a3.5 3.5 0 0 1-5-5l1.8-1.8" },
			{ id: "code", d: "M9 7l-5 5 5 5M15 7l5 5-5 5" },
			{ id: "terminal", d: "M4 5h16v14H4zM7 10l2.5 2.5L7 15M12.5 15H17" },
			{ id: "db", d: "M12 4c4 0 7 1.2 7 2.5S16 9 12 9 5 7.8 5 6.5 8 4 12 4zM5 6.5v11C5 18.8 8 20 12 20s7-1.2 7-2.5v-11" },
			{ id: "shield", d: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" },
			{ id: "globe", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" },
			{ id: "layers", d: "M12 3l8 4.5-8 4.5-8-4.5zM4 12l8 4.5 8-4.5M4 16.5L12 21l8-4.5" },
			{ id: "calendar", d: "M5 6h14v14H5zM5 10h14M9 4v4M15 4v4" },
			{ id: "mail", d: "M4 6h16v12H4zM4 7l8 6 8-6" },
			{ id: "rocket", d: "M9 15l-3 3 3-1 1 3 2-4M14.5 4.5c3 0 5 2 5 5 0 3.5-3 6.5-7 8l-2-2c1.5-4 4.5-6 8-6M14 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" },
			{ id: "flag", d: "M6 21V4M6 5h11l-2 3 2 3H6" },
			{ id: "list", d: "M9 7h10M9 12h10M9 17h10M5 7h.01M5 12h.01M5 17h.01" },
			{ id: "puzzle", d: "M10 4h4v2a2 2 0 1 0 4 0V4h2v4a2 2 0 1 1 0 4h-2v6h-4v-2a2 2 0 1 0-4 0v2H6v-6H4a2 2 0 1 1 0-4h2z" }
		];

		/** Markup of one library icon. */
		var ICON_SVG_OPEN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';
		var ICON_SVG_CLOSE = "</svg>";

		/**
		 * @param {string} id - library id.
		 * @returns {string} the path data, or "".
		 */
		function libraryPath(id) {
			for (var i = 0; i < ICON_LIBRARY.length; i++) {
				if (ICON_LIBRARY[i].id === id) return ICON_LIBRARY[i].d;
			}
			return "";
		}

		/**
		 * Whether an icon value is an uploaded image.
		 * @param {*} icon - the stored value.
		 * @returns {boolean} true for a data URL.
		 */
		function iconIsImage(icon) {
			return typeof icon === "string" && icon.indexOf("data:image/") === 0;
		}

		/**
		 * Whether an icon value is a drawn SVG.
		 * @param {*} icon - the stored value.
		 * @returns {boolean} true for the svg encodings.
		 */
		function iconIsSvg(icon) {
			return typeof icon === "string" && (icon.indexOf("svg:") === 0 || icon.indexOf("svgdata:") === 0);
		}

		/**
		 * Inner markup of an svg-encoded icon (library or custom, sanitised).
		 * @param {string} icon - the stored value.
		 * @returns {string} safe inner markup.
		 */
		function iconSvgMarkup(icon) {
			if (!iconIsSvg(icon)) return "";
			if (icon.indexOf("svg:") === 0) {
				var path = libraryPath(icon.slice(4));
				return path === "" ? "" : '<path d="' + path + '"/>';
			}
			return sanitizeSvg(icon.slice(8)) || "";
		}

		/** Tags and attributes a pasted SVG may use. */
		var SVG_TAGS = ["path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "g"];
		var SVG_ATTRS = ["d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "x2", "y1", "y2", "width", "height",
			"points", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "transform",
			"opacity", "fill-rule", "clip-rule"];

		/**
		 * Reduce arbitrary SVG markup to the allowlisted subset (no scripts, no
		 * event handlers, no external references).
		 * @param {string} raw - user / agent supplied markup.
		 * @returns {string|null} safe inner markup, or null.
		 */
		function sanitizeSvg(raw) {
			var text = String(raw === undefined || raw === null ? "" : raw).trim();
			if (text === "" || text.length > 8000) return null;
			if (text.indexOf("<svg") !== 0) text = '<svg xmlns="http://www.w3.org/2000/svg">' + text + "</svg>";
			var parsed = null;
			try {
				parsed = new DOMParser().parseFromString(text, "image/svg+xml");
			} catch (error) {
				return null;
			}
			if (parsed === null) return null;
			var root = parsed.documentElement;
			if (root === null || String(root.nodeName).toLowerCase() !== "svg") return null;
			if (parsed.getElementsByTagName("parsererror").length > 0) return null;

			var out = "";
			var walk = function (node) {
				var kids = node.childNodes;
				for (var i = 0; i < kids.length; i++) {
					var child = kids[i];
					if (child.nodeType !== 1) continue;
					var tag = String(child.nodeName).toLowerCase();
					if (SVG_TAGS.indexOf(tag) < 0) continue;
					var attributes = "";
					for (var a = 0; a < child.attributes.length; a++) {
						var name = String(child.attributes[a].name).toLowerCase();
						if (SVG_ATTRS.indexOf(name) < 0) continue;
						var value = String(child.attributes[a].value);
						if (value.indexOf("url(") >= 0 || value.indexOf("javascript:") >= 0) continue;
						attributes += " " + name + '="' + value.replace(/[<>"]/g, "") + '"';
					}
					out += "<" + tag + attributes + ">";
					if (tag === "g") walk(child);
					out += "</" + tag + ">";
				}
			};
			walk(root);
			return out === "" ? null : out;
		}

		/**
		 * Paint an icon into an element (drawn svg, uploaded image, or legacy glyph).
		 * @param {Element} box - the container.
		 * @param {string} icon - the stored value.
		 */
		function paintIcon(box, icon) {
			while (box.firstChild !== null) box.removeChild(box.firstChild);
			if (iconIsImage(icon)) {
				var img = document.createElement("img");
				img.src = icon;
				img.alt = "";
				img.className = "dsm-icon-img";
				box.appendChild(img);
				return;
			}
			if (iconIsSvg(icon)) {
				var markup = iconSvgMarkup(icon);
				if (markup !== "") {
					box.innerHTML = ICON_SVG_OPEN + markup + ICON_SVG_CLOSE;
					var svg = box.firstElementChild;
					if (svg !== null) {
						svg.setAttribute("width", "16");
						svg.setAttribute("height", "16");
					}
					return;
				}
			}
			box.textContent = typeof icon === "string" && icon !== "" ? icon : "▤";
		}

		var iconPicker = null;
		var iconPickerAnchor = null;
		var iconPickerTeardown = null;

		/** Close the icon picker if it is open. */
		function closeIconPicker() {
			if (iconPickerTeardown !== null) {
				iconPickerTeardown();
				iconPickerTeardown = null;
			}
			if (iconPicker !== null && iconPicker.parentElement !== null) iconPicker.remove();
			iconPicker = null;
			iconPickerAnchor = null;
		}

		/** Prompt an agent can answer to draw a matching icon. */
		var ICON_PROMPT = [
			"画一个 DSH 侧边栏分组图标，要求：",
			"1) 24x24 viewBox，纯线条风格，stroke=currentColor、stroke-width=1.6、fill=none，圆头端点圆角连接；",
			"2) 只用 path/circle/rect/line/polyline/polygon，不用文字、渐变、clipPath、filter、style、script；",
			"3) 在 16px 尺寸下仍然清晰；",
			"4) 直接给我一段 <svg ...>...</svg> 代码，我贴进设置里的图标框。"
		].join("\n");

		/**
		 * Open the icon picker below a group's icon.
		 * @param {Element} anchor - the icon element.
		 * @param {string} poolId - pool id.
		 * @param {string} groupId - group id.
		 * @param {string} current - current icon value.
		 */
		function openIconPicker(anchor, target, current) {
			/* clicking the same icon again closes it */
			if (iconPicker !== null && iconPickerAnchor === anchor) {
				closeIconPicker();
				return;
			}
			var commitIcon = function (value) {
				if (target.entry !== undefined) setEntryIcon(target.entry, value);
				else setGroupIcon(target.pool, target.group, value);
			};
			var poolId = target.pool;
			var groupId = target.group;
			closeIconPicker();
			var pop = document.createElement("div");
			pop.className = "dsm-menu dsm-icon-pop";
			pop.addEventListener("mousedown", function (event) { event.stopPropagation(); });

			var grid = document.createElement("div");
			grid.className = "dsm-icon-grid";
			for (var i = 0; i < ICON_LIBRARY.length; i++) {
				(function (item) {
					var cell = document.createElement("button");
					cell.type = "button";
					cell.className = "dsm-icon-cell";
					cell.title = item.id;
					cell.innerHTML = ICON_SVG_OPEN + '<path d="' + item.d + '"/>' + ICON_SVG_CLOSE;
					if (current === "svg:" + item.id) cell.setAttribute("data-active", "true");
					cell.addEventListener("click", function () {
						commitIcon("svg:" + item.id);
						closeIconPicker();
					});
					grid.appendChild(cell);
				})(ICON_LIBRARY[i]);
			}
			pop.appendChild(grid);

			var custom = document.createElement("div");
			custom.className = "dsm-icon-custom";
			var area = document.createElement("textarea");
			area.className = "dsm-icon-area";
			area.rows = 2;
			area.placeholder = t("pasteSvg");
			custom.appendChild(area);
			var customRow = document.createElement("div");
			customRow.className = "dsm-icon-actions";
			var applyButton = document.createElement("button");
			applyButton.type = "button";
			applyButton.className = "dsm-menu-item";
			applyButton.textContent = t("applySvg");
			applyButton.addEventListener("click", function () {
				var safe = sanitizeSvg(area.value);
				if (safe === null) {
					area.setAttribute("data-invalid", "true");
					return;
				}
				commitIcon("svgdata:" + safe);
				closeIconPicker();
			});
			var ask = document.createElement("button");
			ask.type = "button";
			ask.className = "dsm-menu-item";
			ask.textContent = t("askAgent");
			ask.addEventListener("click", function () {
				try {
					if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ICON_PROMPT);
				} catch (error) { /* clipboard may be blocked */ }
				area.value = ICON_PROMPT;
				area.setAttribute("data-copied", "true");
				area.focus();
			});
			customRow.appendChild(applyButton);
			customRow.appendChild(ask);
			custom.appendChild(customRow);
			pop.appendChild(custom);

			var actions = document.createElement("div");
			actions.className = "dsm-icon-actions";
			var upload = document.createElement("button");
			upload.type = "button";
			upload.className = "dsm-menu-item";
			upload.textContent = t("uploadIcon");
			var file = document.createElement("input");
			file.type = "file";
			file.accept = "image/*";
			file.style.display = "none";
			file.addEventListener("change", function () {
				var picked = file.files && file.files[0];
				if (!picked) return;
				shrinkImage(picked, function (dataUrl) {
					if (dataUrl === null) return;
					commitIcon(dataUrl);
					closeIconPicker();
				});
			});
			upload.addEventListener("click", function () { file.click(); });
			actions.appendChild(upload);
			actions.appendChild(file);

			var clear = document.createElement("button");
			clear.type = "button";
			clear.className = "dsm-menu-item";
			clear.textContent = t("clearIcon");
			clear.addEventListener("click", function () {
				commitIcon("");
				closeIconPicker();
			});
			actions.appendChild(clear);
			pop.appendChild(actions);

			document.body.appendChild(pop);
			var rect = anchor.getBoundingClientRect();
			pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - pop.offsetWidth - 12)) + "px";
			pop.style.top = Math.round(Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - pop.offsetHeight - 12))) + "px";
			iconPicker = pop;
			iconPickerAnchor = anchor;

			/* dismiss on an outside press or Escape (the anchor toggles by itself) */
			var onDown = function (event) {
				var node = event.target;
				if (!(node instanceof Element)) return;
				if (pop.contains(node)) return;
				if (anchor.contains(node)) return;
				closeIconPicker();
			};
			var onKey = function (event) {
				if (event.key === "Escape") closeIconPicker();
			};
			document.addEventListener("mousedown", onDown, true);
			document.addEventListener("keydown", onKey, true);
			iconPickerTeardown = function () {
				document.removeEventListener("mousedown", onDown, true);
				document.removeEventListener("keydown", onKey, true);
			};
		}

		/**
		 * Read an image file into a 32px square data URL (small enough for
		 * localStorage).
		 * @param {File} file - the picked file.
		 * @param {(value: (string|null)) => void} done - receives the data URL.
		 */
		function shrinkImage(file, done) {
			var reader = new FileReader();
			reader.onload = function () {
				var image = new Image();
				image.onload = function () {
					try {
						var size = 32;
						var canvas = document.createElement("canvas");
						canvas.width = size;
						canvas.height = size;
						var context = canvas.getContext("2d");
						var scale = Math.min(size / image.width, size / image.height);
						var w = Math.max(1, Math.round(image.width * scale));
						var h = Math.max(1, Math.round(image.height * scale));
						context.clearRect(0, 0, size, size);
						context.drawImage(image, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
						var url = canvas.toDataURL("image/png");
						done(url.length > 24000 ? null : url);
					} catch (error) {
						done(null);
					}
				};
				image.onerror = function () { done(null); };
				image.src = String(reader.result);
			};
			reader.onerror = function () { done(null); };
			reader.readAsDataURL(file);
		}

		/**
		 * Set a group's icon (emoji, uploaded image, or empty).
		 * @param {string} poolId - pool id.
		 * @param {string} id - group id.
		 * @param {string} icon - the glyph; empty restores the default.
		 */
		function setGroupIcon(poolId, id, icon) {
			var value = cleanIcon(icon === undefined || icon === null ? "" : icon);
			updateConfig(function (draft) {
				applyLayoutEdit(poolId, draft, function (layout) {
					for (var i = 0; i < layout.length; i++) {
						if (layout[i].kind === "group" && layout[i].id === id) layout[i].icon = value;
					}
				});
			});
		}

		/**
		 * Delete a group; its entries return to the top level.
		 * @param {string} poolId - pool id.
		 * @param {string} id - group id.
		 */
		function removeGroup(poolId, id) {
			updateConfig(function (draft) {
				applyLayoutEdit(poolId, draft, function (layout) {
					for (var i = layout.length - 1; i >= 0; i--) {
						if (layout[i].kind !== "group" || layout[i].id !== id) continue;
						var items = layout[i].items.slice();
						layout.splice(i, 1);
						for (var j = 0; j < items.length; j++) layout.push({ kind: "item", key: items[j] });
					}
				});
			});
		}

		/** Reset the whole arrangement. */
		function resetConfig() {
			config = defaults();
			persist();
			applyRegionMin();
			applyAll();
			notify();
		}

		/** Flip the experimental cross-surface mode. */
		function toggleAggressive() {
			updateConfig(function (draft) { draft.aggressive = draft.aggressive !== true; });
			if (config.aggressive !== true) {
				restoreMovedWidgets();
				applyAll();
			}
		}

		/**
		 * Settings page: a menu editor for the sidebar list and the header bar.
		 * @returns {object} the section element tree.
		 */
		function SidebarManagerSection() {
			var force = React.useState(0);
			var bump = force[1];
			var menuState = React.useState(null);
			var menu = menuState[0];
			var setMenu = menuState[1];
			var subState = React.useState(null);
			var sub = subState[0];
			var setSub = subState[1];
			var renameState = React.useState(null);
			var renaming = renameState[0];
			var setRenaming = renameState[1];
			var iconState = React.useState(null);
			var iconEditing = iconState[0];
			var setIconEditing = iconState[1];
			var dragState = React.useState(null);
			var dragging = dragState[0];
			var setDragging = dragState[1];
			var dropState = React.useState(null);
			var drop = dropState[0];
			var setDrop = dropState[1];
			var subTimer = React.useRef(null);
			var closeSubSoon = function () {
				if (subTimer.current !== null) window.clearTimeout(subTimer.current);
				subTimer.current = window.setTimeout(function () { subTimer.current = null; setSub(null); }, 220);
			};
			var cancelSubClose = function () {
				if (subTimer.current !== null) {
					window.clearTimeout(subTimer.current);
					subTimer.current = null;
				}
			};
			var expState = React.useState({});
			var expanded = expState[0];
			var setExpanded = expState[1];

			React.useEffect(function () {
				var subscriber = function () { bump(function (value) { return value + 1; }); };
				listeners.push(subscriber);
				scheduleApply();
				return function () {
					var at = listeners.indexOf(subscriber);
					if (at >= 0) listeners.splice(at, 1);
					closeIconPicker();
				};
			}, []);

			React.useEffect(function () {
				var onKey = function (event) {
					if (event.key !== "Escape") return;
					setMenu(null);
					setSub(null);
					setRenaming(null);
					setIconEditing(null);
					setDragging(null);
					setDrop(null);
				};
				document.addEventListener("keydown", onKey);
				return function () { document.removeEventListener("keydown", onKey); };
			}, []);

			React.useEffect(function () {
				if (menu === null && sub === null) return undefined;
				var close = function (event) {
					var target = event.target;
					if (!(target instanceof Element)) return;
					if (target.closest(".dsm-menu") !== null) return;
					if (target.closest(".dsm-more") !== null) return;
					setMenu(null);
					setSub(null);
				};
				document.addEventListener("mousedown", close);
				return function () { document.removeEventListener("mousedown", close); };
			}, [menu, sub]);

			var hidden = config.hidden || {};

			/**
			 * Commit a rename.
			 * @param {string} poolId - pool id.
			 * @param {string} id - group id.
			 * @param {string} value - new name.
			 */
			function commitRename(poolId, id, value) {
				setRenaming(null);
				var name = String(value || "").trim();
				if (name !== "") renameGroup(poolId, id, name);
			}

			/**
			 * One editable row.
			 * @param {object} pool - the pool being rendered.
			 * @param {object} node - layout node.
			 * @returns {object} the element tree.
			 */
			function rowFor(pool, node) {
				var isGroup = node.kind === "group";
				var entry = isGroup ? null : pool.byKey[node.key];
				var title = isGroup ? node.name : (entry === undefined ? node.key : entry.label);
				var kindText = isGroup
					? t("badgeGroup")
					: (entry === undefined ? "" : (pool.id === "header" ? t("badgeToolbar") : (entry.kind === "quick" ? t("badgeQuick") : t("badgePanel"))));
				var hiddenRow = !isGroup && hidden[node.key] === true;
				var isRenaming = isGroup && renaming === node.id;
				var children = [];
				if (isGroup) {
					children.push(React.createElement("span", {
						key: "chev",
						className: "dsm-chevron",
						title: t("openGroup"),
						"data-expanded": expanded[node.id] === true ? "true" : "false",
						onClick: function (event) {
							event.stopPropagation();
							setExpanded(function (prev) {
								var next = {};
								for (var k in prev) if (Object.prototype.hasOwnProperty.call(prev, k)) next[k] = prev[k];
								if (next[node.id] === true) delete next[node.id];
								else next[node.id] = true;
								return next;
							});
						}
					}, expanded[node.id] === true ? "▾" : "▸"));
				} else {
					children.push(React.createElement("span", { key: "gap", className: "dsm-gap" }));
				}
				if (isGroup) {
					children.push(React.createElement("span", {
						key: "icon",
						className: "dsm-group-icon",
						title: t("setIcon"),
						"data-group-icon": node.id,
						ref: function (element) {
							if (element !== null) paintIcon(element, node.icon || "");
						},
						onClick: function (event) {
							event.stopPropagation();
							openIconPicker(event.currentTarget, { pool: pool.id, group: node.id }, node.icon || "");
						}
					}));
				}
				if (!isGroup) {
					var custom = entryIcon(node.key);
					if (custom !== "") {
						children.push(React.createElement("span", {
							key: "icon",
							className: "dsm-row-icon dsm-edit-icon",
							title: t("setIcon"),
							"data-entry-icon": node.key,
							ref: function (element) {
								if (element !== null) paintIcon(element, custom);
							},
							onClick: function (event) {
								event.stopPropagation();
								openIconPicker(event.currentTarget, { pool: pool.id, entry: node.key }, custom);
							}
						}));
					} else if (entry !== undefined && entry.icon) {
						children.push(React.createElement("span", {
							key: "icon",
							className: "dsm-row-icon dsm-edit-icon",
							title: t("setIcon"),
							"data-entry-icon": node.key,
							dangerouslySetInnerHTML: { __html: entry.icon },
							onClick: function (event) {
								event.stopPropagation();
								openIconPicker(event.currentTarget, { pool: pool.id, entry: node.key }, "");
							}
						}));
					} else {
						children.push(React.createElement("span", {
							key: "icon",
							className: "dsm-row-icon dsm-edit-icon dsm-icon-empty",
							title: t("setIcon"),
							"data-entry-icon": node.key,
							onClick: function (event) {
								event.stopPropagation();
								openIconPicker(event.currentTarget, { pool: pool.id, entry: node.key }, "");
							}
						}, "▤"));
					}
				}
				if (isRenaming) {
					children.push(React.createElement("input", {
						key: "rename",
						className: "dsm-rename",
						defaultValue: node.name,
						autoFocus: true,
						placeholder: t("renameHint"),
						onBlur: function (event) { commitRename(pool.id, node.id, event.target.value); },
						onKeyDown: function (event) {
							if (event.key === "Enter") commitRename(pool.id, node.id, event.target.value);
							if (event.key === "Escape") setRenaming(null);
						}
					}));
				} else {
					children.push(React.createElement("span", { key: "name", className: "dsm-name", title: title }, title));
				}
				if (isGroup) {
					children.push(React.createElement("span", { key: "badge", className: "dsm-badge", "data-kind": "group" }, t("badgeGroup") + " · " + node.items.length));
				} else if (hiddenRow) {
					children.push(React.createElement("span", { key: "badge", className: "dsm-badge", "data-kind": "hidden" }, t("badgeHidden")));
				} else if (kindText !== "") {
					children.push(React.createElement("span", { key: "badge", className: "dsm-badge", "data-kind": "panel" }, kindText));
				}
				children.push(React.createElement("button", {
					key: "more",
					type: "button",
					className: "dsm-more",
					title: t("more"),
					"aria-label": t("more"),
					onClick: function (event) {
						event.stopPropagation();
						var rect = event.currentTarget.getBoundingClientRect();
						setMenu({
							poolId: pool.id,
							kind: isGroup ? "group" : "item",
							key: isGroup ? null : node.key,
							groupId: isGroup ? node.id : null,
							anchor: { x: rect.right, y: rect.bottom }
						});
						setSub(null);
					}
				}, "⋯"));
				var dragged = dragging !== null && dragging.poolId === pool.id &&
					(isGroup ? dragging.id === node.id : dragging.key === node.key);
				var dropKind = "none";
				if (drop !== null && dragging !== null) {
					if (isGroup && drop.kind === "group" && drop.id === node.id) dropKind = "into";
					else if (drop.kind === "item" && drop.key === node.key && !dragged) dropKind = drop.edge;
				}
				return React.createElement("div", {
					key: pool.id + ":" + (isGroup ? "g:" + node.id : "i:" + node.key),
					className: "dsm-item",
					draggable: true,
					"data-hidden": hiddenRow ? "true" : "false",
					"data-kind": isGroup ? "group" : "item",
					"data-row-key": isGroup ? node.id : node.key,
					"data-dragging": dragged ? "true" : "false",
					"data-drop": dropKind,
					onDoubleClick: isGroup ? function () { setRenaming(node.id); } : undefined,
					onDragStart: function (event) {
						event.dataTransfer.effectAllowed = "move";
						try { event.dataTransfer.setData("text/plain", isGroup ? node.id : node.key); } catch (error) { /* older engines */ }
						setDragging({ poolId: pool.id, kind: isGroup ? "group" : "item", key: isGroup ? null : node.key, id: isGroup ? node.id : null });
					},
					onDragEnd: function () { setDragging(null); setDrop(null); },
					onDragOver: function (event) {
						if (dragging === null || dragging.poolId !== pool.id) return;
						if (isGroup ? dragging.id === node.id : dragging.key === node.key) return;
						event.preventDefault();
						event.dataTransfer.dropEffect = "move";
						var rect = event.currentTarget.getBoundingClientRect();
						var ratio = rect.height === 0 ? 0.5 : (event.clientY - rect.top) / rect.height;
						if (isGroup) setDrop({ kind: "group", id: node.id });
						else setDrop({ kind: "item", key: node.key, edge: ratio < 0.5 ? "before" : "after" });
					},
					onDrop: function (event) {
						event.preventDefault();
						event.stopPropagation();
						if (dragging === null || drop === null) { setDragging(null); setDrop(null); return; }
						dropNode(dragging.poolId, dragging, drop);
						setDragging(null);
						setDrop(null);
					}
				}, children);
			}

			/* ---- pools ---- */
			var pools = [];
			var sidebarEntries = inventory.entries || [];
			var sidebarLayout = effectiveLayout.length > 0 ? effectiveLayout : (inventory.layout || []);
			pools.push({ id: "sidebar", title: t("listTitle"), entries: sidebarEntries, layout: sidebarLayout, byKey: indexByKey(sidebarEntries) });
			var headerInv = inventory.header || { entries: [], layout: [] };
			var headerLayout = headerEffectiveLayout.length > 0 ? headerEffectiveLayout : (headerInv.layout || []);
			if ((headerInv.entries || []).length > 0) {
				pools.push({ id: "header", title: t("toolbarTitle"), entries: headerInv.entries, layout: headerLayout, byKey: indexByKey(headerInv.entries) });
			}

			var cards = pools.map(function (pool) {
				var rows = [];
				for (var r = 0; r < pool.layout.length; r++) {
					var layoutNode = pool.layout[r];
					rows.push(rowFor(pool, layoutNode));
					if (layoutNode.kind === "group" && expanded[layoutNode.id] === true) {
						for (var c = 0; c < layoutNode.items.length; c++) {
							rows.push(childRow(pool, layoutNode, layoutNode.items[c], c, {
								dragging: dragging,
								drop: drop,
								setDragging: setDragging,
								setDrop: setDrop
							}));
						}
						if (layoutNode.items.length === 0) {
							rows.push(React.createElement("div", { key: "g:" + layoutNode.id + ":none", className: "dsm-child-empty" }, t("emptyGroup")));
						}
					}
				}
				if (rows.length === 0) rows.push(React.createElement("div", { key: "empty", className: "dsm-empty" }, t("empty")));
				return React.createElement("div", { key: "pool:" + pool.id, className: "dsm-card" }, [
					React.createElement("div", { key: "head", className: "dsm-card-head" }, [
						React.createElement("span", { key: "label", className: "dsm-card-title" }, pool.title),
						React.createElement("button", {
							key: "add",
							type: "button",
							className: "dsm-add",
							onClick: function () { setRenaming(addGroup(pool.id)); }
						}, "＋ " + t("newGroup"))
					]),
					React.createElement("div", { key: "rows", className: "dsm-list" }, rows)
				]);
			});

			var defaultRegion = Math.round((typeof window === "undefined" ? 800 : window.innerHeight) / 2);
			return React.createElement("div", { className: "dsm-root" }, [
				React.createElement("div", { key: "head" }, [
					React.createElement("h2", { key: "title", className: "dsm-title" }, t("title")),
					React.createElement("p", { key: "hint", className: "dsm-hint" }, t("hint"))
				])
			].concat(cards, [
				React.createElement("div", { key: "foot", className: "dsm-card" }, [
					React.createElement("div", { key: "head", className: "dsm-card-head" }, [
						React.createElement("span", { key: "label", className: "dsm-card-title" }, t("other"))
					]),
					React.createElement("div", { key: "body", className: "dsm-footcard" }, [
						React.createElement("label", { key: "region", className: "dsm-line" }, [
							React.createElement("span", { key: "t", style: { minWidth: 96 } }, t("regionMin")),
							React.createElement("input", {
								key: "num",
								className: "dsm-num",
								type: "number",
								min: "0",
								step: "20",
								value: config.regionMin > 0 ? String(config.regionMin) : "",
								placeholder: String(defaultRegion),
								onChange: function (event) { setRegionMin(event.target.value); }
							}),
							React.createElement("span", { key: "px", className: "dsm-hint" }, "px"),
							React.createElement("button", {
								key: "reset",
								type: "button",
								className: "dsm-add",
								onClick: function () { setRegionMin(""); }
							}, t("regionReset"))
						]),
						React.createElement("div", { key: "expTitle", className: "dsm-subtitle" }, [
							React.createElement("span", { key: "t" }, t("experimentalNote")),
							React.createElement("span", { key: "tag", className: "dsm-tag" }, t("experimental"))
						]),
						React.createElement("label", { key: "aggressive", className: "dsm-line" }, [
							React.createElement("input", {
								key: "box",
								type: "checkbox",
								checked: config.aggressive === true,
								onChange: function () { toggleAggressive(); }
							}),
							React.createElement("span", { key: "text" }, t("aggressive")),
							React.createElement("span", { key: "tag", className: "dsm-tag" }, t("experimental"))
						]),
						React.createElement("p", { key: "aggressiveHint", className: "dsm-hint" }, t("aggressiveHint")),
						React.createElement("p", { key: "regionHint", className: "dsm-hint" }, t("regionHint") + " " + (config.regionMin > 0 && config.regionMin > regionMinCap() ? "（当前窗口上限 " + regionMinCap() + "px，已自动收敛）" : "")),
						React.createElement("button", { key: "reset", type: "button", className: "dsm-reset", onClick: resetConfig }, t("reset"))
					])
				]),
				menu === null ? null : React.createElement(ContextMenu, {
					key: "menu",
					state: menu,
					byKey: menu.poolId === "header" ? indexByKey((inventory.header || {}).entries || []) : indexByKey(sidebarEntries),
					hidden: hidden,
					groups: (menu.poolId === "header" ? headerLayout : sidebarLayout).filter(function (node) { return node.kind === "group"; }),
					onClose: function () { setMenu(null); setSub(null); },
					onSub: setSub,
					onSubClose: closeSubSoon,
					onMove: moveEntry,
					onMoveAcross: moveAcross,
					onMoveInto: moveEntryInto,
					onToggle: toggleHidden,
					onRename: function (poolId, id) { setMenu(null); setSub(null); setRenaming(id); },
					onSetEntryIcon: function (poolId, key) {
						setMenu(null);
						setSub(null);
						var iconEl = document.querySelector('[data-entry-icon="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]');
						var currentValue = entryIcon(key);
						if (iconEl !== null) openIconPicker(iconEl, { pool: poolId, entry: key }, currentValue);
					},
					onSetIcon: function (id) {
						setMenu(null);
						setSub(null);
						var iconEl = document.querySelector('[data-group-icon="' + id + '"]');
						if (iconEl !== null) {
							var node = null;
							for (var pi = 0; pi < pools.length; pi++) {
								for (var li = 0; li < pools[pi].layout.length; li++) {
									if (pools[pi].layout[li].kind === "group" && pools[pi].layout[li].id === id) node = pools[pi].layout[li];
								}
							}
							openIconPicker(iconEl, { pool: "sidebar", group: id }, node === null ? "" : (node.icon || ""));
						}
					},
					onRemoveGroup: removeGroup
				}),
				sub === null ? null : React.createElement(SubMenu, {
					key: "sub",
					state: sub,
					onClose: function () { setSub(null); },
					onFinish: function () { setSub(null); setMenu(null); },
					onCancelClose: cancelSubClose,
					onMoveInto: moveEntryInto,
					onMenu: setMenu
				})
			]));
		}

		/**
		 * Index entries by key.
		 * @param {Array} entries - entries.
		 * @returns {Object} key -> entry.
		 */
		function indexByKey(entries) {
			var out = {};
			for (var i = 0; i < (entries || []).length; i++) out[entries[i].key] = entries[i];
			return out;
		}

		/**
		 * Set the "minimum height reserved for the workspace tree" preference.
		 * @param {string} raw - the input value; empty/0 means "half the window".
		 */
		function setRegionMin(raw) {
			var value = Math.max(0, Math.round(Number(raw) || 0));
			updateConfig(function (draft) { draft.regionMin = value; });
		}

		/**
		 * Open the settings-side group flyout to the right of a row.
		 * @param {Element} anchor - the chevron element.
		 * @param {object} pool - the pool.
		 * @param {object} node - the group node.
		 * @param {Function} setSub - submenu setter.
		 */
		function openGroupFlyout(anchor, pool, node, setSub) {
			var rect = anchor.getBoundingClientRect();
			setSub({
				kind: "items",
				poolId: pool.id,
				groupId: node.id,
				name: node.name,
				items: node.items.slice(),
				byKey: pool.byKey,
				x: rect.right + 8,
				y: rect.top
			});
		}

		/**
		 * One row of a group's contents (rendered when the group is expanded).
		 * It is draggable like a top-level row, so moving entries out is the same
		 * gesture as reordering.
		 * @param {object} pool - the pool.
		 * @param {object} group - the group node.
		 * @param {string} key - entry key.
		 * @param {number} index - position inside the group.
		 * @returns {object} the element tree.
		 */
		function childRow(pool, group, key, index, ctx) {
			var dragging = ctx.dragging;
			var drop = ctx.drop;
			var setDragging = ctx.setDragging;
			var setDrop = ctx.setDrop;
			var entry = pool.byKey[key];
			var title = entry === undefined ? key : entry.label;
			var dragged = dragging !== null && dragging.poolId === pool.id && dragging.key === key;
			var dropKind = "none";
			if (drop !== null && drop.kind === "item" && drop.key === key && !dragged) dropKind = drop.edge;
			var children = [React.createElement("span", { key: "gap", className: "dsm-gap" })];
			if (entry !== undefined && entry.icon) {
				children.push(React.createElement("span", {
					key: "icon",
					className: "dsm-row-icon",
					dangerouslySetInnerHTML: { __html: entry.icon }
				}));
			}
			children.push(React.createElement("span", { key: "name", className: "dsm-name", title: title }, title));
			children.push(React.createElement("button", {
				key: "out",
				type: "button",
				className: "dsm-child-out",
				title: t("moveOut"),
				onClick: function () { moveEntryInto(pool.id, key, null); }
			}, "↩"));
			return React.createElement("div", {
				key: pool.id + ":c:" + group.id + ":" + key,
				className: "dsm-item dsm-child",
				draggable: true,
				"data-kind": "child",
				"data-row-key": key,
				"data-dragging": dragged ? "true" : "false",
				"data-drop": dropKind,
				onDragStart: function (event) {
					event.dataTransfer.effectAllowed = "move";
					try { event.dataTransfer.setData("text/plain", key); } catch (error) { /* older engines */ }
					setDragging({ poolId: pool.id, kind: "item", key: key, id: null });
				},
				onDragEnd: function () { setDragging(null); setDrop(null); },
				onDragOver: function (event) {
					if (dragging === null || dragging.poolId !== pool.id) return;
					if (dragging.key === key) return;
					event.preventDefault();
					event.dataTransfer.dropEffect = "move";
					var rect = event.currentTarget.getBoundingClientRect();
					var ratio = rect.height === 0 ? 0.5 : (event.clientY - rect.top) / rect.height;
					setDrop({ kind: "item", key: key, edge: ratio < 0.5 ? "before" : "after" });
				},
				onDrop: function (event) {
					event.preventDefault();
					event.stopPropagation();
					if (dragging === null || drop === null) { setDragging(null); setDrop(null); return; }
					dropNode(dragging.poolId, dragging, drop);
					setDragging(null);
					setDrop(null);
				}
			}, children);
		}

		/**
		 * The context menu of one row.
		 * @param {object} props - menu state and handlers.
		 * @returns {object} the element tree.
		 */
		function ContextMenu(props) {
			var state = props.state;
			var byKey = props.byKey;
			var groups = props.groups;
			var items = [];
			if (state.kind === "item") {
				var entry = byKey[state.key];
				items.push({ header: entry === undefined ? state.key : entry.label });
				items.push({ label: t("moveUp"), action: function () { props.onMove(state.poolId, state.key, -1); props.onClose(); } });
				items.push({ label: t("moveDown"), action: function () { props.onMove(state.poolId, state.key, 1); props.onClose(); } });
				items.push({ label: t("setIcon"), action: function () { props.onSetEntryIcon(state.poolId, state.key); props.onClose(); } });
				items.push({ separator: true });
				items.push({ label: t("moveInto"), sub: true });
				if (config.aggressive === true) {
					items.push({
						label: state.poolId === "header" ? t("moveToSidebar") : t("moveToHeader"),
						action: function () { props.onMoveAcross(state.key, state.poolId === "header" ? "sidebar" : "header"); props.onClose(); }
					});
				}
				items.push({ separator: true });
				items.push({
					label: props.hidden[state.key] ? t("show") : t("hide"),
					action: function () { props.onToggle(state.key); props.onClose(); }
				});
			} else {
				items.push({ label: t("rename"), action: function () { props.onRename(state.poolId, state.groupId); } });
				items.push({ label: t("setIcon"), action: function () { props.onSetIcon(state.groupId); props.onClose(); } });
				items.push({ separator: true });
				items.push({ label: t("removeGroup"), danger: true, action: function () { props.onRemoveGroup(state.poolId, state.groupId); props.onClose(); } });
			}
			return React.createElement("div", {
				className: "dsm-menu",
				style: { left: state.anchor.x + 6 + "px", top: state.anchor.y + 4 + "px" },
				onMouseDown: function (event) { event.stopPropagation(); }
			}, items.map(function (item, index) {
				if (item.separator) return React.createElement("div", { key: "s" + index, className: "dsm-menu-sep" });
				if (item.header) return React.createElement("div", { key: "h" + index, className: "dsm-menu-label" }, item.header);
				if (item.sub) {
					var openSub = function (event) {
						var rect = event.currentTarget.getBoundingClientRect();
						props.onSub({
							kind: "groups",
							poolId: state.poolId,
							items: groups.map(function (node) { return { id: node.id, name: node.name }; }),
							key: state.key,
							x: rect.right + 4,
							y: rect.top
						});
					};
					return React.createElement("button", {
						key: "sub" + index,
						type: "button",
						className: "dsm-menu-item",
						onMouseEnter: openSub,
						onMouseLeave: function () { if (typeof props.onSubClose === "function") props.onSubClose(); },
						onClick: openSub
					}, [
						React.createElement("span", { key: "t" }, item.label),
						React.createElement("span", { key: "c", className: "dsm-menu-sub" }, "▸")
					]);
				}
				return React.createElement("button", {
					key: "i" + index,
					type: "button",
					className: "dsm-menu-item",
					"data-danger": item.danger ? "true" : "false",
					onClick: item.action
				}, item.label);
			}));
		}

		/**
		 * A floating submenu: the group chooser of "move into", or the item list
		 * of a group.
		 * @param {object} props - submenu state and handlers.
		 * @returns {object} the element tree.
		 */
		function SubMenu(props) {
			var state = props.state;
			var children = [];
			if (state.kind === "groups") {
				children.push(React.createElement("div", { key: "label", className: "dsm-menu-label" }, t("moveInto")));
				for (var i = 0; i < state.items.length; i++) {
					children.push(React.createElement("button", {
						key: "g" + i,
						type: "button",
						className: "dsm-menu-item",
						onClick: function (id) {
							return function () {
								props.onMoveInto(state.poolId, state.key, id);
								props.onFinish();
							};
						}(state.items[i].id)
					}, state.items[i].name));
				}
				if (state.items.length === 0) {
					children.push(React.createElement("div", { key: "none", className: "dsm-menu-label" }, t("noGroups")));
				}
				children.push(React.createElement("div", { key: "sep", className: "dsm-menu-sep" }));
				children.push(React.createElement("button", {
					key: "top",
					type: "button",
					className: "dsm-menu-item",
					onClick: function () { props.onMoveInto(state.poolId, state.key, null); props.onFinish(); }
				}, t("moveOut")));
			} else {
				children.push(React.createElement("div", { key: "label", className: "dsm-menu-label" }, state.name + " · " + state.items.length));
				if (state.items.length === 0) {
					children.push(React.createElement("div", { key: "none", className: "dsm-empty" }, t("emptyGroup")));
				}
				for (var j = 0; j < state.items.length; j++) {
					var key = state.items[j];
					var entry = state.byKey[key];
					children.push(React.createElement("button", {
						key: "i" + j,
						type: "button",
						className: "dsm-menu-item",
						onClick: function (event) {
							var rect = event.currentTarget.getBoundingClientRect();
							props.onMenu({
								poolId: state.poolId,
								kind: "item",
								key: key,
								groupId: state.groupId,
								anchor: { x: rect.right, y: rect.top }
							});
							props.onClose();
						}
					}, [
						React.createElement("span", { key: "t" }, entry === undefined ? key : entry.label),
						React.createElement("span", { key: "c", className: "dsm-menu-sub" }, "⋯")
					]));
				}
			}
			return React.createElement("div", {
				className: "dsm-menu dsm-submenu",
				style: { left: state.x + "px", top: state.y + "px" },
				onMouseDown: function (event) { event.stopPropagation(); },
				onMouseEnter: function () { if (typeof props.onCancelClose === "function") props.onCancelClose(); },
				onMouseLeave: function () { if (typeof props.onClose === "function") props.onClose(); }
			}, children);
		}

		/* ----------------------------------------------------------- agent api */

		/**
		 * Install the window API that lets an agent (or a script) drive the
		 * arrangement. Every method returns plain JSON so it survives evaluate().
		 */
		function installAgentApi() {

			if (typeof window === "undefined") return;
			var snapshot = function () {
				return {
					sidebar: JSON.parse(JSON.stringify(effectiveLayout || [])),
					header: JSON.parse(JSON.stringify(headerEffectiveLayout || [])),
					config: JSON.parse(JSON.stringify(config)),
					aggressive: config.aggressive === true
				};
			};
			var entriesOf = function () {
				var out = [];
				var sidebarItems = sidebarEntryList();
				for (var i = 0; i < sidebarItems.length; i++) {
					out.push({ key: sidebarItems[i].key, label: sidebarItems[i].label, kind: sidebarItems[i].kind, pool: "sidebar" });
				}
				for (var key in headerEntryMap) {
					if (!Object.prototype.hasOwnProperty.call(headerEntryMap, key)) continue;
					out.push({ key: key, label: headerEntryMap[key].label, kind: "header", pool: "header" });
				}
				return out;
			};
			var poolOf = function (value) { return value === "header" ? "header" : "sidebar"; };
			window.__dshSidebarManager = {
				version: "1.0.2",
				state: function () { return snapshot(); },
				entries: function () { return entriesOf(); },
				apply: function () {
					try { applyAll(); } catch (error) { /* the caller sees the old state */ }
					return snapshot();
				},
				move: function (key, target) {
					var next = target || {};
					placeEntry(poolOf(next.pool), String(key), next.groupId || null,
						typeof next.index === "number" ? next.index : undefined);
					return snapshot();
				},
				setHidden: function (key, hidden) {
					updateConfig(function (draft) {
						if (hidden === true) draft.hidden[String(key)] = true;
						else delete draft.hidden[String(key)];
					});
					return snapshot();
				},
				addGroup: function (poolId, name, icon) {
					var pool = poolOf(poolId);
					var id = addGroup(pool);
					if (typeof name === "string" && name !== "") renameGroup(pool, id, name);
					if (typeof icon === "string" && icon !== "") setGroupIcon(pool, id, icon);
					return id;
				},
				renameGroup: function (poolId, id, name) {
					renameGroup(poolOf(poolId), String(id), String(name));
					return snapshot();
				},
				setEntryIcon: function (key, icon) {
					setEntryIcon(String(key), String(icon === undefined || icon === null ? "" : icon));
					return snapshot();
				},
				setGroupIcon: function (poolId, id, icon) {
					setGroupIcon(poolOf(poolId), String(id), String(icon));
					return snapshot();
				},
				removeGroup: function (poolId, id) {
					removeGroup(poolOf(poolId), String(id));
					return snapshot();
				},
				setLayout: function (poolId, layout) {
					updateConfig(function (draft) {
						var clean = sanitiseLayout(layout || []);
						if (poolOf(poolId) === "header") draft.headerLayout = clean;
						else draft.layout = clean;
					});
					return snapshot();
				},
				setAggressive: function (on) {
					updateConfig(function (draft) { draft.aggressive = on === true; });
					return snapshot();
				},
				reset: function () {
					resetConfig();
					return snapshot();
				},
				/** Health of the legacy-row adoption bridge. */
				diagnostics: function () {
					var rows = [];
					for (var key in adopted) {
						if (!Object.prototype.hasOwnProperty.call(adopted, key)) continue;
						var record = adopted[key];
						var row = document.querySelector('[data-dsm-row="panel:' + record.id + '"]');
						rows.push({
							id: record.id,
							key: key,
							label: record.label,
							elementConnected: record.el !== null && record.el.isConnected === true,
							rowRendered: row !== null,
							panelRegistered: adoptedRegistrations[record.id] !== undefined
						});
					}
					return rows;
				},
				/** Bridge internals, for "why did my entries vanish" reports. */
				bridge: function () {
					return {
						slotContext: slotCtx !== null,
						adopted: Object.keys(adopted).length,
						retryAt: adoptionRetryAt,
						repairs: adoptionRepairs
					};
				}
			};
		}

		/* --------------------------------------------------------------- apply */

		/**
		 * Mount the plugin.
		 * @param {object} ctx - client root context.
		 */
		function apply(ctx) {
			slotCtx = ctx;
			injectCss();
			config = loadConfig();
			applyRegionMin();

			if (typeof ctx.effect === "function") {
				try {
					ctx.effect(function () {
						return function () { stopObserver(); };
					}, "sidebar-manager: observer");
				} catch (error) {
					/* an older runtime without effect(): the observer still runs */
				}
			}

			if (ctx.locale && typeof ctx.locale.register === "function") {
				try {
					ctx.effect(function () {
						return ctx.locale.register(NS, { zh: zh, en: en });
					}, "sidebar-manager: dictionaries");
					t = ctx.locale.bind(NS);
				} catch (error) {
					/* keep the built-in lookup */
				}
			}

			installAgentApi();
			watchRegionResize();
			window.setTimeout(function () {
				try {
					applyAll();
				} catch (error) {
					console.warn("[dsh-sidebar-manager] apply failed", error);
				}
			}, 300);
			startObserver();

			if (ctx.slots && typeof ctx.slots.inject === "function") {
				try {
					ctx.slots.inject("settings.section", function () {
						return ctx.slots.register({
							name: "settings.section",
							id: "sidebar-manager",
							order: 26,
							label: function () { return t("nav"); },
							locale: NS
						}, function (props) {
							/* a broken render must not blank the settings pane */
							try {
								return SidebarManagerSection(props);
							} catch (error) {
								console.warn("[dsh-sidebar-manager] settings render failed", error);
								return React.createElement("div", { className: "dsm-root" }, [
									React.createElement("h2", { key: "t", className: "dsm-title" }, "Sidebar manager"),
									React.createElement("p", { key: "e", className: "dsm-hint" }, "渲染出错：" + String((error && error.message) || error))
								]);
							}
						});
					});
				} catch (error) {
					/* older shells without settings.section: the guard still applies */
				}
			}
		}

		exports.apply = apply;
		exports.inject = ["slots", "locale", "layout"];
		return module.exports;
	}
});
