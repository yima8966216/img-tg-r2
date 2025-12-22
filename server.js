import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { StorageManager } from './storage/StorageManager.js'
import { StorageConfig } from './storage/StorageConfig.js'


// ES模块中获取__dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

// 固定端口配置
const PORT = 33000

// 存储配置管理
const storageConfig = new StorageConfig()

/**
 * 💡 核心逻辑：JWT 密钥持久化逻辑
 * 确保服务器重启后，已登录的 Token 不会失效
 */
function getJwtSecret() {
  const config = storageConfig.getConfig(true)
  let secret = config.jwtSecret || process.env.JWT_SECRET

  if (!secret) {
    // 如果配置中没有密钥，生成一个 64 位随机密钥
    secret = crypto.randomBytes(64).toString('hex')
    // 存入配置文件，确保下次启动读取同一个
    storageConfig.updateStorageConfig('global', { jwtSecret: secret })
    console.log('🔑 已生成并持久化新的 JWT 密钥至 config.json')
  } else {
    console.log('🔑 已加载持久化 JWT 密钥')
  }
  return secret
}

// 初始化密钥
const JWT_SECRET = getJwtSecret()

// 支持的图片格式
const SUPPORTED_IMAGE_TYPES = /jpeg|jpg|png|gif|webp|bmp/

// 通用错误响应函数
const sendError = (res, statusCode, message) => {
  res.status(statusCode).json({
    success: false,
    message: message
  })
}

/**
 * 生成基础URL
 */
function getBaseUrl(req) {
  if (req) {
    const forwardedProto = req.get('x-forwarded-proto')
    const forwardedHost = req.get('x-forwarded-host')
    
    if (forwardedProto && forwardedHost) {
      return `${forwardedProto}://${forwardedHost}`
    }
    
    const protocol = req.protocol || 'http'
    const host = req.get('host')
    if (host) {
      return `${protocol}://${host}`
    }
  }
  return `http://localhost:${PORT}`
}

/**
 * 💡 获取图片专用隔离域名的基础URL
 */
function getFinalBaseUrl(req) {
  const config = storageConfig.getConfig(true)
  if (config.isolation && config.isolation.enabled && config.isolation.domains) {
    const firstDomain = config.isolation.domains.split('\n')[0].trim()
    if (firstDomain) {
      const protocol = (req && req.get('x-forwarded-proto')) || (req && req.protocol) || 'http'
      return `${protocol}://${firstDomain}`
    }
  }
  return getBaseUrl(req)
}

/**
 * 💡 域名隔离拦截中间件
 */
const domainIsolationMiddleware = (req, res, next) => {
  const config = storageConfig.getConfig(true);
  
  if (config.isolation && config.isolation.enabled && config.isolation.domains) {
    const host = req.get('host');
    const isolationDomains = config.isolation.domains.split('\n').map(d => d.trim()).filter(d => d);
    
    const isIsolationDomain = isolationDomains.some(domain => {
      if (domain.startsWith('*.')) {
        return host.endsWith(domain.substring(2));
      }
      return host === domain;
    });

    if (isIsolationDomain) {
      const normalizedPath = req.path.toLowerCase();
      // 允许路径白名单
      const allowedPrefixes = ['/tg/', '/r2/', '/api/r2/proxy/'];
      const isAllowedPath = allowedPrefixes.some(p => normalizedPath.startsWith(p) && normalizedPath.length > p.length);

      if (!isAllowedPath) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(403).send('Invalid Request: This domain is restricted to image delivery only.');
      }
    }
  }
  next();
};

let adminUser = null
let storageManager = null

// 初始化管理员用户
async function initAdmin() {
  adminUser = {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin', 10)
  }
}

/**
 * 💡 初始化存储管理器
 */
async function initStorageManager(req = null) {
  try {
    const baseUrl = getFinalBaseUrl(req)
    const config = storageConfig.getConfig(true) 
    
    console.log('📝 开始挂载存储驱动...')
    
    storageManager = await StorageManager.initialize({
      ...config,
      baseUrl: baseUrl
    })
  } catch (err) {
    console.error('❌ 驱动挂载异常:', err.message)
  }
}

