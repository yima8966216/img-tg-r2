import { BaseStorage } from './BaseStorage.js'
import FormData from 'form-data'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Telegraph 图床存储实现
 * 使用 Telegram Bot API 上传，通过服务器代理隐藏 Bot Token
 */
export class TelegraphStorage extends BaseStorage {
  constructor(config = {}) {
    super(config)
    this.botToken = config.botToken || process.env.TG_BOT_TOKEN
    this.chatId = config.chatId || process.env.TG_CHAT_ID
    this.baseUrl = config.baseUrl || '' // 服务器 URL，用于生成代理链接
    this.indexFile = path.join(__dirname, '..', 'data', 'telegraph-index.json')
    
    if (!this.botToken) {
      console.warn('⚠️  Telegraph 存储需要配置 TG_BOT_TOKEN 环境变量')
    }
    if (!this.chatId) {
      console.warn('⚠️  Telegraph 存储需要配置 TG_CHAT_ID 环境变量')
    }
    
    // 确保索引文件存在
    this._ensureIndexFile()
  }

  /**
   * 确保索引文件存在
   */
  _ensureIndexFile() {
    // 确保 data 目录存在
    const dataDir = path.dirname(this.indexFile)
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    
    // 确保索引文件存在
    if (!fs.existsSync(this.indexFile)) {
      fs.writeFileSync(this.indexFile, JSON.stringify([], null, 2), 'utf8')
    }
  }

  /**
   * 读取索引
   */
  _readIndex() {
    try {
      const data = fs.readFileSync(this.indexFile, 'utf8')
      return JSON.parse(data)
    } catch (error) {
      console.error('读取 Telegraph 索引失败:', error)
      return []
    }
  }

  /**
   * 写入索引
   */
  _writeIndex(images) {
    try {
      fs.writeFileSync(this.indexFile, JSON.stringify(images, null, 2), 'utf8')
    } catch (error) {
      console.error('写入 Telegraph 索引失败:', error)
    }
  }

  /**
   * 添加图片到索引
   */
  _addToIndex(imageInfo) {
    const images = this._readIndex()
    images.unshift(imageInfo)
    this._writeIndex(images)
  }

  /**
   * 从索引中删除图片
   */
  _removeFromIndex(filename) {
    const images = this._readIndex()
    // 支持通过 filename、fileId 或 shortId 删除
    const filtered = images.filter(img => 
      img.filename !== filename && img.fileId !== filename && img.shortId !== filename
    )
    this._writeIndex(filtered)
    return images.length !== filtered.length
  }

  /**
   * 通过短ID查找图片的完整file_id
   */
  getFileIdByShortId(shortId) {
    const images = this._readIndex()
    const image = images.find(img => img.shortId === shortId)
    return image ? image.fileId : null
  }

  /**
   * 发送到Telegram
   */
  async sendToTelegram(formData, apiEndpoint, retryCount = 0) {
    const MAX_RETRIES = 2
    const apiUrl = `https://api.telegram.org/bot${this.botToken}/${apiEndpoint}`

    try {
      // 添加20秒超时控制
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 20000)
      
      const response = await fetch(apiUrl, { 
        method: 'POST', 
        body: formData,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      const responseData = await response.json()

      if (response.ok) {
        return { success: true, data: responseData }
      }

      return {
        success: false,
        error: responseData.description || '上传到Telegram失败'
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('Telegram 请求超时')
      } else {
        console.error('网络错误:', error)
      }
      
      if (retryCount < MAX_RETRIES && error.name !== 'AbortError') {
        // 网络错误时重试（超时错误不重试）
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)))
        return await this.sendToTelegram(formData, apiEndpoint, retryCount + 1)
      }

