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

// 自动生成JWT密钥（每次启动时生成随机密钥）
const JWT_SECRET = crypto.randomBytes(64).toString('hex')

// 支持的图片格式
const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
const SUPPORTED_IMAGE_TYPES = /jpeg|jpg|png|gif|webp|bmp/

// 通用错误响应函数
const sendError = (res, statusCode, message) => {
  res.status(statusCode).json({
    success: false,
    message: message
  })
}

// 生成基础URL（根据请求动态获取，支持反向代理）
function getBaseUrl(req) {
  // 如果有请求对象，从请求头中获取实际访问的URL
  if (req) {
    // 优先使用反向代理传递的头信息
    const forwardedProto = req.get('x-forwarded-proto')
    const forwardedHost = req.get('x-forwarded-host')
    
    if (forwardedProto && forwardedHost) {
      return `${forwardedProto}://${forwardedHost}`
    }
    
    // 回退到标准的 protocol 和 host
    const protocol = req.protocol || 'http'
    const host = req.get('host')
    if (host) {
      return `${protocol}://${host}`
    }
  }

  // 默认使用localhost
  return `http://localhost:${PORT}`
}

// 简单的用户数据存储（生产环境请使用数据库）
let adminUser = null

// 存储管理器
let storageManager = null

// 存储配置管理
const storageConfig = new StorageConfig()

// 初始化管理员用户
async function initAdmin() {
  adminUser = {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin', 10)
  }
}

// 初始化存储管理器
async function initStorageManager(req) {
  const baseUrl = getBaseUrl(req)
  const config = storageConfig.getConfig(true) // 获取完整配置（包括敏感信息）
  
  console.log('📝 初始化存储管理器...')
  console.log('Telegraph 配置:', {
    botToken: config.telegraph?.botToken ? '已配置' : '未配置',
    chatId: config.telegraph?.chatId || '未配置'
  })
  
  storageManager = await StorageManager.initialize({
    baseUrl: baseUrl,
    telegraph: {
      botToken: config.telegraph?.botToken || process.env.TG_BOT_TOKEN,
      chatId: config.telegraph?.chatId || process.env.TG_CHAT_ID
    },
    r2: {
      accountId: config.r2?.accountId || process.env.R2_ACCOUNT_ID,
      accessKeyId: config.r2?.accessKeyId || process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: config.r2?.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY,
      bucketName: config.r2?.bucketName || process.env.R2_BUCKET_NAME,
      publicDomain: config.r2?.publicDomain || process.env.R2_PUBLIC_DOMAIN,
      baseUrl: baseUrl
    },
    defaultStorage: config.defaultStorage || process.env.DEFAULT_STORAGE || 'telegraph'
  })
}

// 信任反向代理（用于正确获取客户端真实IP和协议）
app.set('trust proxy', true)

// 中间件
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// 在生产环境中，Vue应用会被构建到dist目录
app.use(express.static('dist'))

// JWT验证中间件
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return sendError(res, 401, '未提供访问令牌')
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return sendError(res, 403, '无效的访问令牌')
    }
    req.user = user
    next()
  })
}

// 配置 multer 用于文件上传（使用内存存储）
const storage = multer.memoryStorage()

// 文件过滤器，只允许图片
const fileFilter = (req, file, cb) => {
  const extname = SUPPORTED_IMAGE_TYPES.test(path.extname(file.originalname).toLowerCase())
  const mimetype = SUPPORTED_IMAGE_TYPES.test(file.mimetype)

  if (mimetype && extname) {
    cb(null, true)
  } else {
    cb(new Error('只支持图片文件格式 (jpeg, jpg, png, gif, webp, bmp)'))
  }
}

const upload = multer({
  storage: storage,
  limits: {
    fileSize: process.env.MAX_FILE_SIZE || 10485760 // 10MB 默认限制
  },
  fileFilter: fileFilter
})

