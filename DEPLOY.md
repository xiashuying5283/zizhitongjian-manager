# 资治通鉴人物数据库 - 部署指南（AlmaLinux 9.2）

## 一、服务器环境准备

```bash
# 更新系统
sudo dnf update -y

# 安装 Node.js 20.x
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# 安装 PostgreSQL 15
sudo dnf install -y postgresql-server postgresql-contrib

# 初始化并启动 PostgreSQL
sudo postgresql-setup --initdb
sudo systemctl enable postgresql
sudo systemctl start postgresql

# 安装 Nginx
sudo dnf install -y nginx
sudo systemctl enable nginx

# 安装 certbot（SSL 证书）
sudo dnf install -y certbot python3-certbot-nginx

# 安装 PM2（进程管理）
sudo npm install -g pm2

# 安装 git（如果还没有）
sudo dnf install -y git
```

## 二、数据库配置

```bash
# 切换到 postgres 用户
sudo -u postgres psql

# 创建数据库和用户
CREATE DATABASE tongjianrenwu;
CREATE USER tongjian WITH PASSWORD '你的密码';
GRANT ALL PRIVILEGES ON DATABASE tongjianrenwu TO tongjian;
\q

# 修改 PostgreSQL 认证方式（允许密码登录）
sudo nano /var/lib/pgsql/data/pg_hba.conf
# 将 ident 改为 md5 或 scram-sha-256
# 示例：host    all             all             127.0.0.1/32            scram-sha-256

# 重启 PostgreSQL
sudo systemctl restart postgresql

# 测试连接
psql -U tongjian -d tongjianrenwu -h localhost
```

## 三、项目部署

```bash
# 创建项目目录
sudo mkdir -p /var/www/tongjianrenwu
sudo chown $USER:$USER /var/www/tongjianrenwu

# 上传项目（本地执行）
scp -r d:/Code/tongjianrenwu/* user@服务器IP:/var/www/tongjianrenwu/

# 或使用 git clone
cd /var/www
git clone 你的仓库地址 tongjianrenwu
cd tongjianrenwu

# 安装依赖
npm install
cd frontend && npm install && cd ..

# 配置环境变量
cp .env.example .env
nano .env
```

### .env 配置示例

```env
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
OPENAI_MODEL=ep-xxx

DATABASE_URL=postgresql://tongjian:你的密码@localhost:5432/tongjianrenwu

PORT=9092
HOST=0.0.0.0

# 登录账号密码
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的强密码

NODE_ENV=production
```

### 构建和启动

```bash
# 构建
npm run build

# 使用 PM2 启动
pm2 start dist/server.js --name tongjianrenwu

# 保存 PM2 配置
pm2 save
pm2 startup
```

## 四、Nginx 配置

```bash
# 创建配置文件
sudo nano /etc/nginx/conf.d/tongjianrenwu.conf
```

### Nginx 配置内容

```nginx
server {
    listen 80;
    server_name tongjian.huazhangtop.cn;

    # 前端静态文件
    location / {
        root /var/www/tongjianrenwu/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api {
        proxy_pass http://127.0.0.1:9092;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 启用配置

```bash
# 测试配置
sudo nginx -t

# 启动 Nginx
sudo systemctl start nginx

# 重载配置
sudo systemctl reload nginx
```

## 五、SSL 证书

```bash
# 申请证书
sudo certbot --nginx -d tongjian.huazhangtop.cn

# 自动续期测试
sudo certbot renew --dry-run
```

## 六、常用命令

```bash
# 查看服务状态
pm2 status
pm2 logs tongjianrenwu

# 重启服务
pm2 restart tongjianrenwu

# 停止服务
pm2 stop tongjianrenwu

# 更新部署
cd /var/www/tongjianrenwu
git pull
npm install
cd frontend && npm install && cd ..
npm run build
pm2 restart tongjianrenwu

# 查看 Nginx 日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# 查看数据库
psql -U tongjian -d tongjianrenwu -h localhost
```

## 七、防火墙配置（firewalld）

```bash
# 开放端口
sudo firewall-cmd --permanent --add-port=22/tcp    # SSH
sudo firewall-cmd --permanent --add-port=80/tcp    # HTTP
sudo firewall-cmd --permanent --add-port=443/tcp   # HTTPS

# 重载防火墙
sudo firewall-cmd --reload

# 查看开放的端口
sudo firewall-cmd --list-ports
```

## 八、SELinux 配置（如果启用）

```bash
# 查看 SELinux 状态
getenforce

# 如果是 Enforcing，需要配置 Nginx 访问权限
sudo setsebool -P httpd_can_network_connect 1

# 或者临时关闭（不推荐）
sudo setenforce 0
```

## 九、安全建议

```bash
# 使用强密码
ADMIN_PASSWORD=至少16位，包含大小写字母、数字、特殊字符

# 定期更换密码
# 修改 .env 后重启服务
pm2 restart tongjianrenwu
```
