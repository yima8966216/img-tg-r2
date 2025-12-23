import { BaseStorage } from './BaseStorage.js'
import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import path from 'path'
import { StorageConfig } from './StorageConfig.js'

/**
 * Telegraph (Telegram Bot) 存储驱动
 * 💡 100% 完整实现：包含统计、上传、读取、索引持久化和像素级通知对齐
 */
export class TelegraphStorage extends BaseStorage {
  constructor(config = {}) {
    super(config)
    this.botToken = config.botToken
    this.chatId = config.chatId
    this.baseUrl = (config.baseUrl || '').replace(/\/$/, '')
    // 💡 索引文件存放在挂载的 data 目录下
    this.indexFile = path.join(process.cwd(), 'data', 'tg-index.json')
    
    // 初始化配置管理器用于实时重载配置
    this.configManager = new StorageConfig()
    this._ensureIndexFile()
  }

  /**
   * 💡 实时获取最新配置
   * 确保即使在面板修改了 Token，上传时也能立即生效
   */
  _getLatestConfig() {
    const fullConfig = this.configManager.loadConfig()
    return {
      token: process.env.TG_BOT_TOKEN || (fullConfig.telegraph && fullConfig.telegraph.botToken) || this.botToken,
      chatId: process.env.TG_CHAT_ID || (fullConfig.telegraph && fullConfig.telegraph.chatId) || this.chatId
    }
  }

  /**
   * 💡 确保数据目录和索引文件存在
   */
  _ensureIndexFile() {
    const dataDir = path.dirname(this.indexFile)
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    if (!fs.existsSync(this.indexFile)) {
      fs.writeFileSync(this.indexFile, JSON.stringify([], null, 2), 'utf8')
    }
  }

  /**
   * 💡 读取索引
   */
  _readIndex() {
    try {
      if (!fs.existsSync(this.indexFile)) return []
      const content = fs.readFileSync(this.indexFile, 'utf8')
      return JSON.parse(content)
    } catch (e) {
      return []
    }
  }

  /**
   * 💡 写入索引
   */
  _writeIndex(images) {
    try {
      fs.writeFileSync(this.indexFile, JSON.stringify(images, null, 2), 'utf8')
    } catch (e) {
      console.error('❌ 写入 TG 索引失败:', e.message)
    }
  }

  /**
   * 💡 补全统计函数
   */
  getStats() {
    const images = this._readIndex()
    const totalSize = images.reduce((sum, item) => sum + (item.size || 0), 0)
    return {
      count: images.length,
      size: totalSize
    }
  }

  /**
   * 💡 检查驱动是否可用
   */
  async isAvailable() {
    const conf = this._getLatestConfig()
    if (!conf.token || !conf.chatId) return false
    try {
      const response = await axios.post(`https://api.telegram.org/bot${conf.token}/getChat`, { 
        chat_id: conf.chatId 
      }, { timeout: 5000 })
      return response.data.ok === true
    } catch (error) {
      return false
    }
  }

  /**
   * 💡 获取图片列表
   */
  async list() {
    const images = this._readIndex()
    return images.map(item => ({
      ...item,
      url: `/tg/${item.shortId}${path.extname(item.filename || '.jpg')}`,
      thumbnailUrl: `/tg/${item.shortId}${path.extname(item.filename || '.jpg')}`,
      storageType: 'telegraph'
    }))
  }

  /**
   * 💡 执行上传并更新索引
   * 修复点：对齐参数 originalName，像素级对齐通知样式
   */
  async upload(fileBuffer, filename, mimetype, originalName) {
    const conf = this._getLatestConfig()
    if (!conf.token || !conf.chatId) throw new Error('Telegram 配置缺失')

    const form = new FormData()
    form.append('chat_id', conf.chatId)
    form.append('photo', fileBuffer, { filename: originalName || filename, contentType: mimetype })
    
    const shortId = Math.random().toString(36).substring(2, 10)
    const publicUrl = `/tg/${shortId}${path.extname(filename)}`
    const fullUrl = `${this.baseUrl}${publicUrl}`
    const fileSizeText = (fileBuffer.length / 1024).toFixed(2) + ' KB'

    // 💡 样式对齐：标题、链接代码块、大小加粗、文件名代码块
    const captionText = 
      `🚀 <b>Telegraph 上传成功</b>\n\n` +
      `🔗 <b>图片链接：</b>\n` +
      `<code>${fullUrl}</code>\n\n` +
      `⚖️ <b>文件大小：</b>\n` +
      `<b>${fileSizeText}</b>\n\n` + 
      `📦 <b>文件名：</b>\n` +
      `<code>${originalName || filename}</code>`

    form.append('caption', captionText)
    form.append('parse_mode', 'HTML')

    const response = await axios.post(`https://api.telegram.org/bot${conf.token}/sendPhoto`, form, { 
      headers: form.getHeaders(), 
      timeout: 30000 
    })

    if (response.data.ok) {
      const fileId = response.data.result.photo[response.data.result.photo.length - 1].file_id
      const images = this._readIndex()
      const newImg = {
        filename,
        originalName: originalName || filename,
        fileId,
        shortId,
        size: fileBuffer.length,
        uploadTime: new Date().toLocaleString('zh-CN')
      }
      images.unshift(newImg)
      this._writeIndex(images)

      return {
        url: publicUrl,
        thumbnailUrl: publicUrl,
        filename: filename,
        storageType: 'telegraph',
        size: fileBuffer.length,
        uploadTime: newImg.uploadTime,
        ...newImg
      }
    }
    throw new Error('Telegraph 上传失败')
  }

  /**
   * 💡 根据短 ID 查询真正的 TG fileId
   */
  getFileIdByShortId(shortId) {
    const found = this._readIndex().find(img => img.shortId === shortId)
    return found ? found.fileId : null
  }

  /**
   * 💡 从 TG 代理下载图片流
   */
  async getFileByFileId(fileId) {
    const conf = this._getLatestConfig()
    const fileInfo = await axios.get(`https://api.telegram.org/bot${conf.token}/getFile?file_id=${fileId}`)
    const filePath = fileInfo.data.result.file_path
    const fileResponse = await axios.get(`https://api.telegram.org/file/bot${conf.token}/${filePath}`, { 
      responseType: 'arraybuffer' 
    })
    return { 
      success: true, 
      buffer: Buffer.from(fileResponse.data), 
      contentType: 'image/jpeg' 
    }
  }

  /**
   * 💡 删除逻辑
   */
  async delete(filename) {
    const images = this._readIndex().filter(img => img.filename !== filename)
    this._writeIndex(images)
    return true
  }

  getName() { return 'telegraph' }
}