# syntax=docker/dockerfile:1
# ZCode Web 版部署镜像：构建发行包（TUI/后端/Web），运行时只跑 node。
# 用法见同目录 docker-compose.yml。

FROM node:24-bookworm AS build
# 跳过桌面端/测试相关的大体积二进制下载（electron/playwright 等），web 模式用不到
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PUPPETEER_SKIP_DOWNLOAD=1
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /src
COPY . .
# 国内网络走 npmmirror；失败可去掉 --registry 回源
RUN pnpm install --frozen-lockfile --registry=https://registry.npmmirror.com
# CLI（含其 workspace 依赖）→ 其余 packages/*（跳过 desktop）
RUN pnpm --filter @zcode/cli... build \
 && pnpm -r --filter "./packages/*" --filter "!@zcode/desktop" build
# 上游坑：TUI 运行时闭包(tui→contracts→shared→model-option-map)要求 @zcode/shared 有 dist，
# 但 packages/shared 没有 build 脚本且仓库不带 CI 配置，从零构建必缺——这里补编译。
# --skip-build 复用上面两层已构建好的 cli/server/web 产物。
RUN pnpm --filter @zcode/shared exec tsc -p tsconfig.json \
 && pnpm build:zcode --skip-build --base-url https://downloads.example.com/zcode/ \
 && mkdir -p /out \
 && tar -xzf dist/zcode/releases/*/zcode-*.tar.gz -C /out

FROM node:24-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ripgrep ca-certificates curl procps \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/zcode /app/zcode
RUN mkdir -p /data /workspace && chmod 777 /data /workspace
ENV HOME=/data/home \
    ZCODE_DATA_BASE_DIR=/data
WORKDIR /workspace
EXPOSE 3030
# 无 --token 时：0.0.0.0 监听会自动生成令牌并打印在日志里
CMD ["node", "/app/zcode/bin/zcode.mjs", "--web", "--host", "0.0.0.0", "--port", "3030", "--workspace", "/workspace", "--no-open"]
