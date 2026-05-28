# 生产环境一键部署脚本

本仓库提供 `scripts/deploy.sh`，用于在宝塔面板（或任意 Linux 服务器）上部署 **new-api + PostgreSQL + Redis** 生产栈。默认即为正式上线模式。

> 📄 **从零安装（含域名 nexuskey.eu.cc）**：见 [QUICKSTART-zh.md](./QUICKSTART-zh.md)  
> ⚠️ **请勿**将服务器 root 密码发给他人或 AI；脚本需在**你自己的** SSH / 宝塔终端中执行。

> 试用 / 单机 SQLite 请使用 `--simple`，**不要用于生产**。

## 前置要求

| 项目 | 要求 |
|------|------|
| 宝塔面板 | ≥ 9.2.0（已安装 **Docker**） |
| 系统 | CentOS 7+ / Ubuntu 18.04+ / Debian 10+ |
| 配置 | 建议 ≥ **2 核 4G** 内存（生产栈含 PG + Redis） |
| 仓库 | 完整 clone（依赖 `deploy/docker-compose.prod.yml`） |

## 快速开始（生产）

在宝塔 **终端** 或 SSH 中执行：

```bash
cd /path/to/NexuskeyApi
chmod +x scripts/deploy.sh
./scripts/deploy.sh install
```

默认部署目录：`/www/wwwroot/nexuskey-api`

安装完成后访问：`http://服务器IP:3000`

脚本会自动：

- 生成 `SESSION_SECRET`、`CRYPTO_SECRET`、`POSTGRES_PASSWORD`、`REDIS_PASSWORD`
- 创建 `data/`、`logs/`、`.env`（权限 600）
- 启动 new-api、PostgreSQL、Redis（带健康检查）
- 等待 `/api/status` 就绪

## 部署目录

优先级：**`--dir` > 环境变量 `DEPLOY_DIR` > 默认 `/www/wwwroot/nexuskey-api`**

```bash
./scripts/deploy.sh install --dir /www/wwwroot/nexuskey-api --port 3000
```

| 路径 | 说明 |
|------|------|
| `.env` | 密钥与端口（**务必备份**，勿提交 Git） |
| `.deploy-mode` | 记录 `prod` / `simple`，供 status/update 自动识别 |
| `data/` | 应用本地数据 |
| `logs/` | 应用日志 |
| `backups/` | `backup` 命令生成的归档 |

PostgreSQL / Redis 数据在 Docker 卷 `pg_data`、`redis_data`（项目名默认 `nexuskey_api`）。

## 命令说明

| 命令 | 说明 |
|------|------|
| `install` | 首次部署或刷新栈（**默认 prod**） |
| `status` | 容器状态 + `/api/status` |
| `stop` | 停止所有容器（**保留**数据库卷与 `data/`） |
| `update` | 从本仓库**重新构建**镜像并重启（见下文「代码更新」） |
| `redeploy` | `stop` + `update`（从官方镜像切到自建代码时用） |
| `fix-theme` | 将数据库前端主题改为 `default`（修复 classic 占位页） |
| `logs` | 跟踪日志（默认 new-api） |
| `backup` | 打包 `data/`、`logs/`、`.env` |

```bash
./scripts/deploy.sh status --dir /www/wwwroot/nexuskey-api
./scripts/deploy.sh update --dir /www/wwwroot/nexuskey-api
./scripts/deploy.sh logs --dir /www/wwwroot/nexuskey-api
./scripts/deploy.sh logs --dir /www/wwwroot/nexuskey-api --service postgres
./scripts/deploy.sh backup --dir /www/wwwroot/nexuskey-api
./scripts/deploy.sh --help
```

### 常用选项

| 选项 | 说明 |
|------|------|
| `--dir PATH` | 部署目录（`.env`、`data/`、`logs/`） |
| `--port PORT` | 宿主机 HTTP 端口（默认 3000） |
| `--build` | 强制从本仓库构建（有 `Dockerfile` 时 `install`/`update` 通常已自动开启） |
| `--upstream` | 使用官方 `calciumion/new-api` 镜像（**不含**你改的代码） |
| `--with-classic` | 同时构建旧版 `web/classic` 前端（更慢） |
| `--skip-classic` | 跳过 classic 构建（**默认**；站点用 `web/default`） |

## 代码更新（改完代码后发布到线上）

适用：你在本机或 Git 上修改了 **Go 后端** 或 **`web/default` 前端**，需要让服务器上的 Docker 站点生效。

