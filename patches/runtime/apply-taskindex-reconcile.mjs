#!/usr/bin/env node
// taskindex-reconcile v2 补丁重打工具
// 用法: node patches/apply-taskindex-reconcile.mjs   (幂等)
// 三种情况: 已是 v2 → 跳过; 是 v1 → 原地升级; 干净 bundle → 全新注入
// 背景: 官方 task-index 同步器纯事件驱动且失败不重试, 交互会话可能从侧栏索引
//       永久缺席(实录 2026-10-07 sess_3b8b42a5)。v2 = 10s 周期对账 + 文件心跳
//       (patches/reconcile-heartbeat.log, host 侧 console 被黑洞化故走文件)。
// 验收: 删任一索引行, 10s 内自动补回; heartbeat.log 每约 5 分钟一条 tick。

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "server", "entry-http.js");
const V2_TAG = "reconcile-heartbeat";
const V1_TAG = "PATCH: taskindex-reconcile v1";
const V1_END = "  // --- END PATCH: taskindex-reconcile ---";
const ANCHOR1 = "return {\n    ensureWorkspaceSubscription,";
const ANCHOR2 = "onSessionReadyEvent: readyEventEmitter.event,\n    disposeAll() {\n      disposed = true;";
const CLEAR_LINE = "\n      if (reconcileTimer) clearInterval(reconcileTimer);";

const BLOCK = [
"  // --- PATCH: taskindex-reconcile v2 (2026-10-13, 会话列表缺行自愈+文件心跳) ---",
"  // v1(10-07)注入后现场删索引行未补回且零日志——host 侧 console 被启动器黑洞化,",
"  // 无法区分空转/失败/未启动。v2 变化:①文件心跳(动态 import node:fs,绕开 ESM 作用域",
"  // 与日志黑洞),每 30 轮(约5min)或有缺失时写 patches/reconcile-heartbeat.log;",
"  // ②workspaceIngests 为空时回退 ZCODE_SERVER_WORKSPACE 单 workspace 对账。",
"  // 对账逻辑不变:正库有、索引无 → 官方 resyncTaskIndexRowFromAgent 原路径补行。",
"  // 重打补丁: patches/apply-taskindex-reconcile.mjs",
"  let reconcileTicks = 0;",
"  const reconcileLog = async (line) => {",
"    try {",
"      const fs = await import(\"node:fs\");",
"      fs.appendFileSync(",
"        \"/vol2/1000/Walker/_代码库/_Github/zcode-runtime/patches/reconcile-heartbeat.log\",",
"        `${new Date().toISOString()} ${line}\\n`",
"      );",
"    } catch {}",
"  };",
"  const reconcileMissingTaskRows = async () => {",
"    if (disposed) return;",
"    const states = [...workspaceIngests.values()];",
"    if (states.length === 0 && process.env.ZCODE_SERVER_WORKSPACE) {",
"      states.push({ target: { workspacePath: process.env.ZCODE_SERVER_WORKSPACE, workspaceIdentity: void 0 } });",
"    }",
"    reconcileTicks += 1;",
"    for (const state of states) {",
"      try {",
"        const sessions = await agentService.listSessions({",
"          ...state.target,",
"          runtimePolicy: \"existing-only\",",
"          includeArchived: true,",
"          limit: 500",
"        });",
"        const known = new Set(",
"          (await taskIndexRepo.listTaskMetas({ ...state.target, provider: GLM_PROVIDER })).map((row) => row.taskId)",
"        );",
"        const missing = [];",
"        for (const session of sessions) {",
"          if (!session || session.sessionKind === \"subagent_child\") continue;",
"          if (known.has(session.sessionId)) continue;",
"          if (session.workspace && resolveWorkspaceKey(session.workspace) !== resolveWorkspaceKey(state.target)) continue;",
"          missing.push(session.sessionId);",
"        }",
"        if (missing.length > 0 || reconcileTicks % 30 === 1) {",
"          void reconcileLog(`tick=${reconcileTicks} ingests=${workspaceIngests.size} sessions=${sessions.length} known=${known.size} missing=[${missing.join(\",\")}] ws=${state.target.workspacePath}`);",
"        }",
"        for (const sessionId of missing) {",
"          await resyncTaskIndexRowFromAgent(sessionTargetFrom(state.target, sessionId), \"patch-reconcile\");",
"        }",
"      } catch (error) {",
"        void reconcileLog(`tick=${reconcileTicks} ERROR ws=${state.target.workspacePath} err=${error?.message ?? error}`);",
"        logger11.warn(void 0, `task index patch-reconcile failed workspace=${state.target.workspacePath}`, error);",
"      }",
"    }",
"  };",
"  const reconcileTimer = setInterval(() => {",
"    void reconcileMissingTaskRows();",
"  }, 10000);",
"  reconcileTimer.unref?.();",
"  // --- END PATCH: taskindex-reconcile ---",
""
].join("\n");

let src = readFileSync(target, "utf8");

if (src.includes(V2_TAG)) {
  console.log("patch v2 already applied, nothing to do");
  process.exit(0);
}

copyFileSync(target, target + ".bak-taskindex-reconcile");

if (src.includes(V1_TAG)) {
  const s = src.indexOf("  // --- PATCH: taskindex-reconcile v1");
  const e = src.indexOf(V1_END);
  if (s < 0 || e < s) {
    console.error("v1 block boundaries not found; manual review needed");
    process.exit(1);
  }
  src = src.slice(0, s) + BLOCK + src.slice(e + V1_END.length);
  writeFileSync(target, src, "utf8");
  console.log("upgraded v1 -> v2:", target, "(backup: .bak-taskindex-reconcile)");
} else {
  if (src.split(ANCHOR1).length !== 2 || src.split(ANCHOR2).length !== 2) {
    console.error("anchor mismatch (bundle 结构变了, 需人工核对注入点)");
    process.exit(1);
  }
  src = src
    .replace(ANCHOR1, BLOCK + ANCHOR1)
    .replace(ANCHOR2, ANCHOR2 + CLEAR_LINE);
  writeFileSync(target, src, "utf8");
  console.log("patched (fresh v2):", target, "(backup: .bak-taskindex-reconcile)");
}
console.log("next: cp server/entry-http.js /tmp/e.mjs && node --check /tmp/e.mjs && systemctl --user restart zcode-web");
