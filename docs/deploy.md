# 一键部署（GHCR + Docker/Compose)

## 预置条件

- 已启用 GitHub Actions（Docker (GHCR) 工作流）。
- 仓库 Packages 权限允许 `GITHUB_TOKEN` 推送（默认开启）。

## 镜像命名

- 后端（仅 API）：`ghcr.io/<owner>/synap-backend`
  - 适合只需要后端 API 的部署，或配合外部前端。
- 一体化（前后端）：`ghcr.io/<owner>/synap`
  - 包含后端二进制 + 前端静态资源（如存在 `frontend` 并已构建）。
- 开发版（一体化 Dev）：`ghcr.io/<owner>/synap-dev`
  - 容器内同时跑后端热重载（air）与前端 Vite Dev Server，便于开发联调。
  - tags：`latest`（main）、分支名、`sha-<short>`、版本 tag（如 `v1.2.3`）。

## 方式一：docker run（后端）

```
docker run -d --name synap -p 8080:8080 \
  -e SYNAP_ADDR=:8080 \
  -e SYNAP_DB_PATH=/data/synap.db \
  -v synap-data:/data \
ghcr.io/<owner>/synap-backend:latest
```

## 方式二：docker run（一体化）

```
docker run -d --name synap -p 8080:8080 \
  -e SYNAP_ADDR=:8080 \
  ghcr.io/<owner>/synap:latest
```

## 方式三：docker compose

1) 配置 `.env`

```
cp .env.example .env
# 编辑 .env，将 GHCR_OWNER 改为你的 GitHub 用户名或组织（小写）
```

2) 启动服务

```
docker compose up -d
```

3) 访问

- 健康检查：`http://localhost:8080/health`
- 语言切换：`http://localhost:8080/health?lang=zh`
- 一体化页面（若构建了前端）：`http://localhost:8080/`

## 常用环境变量

- `SYNAP_ADDR`（默认 `:8080`）
- `SYNAP_DB_PATH`（默认 `./data/synap.db`，容器内建议 `/data/synap.db`）
- `SYNAP_STATIC_DIR`（一体化镜像用于前端静态资源，默认 `/public`）

## 注意

- 当前镜像仅包含后端。前端可在构建完成后使用独立镜像（Nginx 提供静态文件）或 Vercel/Netlify。
- 若接入 SQLite，注意挂载持久卷（如 `-v synap-data:/data`）。
- 开发版镜像会开放 8080（后端）与 3000（前端 Dev Server）两个端口。
