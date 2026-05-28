# NexuskeyApi 服务器安装指南（生产 + 域名）

适用：**宝塔 + Docker**，正式上线（PostgreSQL + Redis），域名示例：**https://nexuskey.eu.cc/**

详细参数见 [deploy-tool.md](./deploy-tool.md)。

---

## 能否把 IP 和密码交给工具自动部署？

| 方式 | 是否支持 | 说明 |
|------|----------|------|
| 在**服务器上**执行 `scripts/deploy.sh` | ✅ 推荐 | 脚本设计如此，一键完成 |
| 把 root 密码发给他人/AI 代部署 | ❌ **不要** | 泄露风险极高，本仓库不提供「收密码远程代装」 |
| 本机 SSH 登录后自己执行命令 | ✅ 推荐 | 用 SSH 密钥，密码不要写在聊天/文档里 |

**正确做法**：你自己 SSH 或宝塔终端登录服务器，复制下面命令执行。全程约 10–20 分钟（视网速而定）。

---

## 一、准备清单

- [ ] 云服务器一台（建议 **2 核 4G+**）
- [ ] 已安装 [宝塔面板](https://www.bt.cn/new/download.html)（≥ 9.2.0）
- [ ] 宝塔里已安装并启动 **Docker**
- [ ] 域名 **nexuskey.eu.cc** 已解析到服务器公网 IP（A 记录）
- [ ] 安全组 / 宝塔安全：放行 **80、443**（3000 可仅内网，见下文）

---

## 二、上传代码到服务器

任选一种：

**A. 服务器上 git clone（推荐）**

```bash
cd /www/wwwroot
git clone <你的仓库地址> NexuskeyApi
cd NexuskeyApi
```

**B. 本机打包上传**

将整份 `NexuskeyApi` 目录上传到 `/www/wwwroot/NexuskeyApi`。

---

## 三、一键部署（在服务器执行）

```bash
cd /www/wwwroot/NexuskeyApi
chmod +x scripts/deploy.sh
./scripts/deploy.sh install --dir /www/wwwroot/nexuskey-api --port 3000
```

等待出现 `API is healthy` 或脚本结束后的说明。

**检查：**

```bash
./scripts/deploy.sh status --dir /www/wwwroot/nexuskey-api
curl -s http://127.0.0.1:3000/api/status
```

浏览器可临时访问：`http://你的服务器IP:3000`（确认后再配域名）。

---

## 四、配置域名 HTTPS（nexuskey.eu.cc）

1. 宝塔 → **网站** → **添加站点** → 域名：`nexuskey.eu.cc`
2. **SSL** → Let's Encrypt → 申请并 **强制 HTTPS**
3. **反向代理** → 目标：`http://127.0.0.1:3000`
4. 站点 **配置文件** 中 `location /` 建议包含（流式 API）：

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

5. 浏览器访问：**https://nexuskey.eu.cc/**

生产环境建议在防火墙关闭公网 **3000**，只保留 80/443。

---

## 五、首次使用

1. 打开 https://nexuskey.eu.cc/ 按页面提示完成初始化（管理员账号等）
2. 后台若有「站点地址 / Server URL」，填：`https://nexuskey.eu.cc`
3. **备份** `.env`（含密钥，丢失会导致会话/加密问题）：

```bash
./scripts/deploy.sh backup --dir /www/wwwroot/nexuskey-api
```

---

## 六、常用运维命令

```bash
cd /www/wwwroot/NexuskeyApi

# 状态
./scripts/deploy.sh status --dir /www/wwwroot/nexuskey-api

# 更新镜像并重启
./scripts/deploy.sh update --dir /www/wwwroot/nexuskey-api

# 看日志
./scripts/deploy.sh logs --dir /www/wwwroot/nexuskey-api

# 备份 data + .env
./scripts/deploy.sh backup --dir /www/wwwroot/nexuskey-api
```

---

## 七、改了代码/页面但线上没变？

**通常不是分支问题**，而是部署方式问题：

| 你做的 | 实际运行的 |
|--------|------------|
| 改了仓库里 `web/`、Go 代码 | 默认 `install` 用的是 **Docker 官方镜像** `calciumion/new-api:latest` |
| 只在服务器 `git pull` | 若没有 **重新构建镜像**，容器仍是旧程序 |

**要让 https://nexuskey.eu.cc/ 显示你改过的内容：**

```bash
cd /www/wwwroot/NexuskeyApi
git pull                    # 拉取你改过的分支
./scripts/deploy.sh update --build --dir /www/wwwroot/nexuskey-api
```

若前端构建报错（`rsbuild` / `vite` 的 `Cannot find module ../dist/...`），先 `git pull` 获取最新 Dockerfile（已改为 Node 执行构建 CLI）。仍失败且只用 **default** 主题时，可加 `--skip-classic`：

```bash
./scripts/deploy.sh update --build --skip-classic --dir /www/wwwroot/nexuskey-api
```

首次若一直用的官方镜像，执行一次带 `--build` 的 install/update 即可。构建约 5–15 分钟（含前端编译）。

验证当前用的镜像：

```bash
grep DEPLOY_IMAGE /www/wwwroot/nexuskey-api/.env
docker inspect new-api --format '{{.Config.Image}}'
```

- 若是 `calciumion/new-api:latest` → 仍是上游版本，不是你的仓库  
- 应是 `nexuskey-api:local` → 才是本仓库构建结果  

**后台里改的配置**（渠道、模型名等）存在数据库，与代码无关；**页面文案/前端**必须 `--build` 才会更新。

浏览器可 **Ctrl+F5** 强刷，避免缓存旧静态资源。

---

## 八、故障排查

| 现象 | 处理 |
|------|------|
| 域名 502 | `status` 看容器是否运行；反代是否指向 `127.0.0.1:3000` |
| IP:3000 能开，域名不行 | 检查 DNS、SSL、反代配置 |
| 登录后会话失效 | 检查 `.env` 中 `SESSION_SECRET` 是否为空或被改过 |
| 流式输出中断 | 确认 Nginx 已加 `proxy_buffering off` 等（见第四节） |

---

## 九、相关文档

- [deploy-tool.md](./deploy-tool.md) — 脚本参数与环境变量
- [BT.md](./BT.md) — 宝塔其他安装方式