      return { success: false, error: error.name === 'AbortError' ? '请求超时' : '发生网络错误' }
    }
  }

  async upload(fileBuffer, filename, mimetype) {
    if (!this.botToken) {
      throw new Error('Telegraph 存储需要配置 TG_BOT_TOKEN 环境变量')
    }
    if (!this.chatId) {
      throw new Error('Telegraph 存储需要配置 TG_CHAT_ID 环境变量')
    }

    try {
      // 创建表单数据
      const formData = new FormData()
      formData.append('chat_id', this.chatId)
      formData.append('document', fileBuffer, {
        filename: filename,
        contentType: mimetype
      })

      // 使用 sendDocument 方法上传
      const result = await this.sendToTelegram(formData, 'sendDocument')

      if (!result.success) {
        throw new Error(result.error || 'Telegraph 上传失败')
      }

      // 从响应中提取文件信息
      const fileData = result.data.result?.document
      if (!fileData || !fileData.file_id) {
        throw new Error('Telegraph 返回格式错误')
      }

      // 获取文件路径
      const filePathResult = await this.getFilePath(fileData.file_id)
      if (!filePathResult.success) {
        throw new Error('获取文件路径失败')
      }

      const filePath = filePathResult.data.result?.file_path
      if (!filePath) {
        throw new Error('文件路径为空')
      }

      // 使用服务器代理链接（使用短链接+扩展名）
      // 生成短ID（取file_id的后8位）
      const shortId = fileData.file_id.slice(-8)
      // 从原始文件名获取扩展名
      const ext = path.extname(filename) || '.jpg'
      const proxyUrl = `${this.baseUrl}/tg/${shortId}${ext}`

      const imageInfo = {
        url: proxyUrl,
        thumbnailUrl: proxyUrl, // Telegram 没有单独的缩略图，使用原图
        filename: filename, // 使用原始文件名，更易读
        originalFilename: filename,
        fileId: fileData.file_id, // 保留完整 file_id
        shortId: shortId, // 短ID用于URL
        filePath: filePath,
        size: fileData.file_size || 0,
        uploadTime: new Date().toLocaleString('zh-CN'),
        storageType: 'telegraph'
      }

      // 添加到索引
      this._addToIndex(imageInfo)

      return imageInfo
    } catch (error) {
      console.error('Telegraph 上传失败:', error)
      throw error
    }
  }

  /**
   * 获取文件路径
   */
  async getFilePath(fileId) {
    const apiUrl = `https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`

    try {
      const response = await fetch(apiUrl)
      const responseData = await response.json()

      if (response.ok) {
        return { success: true, data: responseData }
      }

      return {
        success: false,
        error: responseData.description || '获取文件路径失败'
      }
    } catch (error) {
      console.error('获取文件路径错误:', error)
      return { success: false, error: '网络错误' }
    }
  }

  async delete(filename) {
    // Telegram Bot API 不支持删除文件，但可以从索引中移除
    console.warn('Telegraph (Telegram Bot) 不支持删除图片，仅从索引中移除')
    return this._removeFromIndex(filename)
  }

  async list() {
    // 从本地索引读取图片列表
    return this._readIndex()
  }

  async isAvailable() {
    if (!this.botToken) {
      return false
    }

    try {
      const apiUrl = `https://api.telegram.org/bot${this.botToken}/getMe`
      
      // 添加5秒超时控制
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      const data = await response.json()
      return response.ok && data.ok
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('Telegraph 服务检查超时')
      } else {
        console.error('Telegraph 服务不可用:', error)
      }
      return false
    }
  }

  /**
   * 通过 file_id 获取图片（用于服务器代理）
   */
  async getFileByFileId(fileId) {
    try {
      // 获取文件路径
      const filePathResult = await this.getFilePath(fileId)
      if (!filePathResult.success) {
        throw new Error('获取文件路径失败')
      }

      const filePath = filePathResult.data.result?.file_path
      if (!filePath) {
        throw new Error('文件路径为空')
      }

      // 下载文件
      const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`
      const response = await fetch(fileUrl)
      
      if (!response.ok) {
        throw new Error('下载文件失败')
      }

      // node-fetch v3 使用 arrayBuffer
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      return {
        success: true,
        buffer: buffer,
        contentType: response.headers.get('content-type') || 'image/jpeg'
      }
    } catch (error) {
      console.error('获取文件失败:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  getName() {
    return 'telegraph'
  }
}