// Telegraph 图片代理（短链接，支持在线查看）
app.get('/tg/:shortId', async (req, res) => {
  try {
    // 初始化存储管理器（如果还没有初始化）
    if (!storageManager) {
      await initStorageManager(req)
    }

    const storage = storageManager.getStorage('telegraph')
    
    // 从 shortId 中移除扩展名
    const shortIdParam = req.params.shortId
    const shortId = shortIdParam.replace(/\.(jpg|jpeg|png|gif|webp|bmp)$/i, '')
    
    // 通过短ID获取完整的file_id
    const fileId = storage.getFileIdByShortId(shortId)
    
    if (!fileId) {
      return sendError(res, 404, '图片不存在')
    }

    const result = await storage.getFileByFileId(fileId)

    if (result.success) {
      // 从URL中获取扩展名来确定正确的Content-Type
      const ext = path.extname(req.params.shortId).toLowerCase()
      const contentTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp'
      }
      const contentType = contentTypes[ext] || result.contentType || 'image/jpeg'
      
      // 设置响应头支持在线查看
      res.setHeader('Content-Type', contentType)
      res.setHeader('Content-Disposition', 'inline') // inline 支持在线查看
      res.setHeader('Cache-Control', 'public, max-age=31536000') // 缓存1年
      res.setHeader('X-Content-Type-Options', 'nosniff') // 防止MIME类型嗅探
      res.send(result.buffer)
    } else {
      return sendError(res, 404, '文件不存在')
    }
  } catch (error) {
    console.error('Telegraph 代理错误:', error)
    res.status(500).json({
      success: false,
      message: '获取文件失败'
    })
  }
})

// 管理员登录接口
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return sendError(res, 400, '请提供用户名和密码')
    }

    if (username !== adminUser.username) {
      return sendError(res, 401, '用户名或密码错误')
    }

    const isPasswordValid = await bcrypt.compare(password, adminUser.password)
    if (!isPasswordValid) {
      return sendError(res, 401, '用户名或密码错误')
    }

    const token = jwt.sign({ username: adminUser.username }, JWT_SECRET, { expiresIn: '2h' })

    res.json({
      success: true,
      message: '登录成功',
      data: {
        token,
        username: adminUser.username
      }
    })
  } catch (error) {
    console.error('登录错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    })
  }
})

// 验证token接口
app.get('/api/admin/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: '令牌有效',
    data: {
      username: req.user.username
    }
  })
})