### 推荐流程

在服务器 **SSH / 宝塔终端** 执行：

```bash
# 1. 进入 Git 仓库（不是 deploy 目录）
cd /www/wwwroot/NexuskeyApi

# 2. 拉取最新代码
git pull
# 或：git pull origin main

# 3.（可选）更新前备份
./scripts/deploy.sh backup --dir /www/wwwroot/nexuskey-api

# 4. 重新构建镜像并重启（约 5–15 分钟）
./scripts/deploy.sh update --dir /www/wwwroot/nexuskey-api
```

完成后在浏览器 **Ctrl+F5** 强刷页面。

### `update` 实际做了什么

当仓库根目录存在 `Dockerfile` 且未使用 `--upstream` 时：

1. 自动设置 `BUILD_FROM_SOURCE`，构建镜像 **`nexuskey-api:local`**
2. 编译 **Go 后端** + **`web/default`**（你改的新版 UI）
3. 默认 **跳过** `web/classic`（加快构建）
4. 将 `DEPLOY_IMAGE=nexuskey-api:local` 写入部署目录 `.env`
5. `docker compose up -d --force-recreate` 重启容器  
   **PostgreSQL / Redis 数据与 `data/` 目录不会删除**

### 什么需要 `update`、什么不需要

| 修改内容 | 是否需要 `update` |
|----------|-------------------|
| `web/default/` 页面、样式、前端逻辑 | **需要** |
| Go 源码（`controller/`、`service/`、`relay/` 等） | **需要** |
| `Dockerfile`、部署脚本本身 | **需要**（先 `git pull` 再 `update`） |
| 管理后台里的渠道、模型、用户、比例等 | **不需要**（存在数据库） |
| 仅修改部署目录 `.env` 中的端口/密钥 | 改 `.env` 后执行 `update` 或 `docker compose up -d` |

### 更新后自检

```bash
./scripts/deploy.sh status --dir /www/wwwroot/nexuskey-api

grep DEPLOY_IMAGE /www/wwwroot/nexuskey-api/.env
docker inspect new-api --format '{{.Config.Image}}'
```

| 检查项 | 期望值 |
|--------|--------|
| `.env` 中 `DEPLOY_IMAGE` | `nexuskey-api:local` |
| 运行中容器镜像 | `nexuskey-api:local` |

若为 `calciumion/new-api:latest`，说明仍在跑官方镜像：不要用 `--upstream`，在仓库目录执行 `update` 或 `redeploy`。

### 特殊场景

**也改了 `web/classic` 老界面：**

```bash
./scripts/deploy.sh update --dir /www/wwwroot/nexuskey-api --with-classic
```

**页面显示 `classic theme not built`：**

```bash
./scripts/deploy.sh fix-theme --dir /www/wwwroot/nexuskey-api
```

**当前是官方镜像，要换成自己的代码：**

```bash
cd /www/wwwroot/NexuskeyApi
git pull
./scripts/deploy.sh redeploy --dir /www/wwwroot/nexuskey-api
```

**构建失败：**

1. `git pull` 确保 `Dockerfile`、`.dockerignore` 为最新  
2. `./scripts/deploy.sh logs --dir /www/wwwroot/nexuskey-api` 查看报错  
3. 将终端**最后 30 行**构建日志留存排查

### 本地开发 → 线上发布（习惯用法）

```text
本机改代码 → git commit & push → 服务器 git pull → deploy.sh update
```

仓库目录（`NexuskeyApi`）与部署目录（`nexuskey-api`）可分开：代码在前者，数据与 `.env` 在后者，`update` 会从前者构建、在后者启动容器。

## 环境变量（`.env`）

由 `deploy/.env.prod.example` 初始化，`install` 会补全占位符：

| 变量 | 说明 |
|------|------|
| `SESSION_SECRET` | **必填**，会话签名；已存在则**不覆盖** |
| `CRYPTO_SECRET` | **必填**（使用 Redis 时），加密密钥 |
| `POSTGRES_USER` / `POSTGRES_DB` | 默认 `root` / `new-api` |
| `POSTGRES_PASSWORD` | 首次 install 自动生成 |
| `REDIS_PASSWORD` | 首次 install 自动生成 |
| `HTTP_PORT` | 宿主机端口，默认 `3000` |
| `NODE_NAME` | 多节点时区分审计日志 |

