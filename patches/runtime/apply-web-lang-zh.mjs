#!/usr/bin/env node
/**
 * PATCH: web-lang-zh v1 (2026-10-12, Edge 翻译弹窗+朗读中文失效修复)
 *
 * 病灶：web/index.html 声明 <html lang="en"> → Edge 判定为英文网站：
 *   ① 每次打开都弹"是否翻译成中文"；② 朗读(Read aloud)按 lang 选英文嗓音，中文内容读不出。
 * 修法：改为 <html lang="zh-CN">。主应用不会在运行时覆盖 documentElement.lang
 *   （仅分享页 UPn() 会设，属正常），静态文件服务端按请求读盘，改完即生效无需重启。
 *
 * 回滚：cp web/index.html.bak-lang-zh-20261012 web/index.html
 * 幂等：重复执行安全；锚点缺失(上游改了写法)时报错退出，须人工核对。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "web", "index.html");

let source = readFileSync(target, "utf8");

if (source.includes('<html lang="zh-CN">')) {
  console.log("[web-lang-zh] 已是 zh-CN，幂等跳过");
  process.exit(0);
}
if (!source.includes('<html lang="en">')) {
  console.error('[web-lang-zh] 找不到 <html lang="en"> 锚点，上游可能改了写法，请人工核对 web/index.html。');
  process.exit(1);
}
source = source.replace('<html lang="en">', '<html lang="zh-CN">');
writeFileSync(target, source);
console.log("[web-lang-zh] 补丁已写入:", target);