// 获取可用的存储服务列表
app.get('/api/storage/available', async (req, res) => {
  try {
    // 初始化存储管理器（如果还没有初始化）
    if (!storageManager) {
      await initStorageManager(req)
    }

    const availableStorages = storageManager.getAvailableStorages()
    const config = storageConfig.getConfig(true)

    res.json({
      success: true,
      data: {
        storages: availableStorages,
        default: config.defaultStorage || 'telegraph'
      }
    })
  } catch (error) {
    console.error('获取存储服务列表错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    })
  }
})

// 获取存储配置（管理员）
app.get('/api/admin/storage/config', authenticateToken, (req, res) => {
  try {
    const config = storageConfig.getConfig(false) // 不包含敏感信息

    res.json({
      success: true,
      data: config
    })
  } catch (error) {
    console.error('获取存储配置错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    })
  }
})

// 获取存储配置（包含敏感信息，仅供编辑使用）
app.get('/api/admin/storage/config/full', authenticateToken, (req, res) => {
  try {
    const config = storageConfig.getConfig(true)

    res.json({
      success: true,
      data: config
    })
  } catch (error) {
    console.error('获取存储配置错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    })
  }
})

// 更新存储配置（管理员）
app.post('/api/admin/storage/config', authenticateToken, async (req, res) => {
  try {
    const { storageType, config } = req.body

    if (!storageType) {
      return sendError(res, 400, '请指定存储类型')
    }

    // 验证配置
    const validation = storageConfig.validateConfig(storageType, config)
    if (!validation.valid) {
      return sendError(res, 400, validation.message)
    }

    // 更新配置
    const result = storageConfig.updateStorageConfig(storageType, config)

    if (result.success) {
      // 标记存储管理器需要重新初始化（在下次使用时才初始化）
      storageManager = null

      res.json({
        success: true,
        message: result.message
      })
    } else {
      return sendError(res, 500, result.message)
    }
  } catch (error) {
    console.error('更新存储配置错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    })
  }
})

// 设置默认存储（管理员）
app.post('/api/admin/storage/default', authenticateToken, async (req, res) => {
  try {
    const { storageType } = req.body

    if (!storageType) {
      return sendError(res, 400, '请指定存储类型')
    }

    const result = storageConfig.setDefaultStorage(storageType)

    if (result.success) {
      // 标记存储管理器需要重新初始化（在下次使用时才初始化）
      storageManager = null

      res.json({
        success: true,
        message: '默认存储设置成功'
      })
    } else {
      return sendError(res, 400, result.message)
    }
  } catch (error) {
    console.error('设置默认存储错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    })
  }
})

// 测试存储连接（管理员）
app.post('/api/admin/storage/test', authenticateToken, async (req, res) => {
  try {
    const { storageType, config } = req.body

    if (!storageType) {
      return sendError(res, 400, '请指定存储类型')
    }

    let testResult = { success: false, message: '未知错误' }

    // 根据存储类型使用传入的配置进行测试
    if (storageType === 'telegraph') {
      if (!config || !config.botToken) {
        return res.json({
          success: true,
          data: {
            success: false,
            message: '请提供 Bot Token'
          }
        })
      }
      if (!config.chatId) {
        return res.json({
          success: true,
          data: {
            success: false,
            message: '请提供 Chat ID'
          }
        })
      }

      const { TelegraphStorage } = await import('./storage/TelegraphStorage.js')
      const storage = new TelegraphStorage({ 
        botToken: config.botToken,
        chatId: config.chatId
      })
      const available = await storage.isAvailable()
      testResult = {
        success: available,
        message: available ? 'Telegraph 连接成功！Bot 和 Chat ID 已验证。' : 'Telegraph 连接失败，请检查 Bot Token 和 Chat ID 是否正确'
      }
    } else if (storageType === 'r2') {
      if (!config || !config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
        return res.json({
          success: true,
          data: {
            success: false,
            message: '请提供完整的 R2 配置信息'
          }
        })
      }

      try {
        const { R2Storage } = await import('./storage/R2Storage.js')
        const storage = new R2Storage({
          accountId: config.accountId,
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
          bucketName: config.bucketName,
          publicDomain: config.publicDomain,
          baseUrl: getBaseUrl(req)
        })
        const available = await storage.isAvailable()
        testResult = {
          success: available,
          message: available ? 'R2 连接成功！存储桶可访问。' : 'R2 连接失败，请检查配置信息'
        }
      } catch (error) {
        console.error('R2 测试连接错误:', error)
        let errorMessage = 'R2 连接失败: '
        
        // 解析具体错误原因
        if (error.message.includes('InvalidAccessKeyId') || error.name === 'InvalidAccessKeyId') {
          errorMessage += '无效的 Access Key ID，请检查是否正确'
        } else if (error.message.includes('SignatureDoesNotMatch') || error.name === 'SignatureDoesNotMatch') {
          errorMessage += '密钥签名不匹配，请检查 Secret Access Key 是否正确'
        } else if (error.message.includes('NoSuchBucket') || error.name === 'NoSuchBucket') {
          errorMessage += '存储桶不存在，请检查 Bucket Name 是否正确'
        } else if (error.message.includes('InvalidToken') || error.message.includes('token')) {
          errorMessage += '无效的访问令牌，请检查 Access Key ID 和 Secret Access Key 是否正确配置'
        } else if (error.message.includes('Forbidden') || error.code === 'Forbidden') {
          errorMessage += '访问被拒绝，请检查 API Token 权限是否为 Admin Read & Write'
        } else if (error.message.includes('getaddrinfo') || error.message.includes('ENOTFOUND')) {
          errorMessage += 'Account ID 错误，无法连接到 R2 服务'
        } else {
          errorMessage += error.message || '未知错误'
        }
        
        testResult = {
          success: false,
          message: errorMessage
        }
      }
    }

    res.json({
      success: true,
      data: testResult
    })
  } catch (error) {
    console.error('测试存储连接错误:', error)
    res.json({
      success: true,
      data: {
        success: false,
        message: '测试失败: ' + error.message
      }
    })
  }
})

// 上传图片接口
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, 400, '请选择要上传的图片文件')
    }

    // 初始化存储管理器（如果还没有初始化）
    if (!storageManager) {
      await initStorageManager(req)
    }

    // 获取存储类型（从请求参数中获取，默认使用配置的默认存储）
    const storageType = req.body.storageType || req.query.storageType || process.env.DEFAULT_STORAGE || 'telegraph'

    // 检查存储是否存在
    if (!storageManager.storages.has(storageType)) {
      return sendError(res, 400, `存储类型 ${storageType} 未配置`)
    }

    // 生成唯一文件名
    const timestamp = Date.now()
    const random = Math.round(Math.random() * 1e9)
    const ext = path.extname(req.file.originalname)
    const filename = `${timestamp}_${random}${ext}`

    // 使用指定的存储服务上传
    const storage = storageManager.getStorage(storageType)
    const result = await storage.upload(req.file.buffer, filename, req.file.mimetype)

    // 使用当前请求的baseUrl重新生成URL（修复Docker中的地址问题）
    const currentBaseUrl = getBaseUrl(req)
    const responseData = {
      ...result,
      originalName: req.file.originalname,
      size: req.file.size,
      uploadTime: new Date().toLocaleString('zh-CN')
    }
    
    // 重写URL为当前请求的baseUrl
    if (result.url) {
      const urlPath = result.url.replace(/^https?:\/\/[^/]+/, '')
      responseData.url = `${currentBaseUrl}${urlPath}`
    }
    if (result.thumbnailUrl) {
      const thumbPath = result.thumbnailUrl.replace(/^https?:\/\/[^/]+/, '')
      responseData.thumbnailUrl = `${currentBaseUrl}${thumbPath}`
    }

    res.json({
      success: true,
      message: '图片上传成功',
      data: responseData
    })
  } catch (error) {
    console.error('上传错误:', error)
    res.status(500).json({
      success: false,
      message: error.message || '服务器内部错误'
    })
  }
})

