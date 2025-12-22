# ================= Stage 1: Build Stage =================
FROM node:18-alpine AS build-stage

WORKDIR /app

# 安装构建工具
RUN apk add --no-cache \
    python3 \
    make \
    g++

# 复制依赖描述文件
COPY package*.json ./

# 安装完整依赖
RUN npm install

# 复制源代码
COPY . .

# 执行构建
RUN npm run build

# ================= Stage 2: Run Stage =================
FROM node:18-alpine

WORKDIR /app

# 安装 sharp 运行时依赖
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    pixman

# 拷贝构建好的 dist
COPY --from=build-stage /app/dist ./dist

# 拷贝后端代码
COPY storage/ ./storage/
COPY server.js ./server.js
COPY package*.json ./

# 安装生产依赖
RUN npm ci --only=production

# 准备目录
RUN rm -rf data && mkdir -p /app/data

EXPOSE 33000

ENV NODE_ENV=production \
    PORT=33000

CMD ["node", "server.js"]