// 应用基础中间件
app.set('trust proxy', true)
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// 1. 隔离拦截
app.use(domainIsolationMiddleware)

// 2. 静态文件
app.use(express.static(path.join(__dirname, 'dist')))

// 身份验证
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) return res.status(401).json({ success: false, message: '未提供访问令牌' })

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: '无效的访问令牌' })
    req.user = user
    next()
  })
}

const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 10485760 } 
})

// --- 代理分发路由 ---

app.get('/tg/:shortId', async (req, res) => {
  try {
    if (!storageManager) await initStorageManager(req)
    const s = storageManager.getStorage('telegraph')
    if (!s) return res.status(500).send('Storage not ready')
    const shortId = req.params.shortId.split('.')[0]
    const fileId = s.getFileIdByShortId(shortId)
    const result = await s.getFileByFileId(fileId)
    if (result.success) {
      res.setHeader('Content-Type', result.contentType || 'image/jpeg')
      res.send(result.buffer)
    } else {
      res.status(404).send('Not Found')
    }
  } catch (e) { res.status(500).send('Fetch Fail') }
})

app.get('/r2/:shortId', async (req, res) => {
  try {
    if (!storageManager) await initStorageManager(req)
    const s = storageManager.getStorage('r2')
    if (!s) return res.status(500).send('Storage not ready')
    const filename = s.getFilenameByShortId(req.params.shortId.split('.')[0])
    const fileData = await s.getFile(filename)
    res.set({ 
      'Content-Type': fileData.contentType, 
      'Content-Length': fileData.contentLength,
      'Cache-Control': 'public, max-age=31536000' 
    })
    res.send(fileData.buffer)
  } catch (e) { res.status(404).send('Not Found') }
})

// --- API 业务接口 ---

app.get('/api/storage/available', async (req, res) => {
  try {
    if (!storageManager) await initStorageManager(req)
    res.json({
      success: true,
      data: {
        storages: storageManager.getAvailableStorages(),
        default: storageConfig.getConfig(true).defaultStorage || 'telegraph'
      }
    })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
})

app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 400, 'No file')
    if (!storageManager) await initStorageManager(req)
    const storageType = req.body.storageType || 'telegraph'
    const s = storageManager.getStorage(storageType)
    if (!s) throw new Error('Selected storage not available')
    const filename = `${Date.now()}_${Math.round(Math.random() * 1e9)}${path.extname(req.file.originalname)}`
    const result = await s.upload(req.file.buffer, filename, req.file.mimetype)
    
    const baseUrl = getFinalBaseUrl(req)
    result.url = `${baseUrl}${result.url}`
    result.thumbnailUrl = `${baseUrl}${result.thumbnailUrl || result.url}`
    
    res.json({ success: true, data: result })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
})