// R2 短链接访问（类似 Telegraph）
app.get('/r2/:shortId', async (req, res) => {
  try {
    // 初始化存储管理器（如果还没有初始化）
    if (!storageManager) {
      await initStorageManager(req)
    }

    // 检查 R2 存储是否存在
    if (!storageManager.storages.has('r2')) {
      return sendError(res, 404, 'R2 存储未配置')
    }

    const storage = storageManager.getStorage('r2')
    
    // 从 shortId 中移除扩展名
    const shortIdParam = req.params.shortId
    const shortId = shortIdParam.replace(/\.(jpg|jpeg|png|gif|webp|bmp)$/i, '')
    
    // 通过短ID获取完整的文件名
    const filename = storage.getFilenameByShortId(shortId)
    
    if (!filename) {
      return sendError(res, 404, '图片不存在')
    }

    // 从 R2 获取文件
    const fileData = await storage.getFile(filename)
    
    // 从URL中获取扩展名来确定正确的Content-Type
    const ext = path.extname(req.params.shortId).toLowerCase()
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp'
    }
    const contentType = contentTypes[ext] || fileData.contentType || 'application/octet-stream'
    
    // 设置响应头
    res.set({
      'Content-Type': contentType,
      'Content-Length': fileData.contentLength,
      'Cache-Control': 'public, max-age=31536000', // 缓存 1 年
      'ETag': `"${shortId}"`
    })
    
    // 返回文件内容
    res.send(fileData.buffer)
  } catch (error) {
    console.error('R2 短链接访问错误:', error)
    if (error.name === 'NoSuchKey' || error.message.includes('NoSuchKey')) {
      return sendError(res, 404, '文件不存在')
    }
    return sendError(res, 500, '获取文件失败')
  }
})

