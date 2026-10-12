#!/usr/bin/env node
// taskindex-reconcile v1 补丁重打工具
// 用途: zcode-runtime 升级覆盖 server/entry-http.js 后, 重新注入本补丁
// 用法: node patches/apply-taskindex-reconcile.mjs   (幂等, 已打过则跳过)
// 背景: 官方 task-index 同步器纯事件驱动且失败不重试, 交互会话可能从侧栏索引
//       永久缺席(实录 2026-10-07 sess_3b8b42a5)。补丁在 createZCodeTaskIndexSyncer
//       闭包内加 10s 周期对账, 缺行走官方 resyncTaskIndexRowFromAgent 原路径补行。
// 验收: 重启后删一行索引, 10s 内应自己长回来; 日志可见 patch-reconcile 字样。

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "server", "entry-http.js");
const MARKER = "PATCH: taskindex-reconcile";

const src = readFileSync(target, "utf8");
if (src.includes(MARKER)) {
  console.log("patch already applied, nothing to do");
  process.exit(0);
}

const ANCHOR1 = "return {\n    ensureWorkspaceSubscription,";
const ANCHOR2 = "onSessionReadyEvent: readyEventEmitter.event,\n    disposeAll() {\n      disposed = true;";
if (src.split(ANCHOR1).length !== 2 || src.split(ANCHOR2).length !== 2) {
  console.error("anchor mismatch (bundle 结构变了, 需人工核对注入点)");
  process.exit(1);
}

const block = `// --- PATCH: taskindex-reconcile v1 (2026-10-07, 会话列表缺行自愈) ---
  // 官方行写入是纯事件驱动(became-visible / 标题变更 / 终态),事件链丢失且失败
  // 不重试时,交互会话会从 tasks-index 永久缺席(实录 2026-10-07 sess_3b8b42a5)。
  // 这里补一层 10s 周期对账:正库有、索引无 → 走官方 resyncTaskIndexRowFromAgent
  // 原路径补行,数据格式与事件写入完全一致。重打补丁: patches/apply-taskindex-reconcile.mjs
  const reconcileMissingTaskRows = async () => {
    if (disposed) return;
    for (const state of workspaceIngests.values()) {
      try {
        const sessions = await agentService.listSessions({
          ...state.target,
          runtimePolicy: "existing-only",
          includeArchived: true,
          limit: 500
        });
        const known = new Set(
          (await taskIndexRepo.listTaskMetas({ ...state.target, provider: GLM_PROVIDER })).map((row) => row.taskId)
        );
        for (const session of sessions) {
          if (!session || session.sessionKind === "subagent_child") continue;
          if (known.has(session.sessionId)) continue;
          if (session.workspace && resolveWorkspaceKey(session.workspace) !== resolveWorkspaceKey(state.target)) continue;
          await resyncTaskIndexRowFromAgent(sessionTargetFrom(state.target, session.sessionId), "patch-reconcile");
        }
      } catch (error) {
        logger11.warn(void 0, \`task index patch-reconcile failed workspace=\${state.target.workspacePath}\`, error);
      }
    }
  };
  const reconcileTimer = setInterval(() => {
    void reconcileMissingTaskRows();
  }, 10000);
  reconcileTimer.unref?.();
  // --- END PATCH: taskindex-reconcile ---
  `;

copyFileSync(target, target + ".bak-taskindex-reconcile");
const out = src
  .replace(ANCHOR1, block + ANCHOR1)
  .replace(
    ANCHOR2,
    "onSessionReadyEvent: readyEventEmitter.event,\n    disposeAll() {\n      disposed = true;\n      if (reconcileTimer) clearInterval(reconcileTimer);"
  );
writeFileSync(target, out, "utf8");
console.log("patched:", target, "(backup: .bak-taskindex-reconcile)");
console.log("next: systemctl --user restart zcode-web");
