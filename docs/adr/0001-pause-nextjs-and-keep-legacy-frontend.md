# ADR 0001: 暂缓采用 Next.js，维持现有（Vite/Legacy Fullstack）前端架构

- 决策日期：2025-09-13
- 状态：Accepted（已在 `main` 落地）
- 相关分支：`next-ui-experimental`（保留试验成果）

## 背景（Context）

我们在短周期内尝试将前端切换到 Next.js（App Router + next-intl），以实现“赛博夜行”风格、统一 i18n、严格安全头与无缓存策略，并通过 GHCR 引入独立的 `synap-web` 镜像。试验期间遇到以下落地问题：

- 运行与运维复杂度显著上升
  - 由单容器（legacy fullstack）→ 双服务（backend + web），Watchtower 仅热更镜像，不会自动新增/变更服务与反代，违背“一键脚本 + 自动热更新”的期望。
  - 端口/变量耦合（`PORT` 被注入 web 导致 Next 监听 9000），需要一次性迁移 compose 与 .env，影响线上稳定性。
- 路由与 i18n 中间件兼容性
  - next-intl 依赖 middleware；在某些反代/缓存条件下中间件未触发，导致 locale 丢失、直达路径 404，需要额外 fallback 重定向策略来兜底。
  - 动态渲染/静态预渲染边界处理繁琐（dynamic routes / static generation 的取舍增加运维不确定性）。
- 安全策略与水合
  - 我们默认 CSP 严格（`script-src 'self'`），Next 的必要内联脚本初期会被拦截；为解锁水合不得不暂时 `'unsafe-inline'`，与“默认最严”冲突，需引入 nonce 方案才可长期稳定。
- 交付链复杂化
  - 新增 `synap-web` GHCR 镜像、构建时 devDependencies 处理、Docker 多阶段产物、部署脚本分支复杂（EDGE/legacy/web 三种形态），对“小步提交、自动化回滚”提出更高门槛。

上述问题导致短期内“无需人工介入、一键上线”的目标受阻，不符合当前阶段的工程节奏与稳定性诉求。

## 决策（Decision）

- 暂缓在主线采用 Next.js；`main` 分支恢复到 Next 引入前的旧架构（Vite/legacy fullstack）。
- 保留 Next.js 全量实现于分支 `next-ui-experimental` 以便后续继续迭代与验证。
- 继续在现有前端中分步落地“赛博夜行”设计（样式与交互可迁移，不强绑定框架）。

## 备选方案（Alternatives Considered）

1) 继续推进 Next.js，并一次性切换编排与反代：
   - 优点：RSC、同构能力、官方 i18n 支持、生态丰富。
   - 缺点：当前发布节奏下运维复杂度高；CSP 与路由中间件需额外工作量保证“一键可用”。

2) 保持 legacy 架构，逐步“内联升级”设计系统与 i18n：
   - 优点：稳定、与既有 CI/CD/Watchtower 完全匹配；部署脚本无需大改。
   - 缺点：SSR 与更强的路由能力暂缓。

最终选择方案 2（暂缓 Next.js）。

## 影响（Consequences）

- 交付与部署：继续沿用 `synap`（legacy fullstack）镜像，发布与热更新流程保持不变。
- 代码组织：`web/` 目录及 `synap-web` 镜像构建从主线移除；实验代码保存在 `next-ui-experimental`。
- 安全/缓存：仍维持“HTML no-store、资产按需缓存（或统一 no-store）”策略，不引入 Service Worker。
- 文档：在 README/部署文档中保留“Next 方案（实验分支）”说明，主线以现有流程为准。

## 回滚与迁移（Rollback/Migration）

- 回滚：已完成对 `main` 的回退（强制指向 Next 引入前的提交）。若需恢复 Next 实验，可直接基于 `next-ui-experimental` 派生分支。
- 部署：如线上曾切到双服务形态，执行一键部署（legacy fullstack）即可回归单容器拓扑。

## 何时再评估 Next.js（Revisit Criteria）

- 我们明确需要 SSR/边缘渲染带来的 SEO/首屏收益。
- 有稳定的 nonce-based CSP 基础设施，以及覆盖 i18n 路由的自动化 E2E（含反代场景）。
- 一键部署脚本完成“零手改切换/回滚”，Watchtower 与 Compose 变更达成良好兼容。

## 后续工作（Follow-ups）

- 在 legacy 前端内持续推进：设计令牌、交互反馈、Lighthouse 指标、无障碍与无缓存策略。
- 为 Next 方案准备再验证清单（在实验分支推进，不影响主线）：
  - nonce-based CSP 与中间件覆盖用例
  - 反代（Caddy/Nginx）一致性验证
  - Compose/一键脚本的切换/回滚原子化设计

