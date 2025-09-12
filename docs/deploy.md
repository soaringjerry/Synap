# 一键部署（GHCR + Docker/Compose)

## 预置条件

- 已启用 GitHub Actions（Docker (GHCR) 工作流）。
- 仓库 Packages 权限允许 `GITHUB_TOKEN` 推送（默认开启）。

## 镜像命名

- 后端：`ghcr.io/<owner>/synap-backend`
  - tags：`latest`（main）、分支名、`sha-<short>`、版本 tag（如 `v1.2.3`）。

## 方式一：docker run

```
docker run -d --name synap -p 8080:8080 \
  -e SYNAP_ADDR=:8080 \
  -e SYNAP_DB_PATH=/data/synap.db \
  -v synap-data:/data \
  ghcr.io/<owner>/synap-backend:latest
```

## 方式二：docker compose

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

## 常用环境变量

- `SYNAP_ADDR`（默认 `:8080`）
- `SYNAP_DB_PATH`（默认 `./data/synap.db`，容器内建议 `/data/synap.db`）

## 注意

- 当前镜像仅包含后端。前端可在构建完成后使用独立镜像（Nginx 提供静态文件）或 Vercel/Netlify。
- 若接入 SQLite，注意挂载持久卷（如 `-v synap-data:/data`）。