// R2 图片代理接口（不暴露真实 R2 地址）
app.get('/api/r2/proxy/:filename', async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename)
    
    // 初始化存储管理器（如果还没有初始化）
    if (!storageManager) {
      await initStorageManager(req)
    }

    // 获取 R2 存储实例
    const r2Storage = storageManager.getStorage('r2')
    
    if (!r2Storage) {
      return sendError(res, 404, 'R2 存储未配置')
    }

    // 从 R2 获取文件
    const fileData = await r2Storage.getFile(filename)
    
    // 设置响应头
    res.set({
      'Content-Type': fileData.contentType,
      'Content-Length': fileData.contentLength,
      'Cache-Control': 'public, max-age=31536000', // 缓存 1 年
      'ETag': `"${filename}"` // 添加 ETag 用于缓存验证
    })
    
    // 返回文件内容
    res.send(fileData.buffer)
  } catch (error) {
    console.error('R2 代理错误:', error)
    if (error.name === 'NoSuchKey' || error.message.includes('NoSuchKey')) {
      return sendError(res, 404, '文件不存在')
    }
    return sendError(res, 500, '获取文件失败')
  }
})

// 获取所有已上传的图片列表
app.get('/api/images', async (req, res) => {
  try {
    // 初始化存储管理器（如果还没有初始化）
    if (!storageManager) {
      await initStorageManager(req)
    }

    // 获取指定存储类型的图片列表
    const storageType = req.query.storageType || 'telegraph'
    
    // 检查存储是否存在
    if (!storageManager.storages.has(storageType)) {
      return res.json({
        success: true,
        data: []
      })
    }

    const storage = storageManager.getStorage(storageType)
    const images = await storage.list()

    // 使用当前请求的baseUrl重新生成URL（修复Docker中的地址问题）
    const currentBaseUrl = getBaseUrl(req)
    const imagesWithCorrectUrl = images.map(image => {
      const updatedImage = { ...image }
      if (image.url) {
        const urlPath = image.url.replace(/^https?:\/\/[^/]+/, '')
        updatedImage.url = `${currentBaseUrl}${urlPath}`
      }
      if (image.thumbnailUrl) {
        const thumbPath = image.thumbnailUrl.replace(/^https?:\/\/[^/]+/, '')
        updatedImage.thumbnailUrl = `${currentBaseUrl}${thumbPath}`
      }
      return updatedImage
    })

    res.json({
      success: true,
      data: imagesWithCorrectUrl
    })
  } catch (error) {
    console.error('获取图片列表错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器内部错误: ' + error.message
    })
  }
})

// 管理员获取图片统计信息
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
  try {
    // 初始化存储管理器（如果还没有初始化）
    if (!storageManager) {
      await initStorageManager(req)
    }

    // 统计所有存储的图片
    let totalImages = 0
    let totalSize = 0
    const storageStats = {}

    // Telegraph 存储统计
    try {
      const telegraphStorage = storageManager.getStorage('telegraph')
      const telegraphImages = await telegraphStorage.list()
      const telegraphSize = telegraphImages.reduce((sum, img) => sum + (img.size || 0), 0)
      
      storageStats.telegraph = {
        count: telegraphImages.length,
        size: telegraphSize
      }
      totalImages += telegraphImages.length
      totalSize += telegraphSize
    } catch (error) {
      console.error('Telegraph 统计失败:', error)
      storageStats.telegraph = { count: 0, size: 0 }
    }

    // R2 存储统计
    try {
      if (storageManager.storages.has('r2')) {
        const r2Storage = storageManager.getStorage('r2')
        const r2Images = await r2Storage.list()
        const r2Size = r2Images.reduce((sum, img) => sum + (img.size || 0), 0)
        
        storageStats.r2 = {
          count: r2Images.length,
          size: r2Size
        }
        totalImages += r2Images.length
        totalSize += r2Size
      } else {
        storageStats.r2 = { count: 0, size: 0 }
      }
    } catch (error) {
      console.error('R2 统计失败:', error)
      storageStats.r2 = { count: 0, size: 0 }
    }

    res.json({
      success: true,
      data: {
        totalImages: totalImages,
        totalSize: totalSize,
        storageStats: storageStats
      }
    })
  } catch (error) {
    console.error('获取统计信息错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    })
  }
})

