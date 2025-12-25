# 使用官方轻量级 Node 镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 💡 安装 sharp 运行所需的最小化运行时依赖
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    pixman

# 1. 拷贝已经在宿主机编译好的前端静态文件
# 💡 此时 .dockerignore 不再拦截，COPY 能够成功
COPY dist/ ./dist/

# 2. 拷贝后端驱动和驱动全量逻辑
COPY storage/ ./storage/
COPY server.js ./server.js
COPY package*.json ./

# 3. 只安装生产环境依赖
# --arch 参数确保在不同架构下下载正确的二进制包
RUN npm ci --only=production

# 4. 准备持久化数据目录
RUN rm -rf src public node_modules/.cache && \
    mkdir -p /app/data && \
    chmod 777 /app/data

# 暴露固定端口
EXPOSE 33000

# 设置生产环境变量
ENV NODE_ENV=production \
    PORT=33000

# 启动应用
CMD ["node", "server.js"]