# runtime 补丁(zcode-runtime 部署目录)

部署的 runtime 目录(`/vol2/1000/Walker/_代码库/_Github/zcode-runtime`)不是 git 仓库,
官方 bundle 的本地补丁以"锚点注入脚本"形式留档在此。**升级覆盖后按需逐个重跑**
(脚本均幂等,已打过则跳过;官方 bundle 结构变了会因锚点失配拒绝执行,需人工核对):

```bash
cd /vol2/1000/Walker/_代码库/_Github/zcode-runtime
node patches/apply-web-lang-zh.mjs              # 目标 web/index.html,改完即生效
node patches/apply-followupmode-nonactivity.mjs # 目标 agent/zcode.cjs,新 agent 立即生效
node patches/apply-taskindex-reconcile.mjs      # 目标 server/entry-http.js,需重启 zcode-web
# entry-http.js 语法校验(ESM, 须拷成 .mjs 再查)
cp server/entry-http.js /tmp/e.mjs && node --check /tmp/e.mjs
systemctl --user restart zcode-web
```

每晚 04:30 由 zcode-web-maintenance.timer 自动重启 runtime(存量进程自然吃到补丁)。

## apply-web-lang-zh.mjs → web/index.html

- 故障: Edge 翻译弹窗骚扰、浏览器朗读中文失效——页面 lang 属性不对。
- 改法: web/index.html 的 lang 置为 zh-CN。

## apply-followupmode-nonactivity.mjs → agent/zcode.cjs

- 故障: web 侧栏点开一个会话,该会话立刻以"刚刚"置顶——UI 自动补发
  setFollowupMode,FollowupModeChanged 事件不在 isNonActivitySessionEvent 豁免清单,
  被当作活动把内存 updatedAt 刷成 now,触发 sessions-index 推送。零 DB 写入,重启回落。
- 改法: 豁免清单追加 FollowupModeChanged,一行语义改动。

## apply-taskindex-reconcile.mjs → server/entry-http.js

- 故障: 会话从侧栏永久消失(正文库完好)。根因: 官方 zcodeTaskIndexSyncer 补写索引
  行是纯事件驱动(became-visible/标题变更/终态)且失败只 warn 不重试;"首句即标题+
  中途派子代理挂起+用户切走"的会话零事件兜底命中,tasks-index.sqlite 缺行。
  (实录 2026-10-07 sess_3b8b42a5)
- 改法: 在 createZCodeTaskIndexSyncer 闭包内注入 10s 周期对账
  (agentService.listSessions vs taskIndexRepo.listTaskMetas 差集),缺行走官方
  resyncTaskIndexRowFromAgent 原路径补行;disposeAll 里 clearInterval。
- 验收: 删任一索引行,10s 内应自动补回。
- ⚠ 注入坑: 函数定义必须放 return 导出对象**之外**的闭包语句区,
  const 语句插进对象字面量会 SyntaxError。