// 删除图片接口（需要管理员权限）
app.delete('/api/admin/images/:filename', authenticateToken, async (req, res) => {
  try {
    // 初始化存储管理器（如果还没有初始化）
    if (!storageManager) {
      await initStorageManager(req)
    }

    const filename = req.params.filename
    const storageType = req.query.storageType || 'telegraph'

    // 检查存储是否存在
    if (!storageManager.storages.has(storageType)) {
      return sendError(res, 400, `存储类型 ${storageType} 未配置`)
    }

    const storage = storageManager.getStorage(storageType)
    const success = await storage.delete(filename)

    if (success) {
      res.json({
        success: true,
        message: '图片删除成功'
      })
    } else {
      return sendError(res, 404, '文件不存在或删除失败')
    }
  } catch (error) {
    console.error('删除图片错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器内部错误: ' + error.message
    })
  }
})

// 普通用户删除图片接口（不需要认证，但建议在生产环境中添加限制）
app.delete('/api/images/:filename', async (req, res) => {
  try {
    // 初始化存储管理器（如果还没有初始化）
    if (!storageManager) {
      await initStorageManager(req)
    }

    const filename = req.params.filename
    const storageType = req.query.storageType || 'telegraph'

    // 检查存储是否存在
    if (!storageManager.storages.has(storageType)) {
      return sendError(res, 400, `存储类型 ${storageType} 未配置`)
    }

    const storage = storageManager.getStorage(storageType)
    const success = await storage.delete(filename)

    if (success) {
      res.json({
        success: true,
        message: '图片删除成功'
      })
    } else {
      return sendError(res, 404, '文件不存在或删除失败')
    }
  } catch (error) {
    console.error('删除图片错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器内部错误: ' + error.message
    })
  }
})

// 清空所有图片（管理员功能）
app.delete('/api/admin/images', authenticateToken, async (req, res) => {
  try {
    // 初始化存储管理器（如果还没有初始化）
    if (!storageManager) {
      await initStorageManager(req)
    }

    let deletedCount = 0

    // 清空 Telegraph 图片
    try {
      const telegraphStorage = storageManager.getStorage('telegraph')
      const telegraphImages = await telegraphStorage.list()
      for (const image of telegraphImages) {
        await telegraphStorage.delete(image.filename)
        deletedCount++
      }
    } catch (error) {
      console.error('清空 Telegraph 图片失败:', error)
    }

    // 清空 R2 图片
    try {
      if (storageManager.storages.has('r2')) {
        const r2Storage = storageManager.getStorage('r2')
        const r2Images = await r2Storage.list()
        for (const image of r2Images) {
          await r2Storage.delete(image.filename)
          deletedCount++
        }
      }
    } catch (error) {
      console.error('清空 R2 图片失败:', error)
    }

    res.json({
      success: true,
      message: `成功删除 ${deletedCount} 张图片`
    })
  } catch (error) {
    console.error('清空图片错误:', error)
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    })
  }
})

// 错误处理中间件
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: '文件大小超过限制 (最大 10MB)'
      })
    }
  }

  res.status(500).json({
    success: false,
    message: error.message || '服务器内部错误'
  })
})

// SPA 支持 - 所有其他路由都返回 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

// 启动服务器
async function startServer() {
  await initAdmin()

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 图床服务器已启动`)
    console.log(`🔗 访问地址: http://localhost:${PORT}`)
    console.log(`👤 管理员账号已初始化`)
    console.log(`🔑 JWT密钥已自动生成`)
    console.log(`⚙️  存储配置已加载`)
    console.log(`🌐 服务器监听: 0.0.0.0:${PORT}`)
    console.log(`📝 支持 Telegraph 和 Cloudflare R2 存储`)
  })
}

startServer().catch(console.error)