app.get('/api/images', async (req, res) => {
  try {
    if (!storageManager) await initStorageManager(req)
    const storageType = req.query.storageType || 'telegraph'
    const s = storageManager.getStorage(storageType)
    if (!s) return res.json({ success: true, data: [] })
    const images = await s.list()
    const baseUrl = getFinalBaseUrl(req)
    const data = images.map(img => ({
      ...img,
      url: `${baseUrl}${img.url}`,
      thumbnailUrl: `${baseUrl}${img.thumbnailUrl || img.url}`
    }))
    res.json({ success: true, data })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
})

app.delete('/api/admin/images/:filename', authenticateToken, async (req, res) => {
  try {
    if (!storageManager) await initStorageManager(req)
    const storageType = req.query.storageType || 'telegraph'
    const s = storageManager.getStorage(storageType)
    if (!s) throw new Error('Storage not available')
    const success = await s.delete(req.params.filename)
    res.json({ success })
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
})

app.post('/api/admin/sync-r2', authenticateToken, async (req, res) => {
  try {
    if (!storageManager) await initStorageManager(req)
    const s = storageManager.getStorage('r2')
    if (s && s.getName() === 'r2') {
      const result = await s.syncFromCloud()
      res.json({ success: true, message: `同步成功：新增 ${result.addedCount} 张`, data: result })
    } else {
      res.status(400).json({ success: false, message: 'R2驱动未挂载' })
    }
  } catch (e) { res.status(500).json({ success: false, message: e.message }) }
})

/**
 * 💡 终极修复：配置保存处理函数
 * 逻辑：自动兼容你前端发送的多种格式。解决 404 和 Invalid parameters。
 */
const handleSaveConfig = async (req, res) => {
  try {
    let updateType = 'global'
    let updateData = null

    // 1. 尝试识别切换默认存储的 Payload (针对你的前端习惯)
    if (req.body.defaultStorage) {
      updateData = { defaultStorage: req.body.defaultStorage }
    } 
    // 2. 尝试识别前端直接发送 storageType 的情况
    else if (req.body.storageType && !req.body.config) {
      updateData = { defaultStorage: req.body.storageType }
    }
    // 3. 尝试识别标准配置更新
    else if (req.body.storageType && req.body.config) {
      updateType = req.body.storageType
      updateData = req.body.config
    }

    if (!updateData) {
      console.warn('⚠️ 配置更新请求参数不完整:', req.body)
      return res.status(400).json({ success: false, message: 'Invalid parameters' })
    }

    const result = storageConfig.updateStorageConfig(updateType, updateData)
    if (result.success) {
      // 核心：清空旧管理器，强制下次请求重新加载驱动
      storageManager = null
      await initStorageManager()
      res.json({ success: true, message: '保存并切换成功' })
    } else {
      res.status(500).json({ success: false, message: result.message })
    }
  } catch (e) {
    res.status(500).json({ success: false, message: '系统异常: ' + e.message })
  }
}

// 💡 路由对齐：同时监听你前端报错的那个 404 路径和标准路径
app.post('/api/admin/storage/default', authenticateToken, handleSaveConfig)
app.post('/api/admin/storage/config', authenticateToken, handleSaveConfig)

app.post('/api/admin/storage/test', authenticateToken, async (req, res) => {
  const { storageType, config: cfg } = req.body
  const baseUrl = getFinalBaseUrl(req)
  try {
    if (storageType === 'telegraph') {
      const { TelegraphStorage } = await import('./storage/TelegraphStorage.js')
      const s = new TelegraphStorage({ ...cfg, baseUrl })
      const available = await s.isAvailable()
      res.json({ success: true, data: { success: available, message: available ? 'OK' : 'Fail' } })
    } else if (storageType === 'r2') {
      const { R2Storage } = await import('./storage/R2Storage.js')
      const s = new R2Storage({ ...cfg, baseUrl })
      const available = await s.isAvailable()
      res.json({ success: true, data: { success: available, message: available ? 'OK' : 'Fail' } })
    }
  } catch (e) { res.json({ success: true, data: { success: false, message: e.message } }) }
})

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body
    if (username !== adminUser.username || !await bcrypt.compare(password, adminUser.password)) {
      return res.status(401).json({ success: false, message: '认证失败' })
    }
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '2h' })
    res.json({ success: true, data: { token, username } })
  } catch (e) { res.status(500).send('Login Error') }
})

app.get('/api/admin/storage/config/full', authenticateToken, (req, res) => {
  res.json({ success: true, data: storageConfig.getConfig(true) })
})

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

/**
 * 💡 启动服务器
 */
async function startServer() {
  await initAdmin()

  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 图床服务器已启动`)
    console.log(`🔗 访问地址: http://localhost:${PORT}`)
    console.log(`👤 管理员账号已初始化`)
    console.log(`🔑 JWT密钥已持久化配置`)
    console.log(`⚙️  存储配置已加载`)
    console.log(`🌐 服务器监听: 0.0.0.0:${PORT}`)
    console.log(`📝 支持 Telegraph 和 Cloudflare R2 存储`)
    
    await initStorageManager()
  })
}

startServer().catch(console.error)