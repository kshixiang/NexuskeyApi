# 宝塔面板部署教程

本文档提供使用宝塔面板 Docker 功能部署 New API 的图文教程。

> 📖 官方文档：[宝塔面板部署](https://docs.newapi.pro/zh/docs/installation/deployment-methods/bt-docker-installation)

***

## 前置要求

| 项目    | 要求                                 |
| ----- | ---------------------------------- |
| 宝塔面板  | ≥ 9.2.0 版本                         |
| 推荐系统  | CentOS 7+、Ubuntu 18.04+、Debian 10+ |
| 服务器配置 | 生产建议 ≥ 2 核 4G；试用简易模式 ≥ 1 核 2G   |

***

## 步骤一：安装宝塔面板

1. 前往 [宝塔面板官网](https://www.bt.cn/new/download.html) 下载适合您系统的安装脚本
2. 运行安装脚本安装宝塔面板
3. 安装完成后，使用提供的地址、用户名和密码登录宝塔面板

***

## 步骤二：安装 Docker

1. 登录宝塔面板后，在左侧菜单栏找到并点击 **Docker**
2. 首次进入会提示安装 Docker 服务，点击 **立即安装**
3. 按照提示完成 Docker 服务的安装

***

## 步骤三：安装 New API

### 方法一：使用仓库部署脚本（推荐，生产环境）

若已 clone 本仓库，可在宝塔 **终端** 中一键部署 **new-api + PostgreSQL + Redis**（默认正式上线模式）：

```bash
cd /path/to/NexuskeyApi
chmod +x scripts/deploy.sh
./scripts/deploy.sh install
# 自定义部署目录与端口：
# ./scripts/deploy.sh install --dir /www/wwwroot/nexuskey-api --port 3000
```

脚本会自动生成 `SESSION_SECRET`、`CRYPTO_SECRET`、数据库与 Redis 密码，创建 `data/`、`logs/`、`.env`，并输出防火墙与反向代理检查项。

仅试用（SQLite 单容器，**勿用于生产**）：

```bash
./scripts/deploy.sh install --simple --dir /tmp/nexuskey-trial
```

详细说明见 [deploy-tool.md](./deploy-tool.md)。

**改完代码后更新线上**（在仓库目录执行）：

```bash
cd /path/to/NexuskeyApi
git pull
./scripts/deploy.sh backup --dir /www/wwwroot/nexuskey-api   # 可选
./scripts/deploy.sh update --dir /www/wwwroot/nexuskey-api
```

会从本仓库重新构建 `nexuskey-api:local` 并重启，数据库数据保留。完整流程见 [deploy-tool.md — 代码更新](./deploy-tool.md)。

### 方法二：使用宝塔应用商店

1. 在宝塔面板 Docker 功能中，点击 **应用商店**
2. 搜索并找到 **New-API**
3. 点击 **安装**
4. 配置以下基本选项：
   - **容器名称**：可自定义，默认为 `new-api`
   - **端口映射**：默认为 `3000:3000`
   - **环境变量**：
     - `SESSION_SECRET`：会话密钥（**必填**，多机部署时必须一致）
     - `CRYPTO_SECRET`：加密密钥（使用 Redis 时必填）
5. 点击 **确认** 开始安装
6. 等待安装完成后，访问 `http://您的服务器IP:3000` 即可使用

### 方法三：使用 Docker Compose

1. 在宝塔面板中创建网站目录，如 `/www/wwwroot/new-api`
2. 创建 `docker-compose.yml` 文件：

```yaml
version: '3'
services:
  new-api:
    image: calciumion/new-api:latest
    container_name: new-api
    restart: always
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    environment:
      - SESSION_SECRET=your_session_secret_here  # 请修改为随机字符串
      - TZ=Asia/Shanghai
```

1. 在终端中进入目录并启动：

```bash
cd /www/wwwroot/new-api
docker-compose up -d
```

***

## 配置说明

### 必要环境变量

| 变量名                 | 说明                 | 是否必填   |
| ------------------- | ------------------ | ------ |
| `SESSION_SECRET`    | 会话密钥，多机部署必须一致      | **必填** |
| `CRYPTO_SECRET`     | 加密密钥，使用 Redis 时必填  | 条件必填   |
| `SQL_DSN`           | 数据库连接字符串（使用外部数据库时） | 可选     |
| `REDIS_CONN_STRING` | Redis 连接字符串        | 可选     |

### 生成随机密钥

```bash
# 生成 SESSION_SECRET
openssl rand -hex 16

# 或使用 Linux 命令
head -c 16 /dev/urandom | xxd -p
```

***

## 常见问题

### Q1：无法访问 3000 端口？

1. 检查服务器防火墙是否开放 3000 端口
2. 在宝塔面板 **安全** 中放行 3000 端口
3. 检查云服务器安全组是否开放端口

### Q2：登录后提示会话失效？

确保设置了 `SESSION_SECRET` 环境变量，且值不为空。

### Q3：数据如何持久化？

使用 Docker 卷映射数据目录：

```yaml
volumes:
  - ./data:/data
```

### Q4：如何更新版本？

**若使用本仓库 `scripts/deploy.sh` 部署（推荐）：**

```bash
cd /path/to/NexuskeyApi
git pull
./scripts/deploy.sh update --dir /www/wwwroot/nexuskey-api
```

会重新构建包含你修改代码的镜像，而不是拉取官方 `calciumion/new-api`。详见 [deploy-tool.md](./deploy-tool.md)。

**若使用宝塔应用商店 / 官方镜像：**

```bash
docker pull calciumion/new-api:latest
docker compose down && docker compose up -d
```

注意：上述方式**不会**包含你在本仓库 `web/default` 或 Go 源码中的自定义修改。

***

## 相关链接

- [仓库部署脚本说明](./deploy-tool.md)
- [官方文档](https://docs.newapi.pro/zh/docs/installation)
- [环境变量配置](https://docs.newapi.pro/zh/docs/installation/config-maintenance/environment-variables)
- [常见问题](https://docs.newapi.pro/zh/docs/support/faq)
- [GitHub 仓库](https://github.com/QuantumNous/new-api)

***

## 截图示例

![宝塔面板 Docker 安装](https://github.com/user-attachments/assets/7a6fc03e-c457-45e4-b8f9-184508fc26b0)

> ⚠️ 注意：密钥为环境变量 `SESSION_SECRET`，请务必设置！

