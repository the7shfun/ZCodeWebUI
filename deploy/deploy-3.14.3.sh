#!/bin/bash
# ZCode v3.14.3 部署脚本(09-28)
# 用法: deploy-3.14.3.sh          # 正常部署(dist/zcode/zcode → zcode-runtime)
#       deploy-3.14.3.sh rollback # 回滚到 zcode-runtime.bak-3.14.0-0928
set -euo pipefail
RUNTIME=/vol2/1000/Walker/_代码库/_Github/zcode-runtime
BAK=/vol2/1000/Walker/_代码库/_Github/zcode-runtime.bak-3.14.0-0928
SRC=/vol2/1000/Walker/_代码库/_Github/ZCode/dist/zcode/zcode
TOKEN="${ZCODE_WEB_TOKEN:?环境变量提供访问令牌,勿入库}"

if [ "${1:-}" = "rollback" ]; then
  echo "[rollback] 停服务 → 换回 3.14.0 备份"
  systemctl --user stop zcode-web.service
  rm -rf "$RUNTIME"
  cp -a "$BAK" "$RUNTIME"
  systemctl --user start zcode-web.service
else
  echo "[deploy] 校验新包"
  test -f "$SRC/server/entry-http.js" || { echo "缺 server/entry-http.js"; exit 1; }
  test -f "$SRC/bin/zcode.mjs" || { echo "缺 bin/zcode.mjs"; exit 1; }
  grep -q '"version": "3.14.3"' "$SRC/package.json" || { echo "版本不是 3.14.3"; grep -o '"version": "[^"]*"' "$SRC/package.json"; exit 1; }
  echo "[deploy] 停服务 → 替换 runtime → 起服务"
  systemctl --user stop zcode-web.service
  rm -rf "$RUNTIME"
  cp -a "$SRC" "$RUNTIME"
  systemctl --user start zcode-web.service
fi

sleep 3
systemctl --user is-active zcode-web.service
echo "[check] 首页探测"
curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://127.0.0.1:8213/?token=$TOKEN"
journalctl _SYSTEMD_USER_UNIT=zcode-web.service -n 5 --no-pager | tail -5