`SQL_DSN` 与 `REDIS_CONN_STRING` 由 `docker-compose.prod.yml` 根据上述变量组装，**无需**在 `.env` 中手写。

## 宝塔 / 服务器清单

脚本**不会**调用宝塔 API，需手动完成：

1. **Docker**：已安装并运行  
2. **安全**：放行 `HTTP_PORT`（默认 3000）  
3. **云安全组**：入站放行相同端口  
4. **勿暴露** 5432 / 6379 到公网（数据库仅在 Docker 内网）  
5. **HTTPS（推荐）**：反向代理到 `http://127.0.0.1:3000`

```nginx
proxy_buffering off;
proxy_read_timeout 300s;
proxy_http_version 1.1;
proxy_set_header Connection "";
```

### 域名 HTTPS 示例（nexuskey.eu.cc）

1. **DNS**：将 `nexuskey.eu.cc`（及可选 `www`）**A 记录** 指向服务器公网 IP。  
2. **部署**：`./scripts/deploy.sh install` 后，本机应能访问 `http://127.0.0.1:3000`。  
3. **宝塔 → 网站 → 添加站点**：域名填 `nexuskey.eu.cc`，PHP 选「纯静态」或关闭 PHP。  
4. **SSL**：站点设置 → **Let's Encrypt** 申请证书并开启 **强制 HTTPS**。  
5. **反向代理**：站点 → 反向代理 → 目标 URL：`http://127.0.0.1:3000`（与 `.env` 中 `HTTP_PORT` 一致）。  
6. **自定义 Nginx**（流式 API 建议加上，在站点配置或「配置文件」中合并到 `location /`）：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
}
```

7. **对外访问**：`https://nexuskey.eu.cc/`（生产环境可关闭公网直连 `3000`，仅保留 80/443）。  
8. **后台地址**：若需限制管理端，在应用内配置允许的域名/回调地址为 `https://nexuskey.eu.cc`。

## 备份与恢复

```bash
# 应用目录 + 配置
./scripts/deploy.sh backup --dir /www/wwwroot/nexuskey-api

# PostgreSQL 卷（示例，项目名以 docker volume ls 为准）
docker run --rm \
  -v nexuskey_api_pg_data:/v \
  -v /www/wwwroot/nexuskey-api/backups:/b \
  alpine tar czf /b/pg_data-$(date +%Y%m%d).tar.gz -C /v .
```

## 简易模式（仅试用）

```bash
./scripts/deploy.sh install --simple --dir /tmp/nexuskey-trial
```

使用 `deploy/docker-compose.simple.yml`（单容器 SQLite）。**不适合正式上线。**

## 与根目录 docker-compose.yml 的关系

| 方式 | 适用 |
|------|------|
| `scripts/deploy.sh`（推荐） | 宝塔/运维统一目录、自动生成密钥、备份命令 |
| 根目录 `docker-compose.yml` | 手动改密码后 `docker compose up -d` |

二者均为 PostgreSQL + Redis 生产架构；部署脚本将配置与数据收敛到同一 `--dir` 目录。

## 常见问题

### 无法访问端口？

- `./scripts/deploy.sh status`
- 检查宝塔安全组与云安全组
- 确认 `.env` 中 `HTTP_PORT` 与访问端口一致

### 登录后会话失效？

- 确认 `SESSION_SECRET` 非空  
- 多机部署时各节点 `SESSION_SECRET` 必须一致  
- 不要随意修改已有用户的 `SESSION_SECRET`

### 健康检查超时？

- `./scripts/deploy.sh logs` 查看 new-api  
- `./scripts/deploy.sh logs --service postgres`  
- 内存不足时 PG 启动较慢，可稍后重试 `status`

### 从简易模式升级到生产？

简易模式与生产栈容器名/卷不同，建议**新目录**执行生产 `install`，再迁移业务数据（或按官方文档导出/导入）。

### 页面显示 classic theme not built？

部署默认不构建 classic 前端，但数据库可能仍选 classic 主题。执行：

```bash
./scripts/deploy.sh fix-theme --dir /www/wwwroot/nexuskey-api
```

或在管理后台将「前端主题」改为 **新版前端（default）**。

## 相关链接

- [宝塔面板部署](./BT.md)
- [环境变量说明](https://docs.newapi.pro/zh/docs/installation/config-maintenance/environment-variables)
- [官方安装文档](https://docs.newapi.pro/zh/docs/installation)
