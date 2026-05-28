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
| `install` | 部署或刷新栈（**默认 prod**） |
| `status` | 容器状态 + `/api/status` |
| `update` | 拉取最新镜像并重启 |
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

## 相关链接

- [宝塔面板部署](./BT.md)
- [环境变量说明](https://docs.newapi.pro/zh/docs/installation/config-maintenance/environment-variables)
- [官方安装文档](https://docs.newapi.pro/zh/docs/installation)
