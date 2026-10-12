#!/usr/bin/env node
/**
 * PATCH: followupmode-nonactivity v1 (2026-10-12, 侧栏「点开会话即置顶显示"刚刚"」根治)
 *
 * 病灶：zcode.cjs 的 isNonActivitySessionEvent 豁免清单漏了 FollowupModeChanged。
 * 链路：UI 打开会话时 SessionPane 自动补发 setFollowupMode(guide)（快照模式≠应用设置时）
 *   → runtime 追加 FollowupModeChanged 控制事件（纯内存不落库）
 *   → onSessionEvent 判定不在豁免清单 → record.updatedAt = Date.now()
 *   → sessions-index lastActivityAt=now 推送 → 前端侧栏按 updatedAt 重排+显示"刚刚"。
 *   全程零 DB 写入（实测 db.sqlite session/message/session_entry 均不动），重启回落。
 *
 * 修法：豁免清单追加 FollowupModeChanged（与 ModelSelected/SessionModeChanged 等
 *   纯配置事件同待遇）。一行语义改动。
 *
 * 生效条件：对新 spawn 的 agent 子进程立即生效（子进程由
 *   ZCODE_AGENT_SERVER_ARGS_JSON 直接指向本文件）；存量进程需服务重启
 *   （zcode-web-maintenance.timer 每晚 04:30 会自动重启）。
 *
 * 回滚：cp ../agent/zcode.cjs.bak-followupmode-nonactivity-20261012 ../agent/zcode.cjs
 *   然后 systemctl --user restart zcode-web
 *
 * 幂等：重复执行安全；锚点漂移（上游升级覆盖）时拒绝执行并报错，须人工重定位。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "agent", "zcode.cjs");

const ANCHOR = "event.type === SessionEventType.HookRunBlocked;";
const INJECT = " || event.type === SessionEventType.FollowupModeChanged";
const PATCHED_MARK = "event.type === SessionEventType.HookRunBlocked" + INJECT + ";";

let source = readFileSync(target, "utf8");

if (source.includes("function isNonActivitySessionEvent(event) {" + "\n" + "  return event.type === SessionEventType.ModelSelected" + INJECT)) {
  // 兜底：不应出现（锚点在函数尾部），保守判定
  console.log("[followupmode-nonactivity] 已是补丁形态(头部)，跳过");
  process.exit(0);
}
if (source.includes(PATCHED_MARK)) {
  console.log("[followupmode-nonactivity] 补丁已存在，幂等跳过");
  process.exit(0);
}
const anchorCount = source.split(ANCHOR).length - 1;
if (anchorCount !== 1) {
  console.error(`[followupmode-nonactivity] 锚点出现 ${anchorCount} 次(期望 1)，上游可能已变更，拒绝执行。请人工核对 isNonActivitySessionEvent。`);
  process.exit(1);
}
source = source.replace(ANCHOR, PATCHED_MARK);
writeFileSync(target, source);
console.log("[followupmode-nonactivity] 补丁已写入:", target);
console.log("[followupmode-nonactivity] 验证: node --check + grep FollowupModeChanged isNonActivitySessionEvent 附近");
