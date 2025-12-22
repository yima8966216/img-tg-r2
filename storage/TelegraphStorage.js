import { BaseStorage } from './BaseStorage.js'
import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import path from 'path'

export class TelegraphStorage extends BaseStorage {
  constructor(config = {}) {
    super(config)
    this.botToken = config.botToken
    this.chatId = config.chatId
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`
    this.baseUrl = (config.baseUrl || '').replace(/\/$/, '')
    this.indexFile = path.join(process.cwd(), 'data', 'tg-index.json')
    this._ensureIndexFile()
  }

  _ensureIndexFile() {
    const dataDir = path.dirname(this.indexFile)
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
    if (!fs.existsSync(this.indexFile)) fs.writeFileSync(this.indexFile, JSON.stringify([], null, 2), 'utf8')
  }

  _readIndex() {
    try {
      const content = fs.readFileSync(this.indexFile, 'utf8')
      return JSON.parse(content)
    } catch (e) { return [] }
  }

  _writeIndex(images) {
    try {
      fs.writeFileSync(this.indexFile, JSON.stringify(images, null, 2), 'utf8')
    } catch (e) { console.error('❌ 写入 TG 索引失败:', e.message) }
  }

  /**
   * 💡 核心修复：补全统计函数
   * 解决后台仪表盘显示 0 的问题
   */
  getStats() {
    const images = this._readIndex()
    const totalSize = images.reduce((sum, item) => sum + (item.size || 0), 0)
    return {
      count: images.length,
      size: totalSize
    }
  }

  async isAvailable() {
    if (!this.botToken || !this.chatId) return false
    try {
      const response = await axios.post(`${this.apiUrl}/getChat`, { chat_id: this.chatId }, { timeout: 5000 })
      return response.data.ok === true
    } catch (error) { return false }
  }

  async list() {
    const images = this._readIndex()
    return images.map(item => ({
      ...item,
      url: `/tg/${item.shortId}${path.extname(item.filename || '.jpg')}`,
      thumbnailUrl: `/tg/${item.shortId}${path.extname(item.filename || '.jpg')}`,
      storageType: 'telegraph'
    }))
  }

  async upload(fileBuffer, filename, mimetype) {
    const form = new FormData()
    form.append('chat_id', this.chatId)
    form.append('photo', fileBuffer, { filename, contentType: mimetype })
    
    const shortId = Math.random().toString(36).substring(2, 10)
    const publicUrl = `/tg/${shortId}${path.extname(filename)}`
    const fullUrl = `${this.baseUrl}${publicUrl}`

    const captionText = 
      `🚀 <b>Telegraph 上传成功</b>\n\n` +
      `🔗 <b>图片链接：</b>\n` +
      `<b><code>${fullUrl}</code></b>\n\n` +
      `📦 <b>文件名：</b>\n` +
      `<b><code>${filename}</code></b>`

    form.append('caption', captionText)
    form.append('parse_mode', 'HTML')

    const response = await axios.post(`${this.apiUrl}/sendPhoto`, form, { headers: form.getHeaders(), timeout: 30000 })

    if (response.data.ok) {
      const fileId = response.data.result.photo[response.data.result.photo.length - 1].file_id
      const images = this._readIndex()
      const newImg = {
        filename,
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
        uploadTime: newImg.uploadTime
      }
    }
    throw new Error('Telegraph 上传失败')
  }

  getFileIdByShortId(shortId) {
    const found = this._readIndex().find(img => img.shortId === shortId)
    return found ? found.fileId : null
  }

  async getFileByFileId(fileId) {
    const fileInfo = await axios.get(`${this.apiUrl}/getFile?file_id=${fileId}`)
    const fileResponse = await axios.get(`https://api.telegram.org/file/bot${this.botToken}/${fileInfo.data.result.file_path}`, { responseType: 'arraybuffer' })
    return { success: true, buffer: Buffer.from(fileResponse.data), contentType: 'image/jpeg' }
  }

  async delete(filename) {
    const images = this._readIndex().filter(img => img.filename !== filename)
    this._writeIndex(images)
    return true
  }

  getName() { return 'telegraph' }
}