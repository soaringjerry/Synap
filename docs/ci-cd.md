# 七、CI/CD 流程设计

## 1. 基础目标

* 快速反馈：每次提交/PR 在 5 分钟内给出构建与测试结果。
* 质量守门：强制通过 lint、类型检查、单测、合规检查。
* 预览环境：每个 PR 自动部署前端+后端，方便验收与测试（后续接入）。
* 安全合规：自动扫描敏感信息、依赖漏洞、隐私文档修改。

## 2. 流程阶段

### 阶段一：代码提交（Commit & PR）

* 检查 Commit Message 是否符合 Conventional Commits 规范（commitlint）。
* 自动跑 pre-commit：基础检查（换行、空白）、golangci-lint。

### 阶段二：CI 快检

* Lint：`golangci-lint run ./...`（Go 1.23+），`eslint .`（Frontend，若存在）。
* 类型检查：`go vet ./...`、`tsc --noEmit`（若存在）。
* 单元测试：`go test ./... -cover`；前端 `npm test -- --coverage`（若存在）。
* 安全扫描：
  * Secret 扫描：`gitleaks`。
  * 依赖漏洞：`govulncheck`（Go）、`npm audit`（前端）。
* API 契约检查（预留）：OpenAPI 变更引入后开启契约对比。

### 阶段三：构建与预览

* 构建产物：Go 编译为单文件二进制；前端 Vite 构建（若存在）。
* 预览环境：
  * 前端：Vercel/Netlify（后续接入）。
  * 后端：Fly.io/Render（后续接入）。
* 冒烟测试：启动后端进程，`/health` 端点 HTTP 检查。

### 阶段四：合并与发布

* 合并策略：Squash & Merge（建议在分支保护中启用）。
* 自动版本号与 Changelog：Semantic Release（release workflow）。
* 发布包：后端 Go 二进制作为 Release 资产上传（多平台）。

### 阶段五：监控与回滚

* 可观测性（后续）：接入日志与请求指标。
* 回滚：基于上一个 Release 或 Feature Flag。

## 3. GitHub Actions Workflows

已添加以下工作流与配置：

* `.github/workflows/ci.yml` — 主 CI：commitlint、pre-commit、Go/前端的 lint/类型检查/测试、安全扫描（Go 1.23+ govulncheck）、构建、冒烟测试；前端步骤在不存在 `frontend/package.json` 时自动跳过。
* `.github/workflows/compliance.yml` — 合规守门：隐私文档、LICENSE、导出代码、OpenAPI 修改时强制需要对应标签（`compliance-approved`、`license-approved`、`export-reviewed`、`api-approved`）。
* `.github/workflows/release.yml` — 发布：发布事件触发，多平台构建并上传二进制。
* `.github/workflows/versioning.yml` — 版本号与 Release（手动）：仅在手动触发（workflow_dispatch）时运行 `semantic-release` 进行版本计算与发布。不再在 `push` 到 `main` 时自动发布。
* `.github/workflows/docker.yml` — GHCR 镜像构建与发布：
  - `ghcr.io/soaringjerry/synap-backend`（后端仅 API）
  - `ghcr.io/soaringjerry/synap`（一体化：前端静态 + 后端）
  - `ghcr.io/soaringjerry/synap-dev`（一体化开发镜像：前后端同容器）
  - 平台：`linux/amd64`（暂不构建 arm64）
* `.github/CODEOWNERS` — 对隐私、许可证、导出、API 契约等敏感路径设置代码所有者，配合分支保护强制评审。
* `.golangci.yml` — Go 静态检查配置。
* `.commitlintrc.json` — Conventional Commits 规范配置。
* `.pre-commit-config.yaml` — 基础 pre-commit 钩子与 golangci-lint。

## 4. 分支保护与必需检查（需要在仓库设置中开启）

建议在 `main` 分支启用：

* Require a pull request before merging（需要 PR 审核）。
* Require status checks to pass before merging（勾选：CI/CD、Compliance Gates）。
* Require conversation resolution before merging。
* Require CODEOWNERS review（对敏感路径生效）。

## 5. 发布流程（手动）

1. 在 GitHub 的 Actions 中手动运行 “Versioning (manual)” 工作流（可选择 Dry run 预检 / 是否清理冲突标签）。
2. 或者直接在 GitHub Releases 页面创建一个 `vX.Y.Z` 的 Release（推荐发布说明）。
   - 创建带有 `vX.Y.Z` tag 的 Release 会触发：
     - `.github/workflows/docker.yml`（tags 触发）构建并推送镜像
     - `.github/workflows/release.yml`（release: published）构建多平台二进制并上传

> 注：默认分支 `main` 的 push 不会再自动发布版本或创建 tag，避免“自动发垃圾版”。

## 6. Secrets（按需）

预留以下 Secrets 以支持后续预览与部署（当前工作流不会强制使用）：

* `VERCEL_TOKEN` / `NETLIFY_AUTH_TOKEN` — 前端预览部署。
* `FLY_API_TOKEN` / `RENDER_API_KEY` — 后端预览部署。
* GHCR 推送使用内置 `GITHUB_TOKEN`，无需额外配置（需确保 workflow 拥有 `packages: write` 权限）。

## 6. 容器镜像（GHCR）与一键部署

镜像命名：`ghcr.io/<owner>/synap-backend`。

拉取与运行：

```bash
docker run -d --name synap -p 8080:8080 \
  -e SYNAP_ADDR=:8080 \
  -e SYNAP_DB_PATH=/data/synap.db \
  -v synap-data:/data \
  ghcr.io/<owner>/synap-backend:latest
```

或使用 Compose（`compose.yaml` + `.env`）：

```bash
cp .env.example .env  # 修改 GHCR_OWNER 为你的组织/账号
docker compose up -d
```

## 6. 示例（节选）

主 CI workflow 的关键步骤如下（完整见 `.github/workflows/ci.yml`）：

```yaml
jobs:
  lint-test:
    steps:
      - uses: actions/setup-go@v5
        with: { go-version: 1.22 }
      - run: go vet ./...
      - run: go test ./... -cover
      - uses: golangci/golangci-lint-action@v6
      - uses: actions/setup-node@v4
        if: ${{ hashFiles('frontend/package.json') != '' }}
      - run: npm ci --prefix frontend
        if: ${{ hashFiles('frontend/package.json') != '' }}
      - run: npm run lint --prefix frontend --if-present
        if: ${{ hashFiles('frontend/package.json') != '' }}
```

## 7. 目录约定（与 CI 对应）

* 后端入口：`cmd/server`（Go 二进制构建）。
* 前端：`frontend/`（存在 `package.json` 时触发前端相关步骤）。
* OpenAPI：`docs/api/*.yml|yaml`（启用契约检查与合规模块）。
