import { BaseStorage } from './BaseStorage.js'
import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import path from 'path'
import { StorageConfig } from './StorageConfig.js'

/**
 * Telegraph (Telegram Bot) 存储驱动
 * 💡 100% 完整全量加固版：增加空文件写入熔断保护，防止索引被误抹除
 */
export class TelegraphStorage extends BaseStorage {
  constructor(config = {}) {
    super(config)
    this.botToken = config.botToken
    this.chatId = config.chatId
    this.baseUrl = (config.baseUrl || '').replace(/\/$/, '')
    this.indexFile = path.join(process.cwd(), 'data', 'tg-index.json')
    
    this.configManager = new StorageConfig()
    this._ensureIndexFile()
  }

  _getLatestConfig() {
    const fullConfig = this.configManager.loadConfig()
    return {
      token: process.env.TG_BOT_TOKEN || (fullConfig.telegraph && fullConfig.telegraph.botToken) || this.botToken,
      chatId: process.env.TG_CHAT_ID || (fullConfig.telegraph && fullConfig.telegraph.chatId) || this.chatId
    }
  }

  /**
   * 💡 确保数据目录存在，但不再盲目创建空文件
   */
  _ensureIndexFile() {
    const dataDir = path.dirname(this.indexFile)
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true })
        console.log('📂 [TG] 创建数据目录:', dataDir)
      } catch (e) {
        console.error('❌ [TG] 无法创建数据目录:', e.message)
      }
    }
    // 💡 注意：不再自动生成空索引，交给 _readIndex 逻辑保护
  }

  /**
   * 💡 加固读取：增加异常校验，防止内存变量被初始化为空
   */
  _readIndex() {
    try {
      if (!fs.existsSync(this.indexFile)) {
        console.warn('⚠️ [TG] 索引文件缺失，如果是首次启动请忽略');
        return [];
      }
      const content = fs.readFileSync(this.indexFile, 'utf8')
      
      // 如果文件存在但没内容，可能是损坏了，抛出异常防止后续 saveIndex 覆盖
      if (content.trim().length === 0) {
        throw new Error('索引文件内容为空(可能已损坏)')
      }
      
      const parsed = JSON.parse(content)
      if (!Array.isArray(parsed)) throw new Error('索引文件格式非数组')
      
      return parsed
    } catch (e) {
      console.error('🚨 [TG-READ-FATAL] 读取索引失败:', e.message)
      // 💡 重点：如果读取失败，返回 null 而不是 []，让调用者区分“没图”和“读取出错”
      return null 
    }
  }

  /**
   * 💡 加固写入：增加熔断保护，禁止空数组覆盖有内容的文件
   */
  _writeIndex(images) {
    // 1. 如果传入的是 null (说明读取阶段就挂了)，绝对禁止写入
    if (images === null) {
      console.error('🛑 [TG-SAVE-FUSE] 检测到非法数据状态，已拦截空覆盖行为')
      return
    }

    try {
      // 2. 二次保护：如果 images 是空的，但磁盘上的文件明明是有内容的，拒绝写入
      if (images.length === 0 && fs.existsSync(this.indexFile)) {
        const stats = fs.statSync(this.indexFile)
        if (stats.size > 10) { // 如果旧文件大于 10 字节（即不是 []）
          console.error('🛑 [TG-SAVE-FUSE] 内存列表为空，但磁盘文件有内容，拦截覆盖！')
          return
        }
      }

      fs.writeFileSync(this.indexFile, JSON.stringify(images, null, 2), 'utf8')
    } catch (e) {
      console.error('❌ [TG] 写入索引失败:', e.message)
    }
  }

  /**
   * 💡 补全统计函数
   */
  getStats() {
    const images = this._readIndex() || [] // 如果读取失败，返回 0
    const totalSize = images.reduce((sum, item) => sum + (item.size || 0), 0)
    return {
      count: images.length,
      size: totalSize
    }
  }

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

  async list() {
    const images = this._readIndex() || []
    return images.map(item => ({
      ...item,
      url: `/tg/${item.shortId}${path.extname(item.filename || '.jpg')}`,
      thumbnailUrl: `/tg/${item.shortId}${path.extname(item.filename || '.jpg')}`,
      storageType: 'telegraph'
    }))
  }

  async upload(fileBuffer, filename, mimetype, originalName) {
    const conf = this._getLatestConfig()
    if (!conf.token || !conf.chatId) throw new Error('Telegram 配置缺失')

    const form = new FormData()
    form.append('chat_id', conf.chatId)
    form.append('photo', fileBuffer, { filename: originalName || filename, contentType: mimetype })
    
    const shortId = Math.random().toString(36).substring(2, 10)
    const baseUrl = this.baseUrl || '' // 确保不为 undefined
    const publicUrl = `/tg/${shortId}${path.extname(filename)}`
    const fullUrl = `${baseUrl}${publicUrl}`
    const fileSizeText = (fileBuffer.length / 1024).toFixed(2) + ' KB'

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
      
      // 💡 获取最新索引，如果读取失败直接抛错防止写入
      let images = this._readIndex()
      if (images === null) throw new Error('系统无法访问索引文件，请检查磁盘权限')

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

  getFileIdByShortId(shortId) {
    const images = this._readIndex() || []
    const found = images.find(img => img.shortId === shortId)
    return found ? found.fileId : null
  }

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

  async delete(filename) {
    let images = this._readIndex()
    if (images === null) return false
    
    images = images.filter(img => img.filename !== filename)
    this._writeIndex(images)
    return true
  }

  getName() { return 'telegraph' }
}