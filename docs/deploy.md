# 一键部署（GHCR + Docker/Compose)

## 预置条件

- 已启用 GitHub Actions（Docker (GHCR) 工作流）。
- 仓库 Packages 权限允许 `GITHUB_TOKEN` 推送（默认开启）。

## 镜像命名

- 后端（仅 API）：`ghcr.io/soaringjerry/synap-backend`
  - 适合只需要后端 API 的部署，或配合外部前端。
- Web（Next.js App Router）：`ghcr.io/soaringjerry/synap-web`
  - 独立的 Next.js 应用容器，默认端口 3000，内置严格 no-store 安全头和 CSP。
- 一体化（旧，前后端）：`ghcr.io/soaringjerry/synap`
  - 包含后端二进制 + 旧的静态前端（legacy）。
- 开发版（旧，一体化 Dev）：`ghcr.io/soaringjerry/synap-dev`
  - 容器内同时跑后端热重载与旧前端的 Vite Dev Server，便于开发联调。
  - tags：`latest`（main）、分支名、`sha-<short>`、版本 tag（如 `v1.2.3`）。

## 方式一：docker run（后端）

```
docker run -d --name synap -p 8080:8080 \
  -e SYNAP_ADDR=:8080 \
  -e SYNAP_DB_PATH=/data/synap.db \
  -v synap-data:/data \
  ghcr.io/soaringjerry/synap-backend:latest
```

## 方式二：docker run（一体化）

```
docker run -d --name synap -p 8080:8080 \
  -e SYNAP_ADDR=:8080 \
  ghcr.io/soaringjerry/synap:latest
```

## 方式三：docker compose（后端 + Web）

1) 配置 `.env`

```
cp .env.example .env
# 编辑 .env，将 GHCR_OWNER 改为你的 GitHub 用户名或组织（小写）
```

2) 启动服务（建议使用一键脚本生成完整 Caddy 反代栈；若手动 compose，需添加 Web 服务并在边缘将 `/api` 指到后端，其它流量指到 Web）

```
docker compose up -d
```

3) 访问

- 后端健康检查：`http://localhost:8080/health`
- Web：`http://localhost:3000/`（使用一键 Caddy 则通过域名访问）

## 常用环境变量

- `SYNAP_ADDR`（默认 `:8080`）
- `SYNAP_DB_PATH`（默认 `./data/synap.db`，容器内建议 `/data/synap.db`）
- `SYNAP_STATIC_DIR`（一体化镜像用于前端静态资源，默认 `/public`）

## 使用自有 Nginx（双层反代或仅 Nginx）

- 一键脚本支持禁用 Caddy 并自定义端口：

```
curl -fsSL https://raw.githubusercontent.com/soaringjerry/Synap/main/scripts/quick-deploy.sh \
  | sudo bash -s -- --channel latest --edge none --port 9000 --web-port 3001 --dir /opt/synap
```

- 生成的 compose 会绑定 `127.0.0.1:9000 -> synap:8080`，你可以在 Nginx 中反代到 `http://127.0.0.1:9000`。

示例 Nginx 片段（HTTP）：（/api → 后端，其它 → Web）

```
server {
    listen 80;
    server_name your.domain.com;
    location /api/ {
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_pass http://127.0.0.1:9000;
    }

    location / {
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_pass http://127.0.0.1:3001;
    }
}
```

## 运维操作（手动更新/回滚/重启）

以下命令默认目录为 `--dir`（例如 `/opt/synap`）：

### 查看与日志
- 查看服务状态：`docker compose ps`
- 查看后端日志：`docker compose logs -f synap`
- 查看 Watchtower 日志：`docker compose logs -f watchtower`

### 立即执行一次镜像更新（不等轮询）
- `docker compose exec watchtower watchtower --run-once`

### 手动更新到最新标签
- 更新并重启后端：`docker compose pull synap && docker compose up -d synap`
- 强制重建容器：`docker compose up -d --force-recreate --no-deps synap`

### 手动回滚
1) 编辑 `.env`，将 `SYNAP_TAG` 改为上一个版本（例如 `latest` → 指定 `vX.Y.Z` 或指定 `@sha256:...`）。
2) 执行：`docker compose pull synap && docker compose up -d synap`

小贴士：用 `docker image ls ghcr.io/soaringjerry/synap*` 查看已缓存的本地标签；或 `docker inspect ghcr.io/soaringjerry/synap:latest --format '{{json .RepoDigests}}'` 获取 digest。

### 暂停/恢复自动更新
- 暂停 Watchtower：`docker compose stop watchtower`
- 恢复 Watchtower：`docker compose up -d watchtower`

### 重启/停止/删除服务
- 重启后端：`docker compose restart synap`
- 停止后端：`docker compose stop synap`
- 杀进程（SIGKILL）：`docker compose kill synap`
- 删除容器：`docker compose rm -f synap`（随后用 `up -d` 重新创建）

### 全栈操作
- 全栈重启：`docker compose down && docker compose up -d`
- 仅重启 Caddy（如你在 Caddy 模式下改了域名/证书邮箱）：`docker compose restart caddy`

### 健康检查与验证
- 健康检查：`curl http://127.0.0.1:<后端端口>/health`
- Caddy 模式下用域名访问：`curl -I https://<你的域名>/health`

### 清理旧镜像
- `docker image prune -f`（仅清理悬挂层）
- 更彻底：`docker system prune -f`（请谨慎）

## 注意

- 当前镜像仅包含后端。前端可在构建完成后使用独立镜像（Nginx 提供静态文件）或 Vercel/Netlify。
- 若接入 SQLite，注意挂载持久卷（如 `-v synap-data:/data`）。
- 开发版镜像会开放 8080（后端）与 3000（前端 Dev Server）两个端口。
