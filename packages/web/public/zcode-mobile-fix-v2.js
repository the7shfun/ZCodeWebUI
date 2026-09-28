/*
 * ZCode 移动端适配补丁 v2 (mobile-fix.js)
 * 与 zcode-mobile-fix-v4.css 配套：视口 ≤900px 时会话列表=全屏抽屉。
 * - 初始加载自动停在会话列表（手机端）
 * - 会话态：顶部「‹ 会话列表」栏(#zf-mobile-back2) 开列表
 * - 列表态：抽屉顶栏「‹ 返回」(#zf-mobile-back) 回会话
 * - 点任务行 / 新会话按钮自动回到会话
 * - 接管浏览器历史：系统返回手势=关列表，不会误退出页面
 * v2 变更：废除悬浮 ☰（会压在正文/行按钮上），改常驻顶部返回栏。
 * 验证标记: <html data-zf-mobile="2"> + console "[zf-mobile]"
 */
(() => {
  "use strict";

  const MQ = window.matchMedia("(max-width: 900px)");
  const SIDEBAR_SEL = '[data-workspace-sidebar-panel="true"]';
  const CLOSE_ON_CLICK_SEL = '[data-testid^="task-item-"], [data-testid="task-new-button"]';

  const html = document.documentElement;
  html.setAttribute("data-zf-mobile", "2");
  console.info("[zf-mobile] v2 active");

  let open = false;
  let histDepth = 0; // 为抽屉推了几层历史

  const sidebar = () => document.querySelector(SIDEBAR_SEL);

  function pushHist() {
    histDepth += 1;
    try {
      history.pushState({ zfDrawer: histDepth }, "");
    } catch {}
  }

  function backHist() {
    if (histDepth > 0) {
      histDepth -= 1;
      try {
        history.back();
      } catch {}
    }
  }

  function setOpen(next, { viaHist = false } = {}) {
    if (next === open) return;
    open = next;
    html.classList.toggle("zf-drawer-open", open);
    if (open && !viaHist) pushHist();
    if (!open && !viaHist) backHist();
    if (open) ensureSidebarMounted();
  }

  window.addEventListener("popstate", () => {
    if (histDepth > 0) histDepth -= 1;
    if (open) {
      open = false;
      html.classList.remove("zf-drawer-open");
    }
  });

  // app 侧栏可能被「会话区过窄自动收起」隐藏（仅窗口 resize 触发，手机上罕见）：
  // 打开抽屉时若面板不在或不可见，点折叠轨上的展开按钮把它拉回来。
  let railRetryTimer = null;
  function ensureSidebarMounted() {
    if (railRetryTimer) window.clearTimeout(railRetryTimer);
    railRetryTimer = window.setTimeout(() => {
      railRetryTimer = null;
      if (!open) return;
      const panel = sidebar();
      if (panel && !panel.classList.contains("opacity-0")) return;
      const icon = document.querySelector("svg.lucide-panel-left-open");
      const railBtn = icon ? icon.closest("button") : null;
      if (railBtn) railBtn.click();
    }, 120);
  }

  document.addEventListener(
    "click",
    (e) => {
      if (!open) return;
      const t = e.target;
      if (t && t.closest && t.closest(CLOSE_ON_CLICK_SEL)) setOpen(false);
    },
    true,
  );

  function buildChrome() {
    if (!document.getElementById("zf-mobile-chatbar")) {
      const bar = document.createElement("div");
      bar.id = "zf-mobile-chatbar";
      const back = document.createElement("button");
      back.id = "zf-mobile-back2";
      back.type = "button";
      back.textContent = "‹ 会话列表";
      back.addEventListener("click", () => setOpen(true));
      bar.append(back);
      document.body.appendChild(bar);
    }
    if (!document.getElementById("zf-mobile-drawer-bar")) {
      const bar = document.createElement("div");
      bar.id = "zf-mobile-drawer-bar";
      const back = document.createElement("button");
      back.id = "zf-mobile-back";
      back.type = "button";
      back.textContent = "‹ 返回";
      back.addEventListener("click", () => setOpen(false));
      const label = document.createElement("span");
      label.textContent = "会话列表";
      bar.append(back, label);
      document.body.appendChild(bar);
    }
  }

  // 初始加载：手机视口直接停在会话列表
  let autoOpened = false;
  function tryAutoOpen(attempt) {
    if (autoOpened || open || !MQ.matches) return;
    if (sidebar()) {
      autoOpened = true;
      setOpen(true);
    } else if (attempt < 40) {
      window.setTimeout(() => tryAutoOpen(attempt + 1), 400);
    }
  }

  function boot() {
    buildChrome();
    tryAutoOpen(0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
