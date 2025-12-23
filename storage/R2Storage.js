import { BaseStorage } from './BaseStorage.js'
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadBucketCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import FormData from 'form-data'
import { StorageConfig } from './StorageConfig.js'

/**
 * Cloudflare R2 存储驱动
 * 💡 100% 完整实现：修复 R2 上传不通知 Bug，确保原始文件名显示
 */
export class R2Storage extends BaseStorage {
  constructor(config = {}) {
    super(config)
    this.bucketName = config.bucketName
    this.accountId = config.accountId
    this.baseUrl = (config.baseUrl || '').replace(/\/$/, '')
    this.indexFile = path.join(process.cwd(), 'data', 'r2-index.json')
    
    // 💡 初始化配置管理器，用于实时抓取最新的全局通知配置
    this.configManager = new StorageConfig()

    // 初始化 S3 客户端
    if (this.accountId && config.accessKeyId && config.secretAccessKey) {
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${this.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey
        },
        maxAttempts: 3
      })
    }
    this._ensureIndexFile()
  }

  /**
   * 💡 实时获取 Telegram 通知配置
   * 优先从环境变量读取，其次从全局配置文件读取
   */
  _getNotificationConfig() {
    const fullConfig = this.configManager.loadConfig()
    return {
      token: process.env.TG_BOT_TOKEN || (fullConfig.telegraph && fullConfig.telegraph.botToken),
      chatId: process.env.TG_CHAT_ID || (fullConfig.telegraph && fullConfig.telegraph.chatId)
    }
  }

  getStats() {
    const images = this._readIndex()
    const totalSize = images.reduce((sum, item) => sum + (item.size || 0), 0)
    return { count: images.length, size: totalSize }
  }

  async isAvailable() {
    if (!this.s3Client || !this.bucketName) return false
    try {
      await this.s3Client.send(new ListObjectsV2Command({ Bucket: this.bucketName, MaxKeys: 1 }))
      return true
    } catch (error) { return false }
  }

  _ensureIndexFile() {
    const dir = path.dirname(this.indexFile)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    if (!fs.existsSync(this.indexFile)) fs.writeFileSync(this.indexFile, '[]', 'utf8')
  }

  _readIndex() {
    try {
      const content = fs.readFileSync(this.indexFile, 'utf8')
      return JSON.parse(content)
    } catch (e) { return [] }
  }

  _writeIndex(data) {
    fs.writeFileSync(this.indexFile, JSON.stringify(data, null, 2), 'utf8')
  }

  /**
   * 💡 上传核心：补全 originalName 接收
   */
  async upload(fileBuffer, filename, mimetype, originalName) {
    // 1. 上传至 R2
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: filename,
      Body: fileBuffer,
      ContentType: mimetype
    }))

    const shortId = Math.random().toString(36).substring(2, 10)
    const publicUrl = `/r2/${shortId}${path.extname(filename)}`
    
    // 2. 写入索引
    const images = this._readIndex()
    const newImg = {
      filename,
      originalName: originalName || filename, // 记录原始文件名
      shortId,
      size: fileBuffer.length,
      uploadTime: new Date().toLocaleString('zh-CN')
    }
    images.unshift(newImg)
    this._writeIndex(images)

    // 3. 💡 触发通知（不阻塞上传响应）
    this._sendSafeNotification(fileBuffer, originalName || filename, mimetype, publicUrl)
      .catch(err => console.error('🔔 通知发送失败:', err.message))

    return { 
      url: publicUrl, 
      thumbnailUrl: publicUrl, 
      filename: filename, 
      storageType: 'r2',
      ...newImg 
    }
  }

  /**
   * 💡 终极修复：R2 上传专用通知函数
   */
  async _sendSafeNotification(buffer, displayName, mimetype, url) {
    const tg = this._getNotificationConfig()
    
    // 如果没有配置 Token 或 ChatId，直接退出
    if (!tg.token || !tg.chatId) return

    const fullUrl = `${this.baseUrl}${url}`
    const fileSizeText = (buffer.length / 1024).toFixed(2) + ' KB'

    // 复刻 1:1 样式：大小加粗、代码块链接
    const caption = `☁️ <b>Cloudflare R2 上传成功</b>\n\n` +
                    `🔗 <b>图片链接：</b>\n` +
                    `<code>${fullUrl}</code>\n\n` +
                    `⚖️ <b>文件大小：</b>\n` +
                    `<b>${fileSizeText}</b>\n\n` + 
                    `📦 <b>文件名：</b>\n` +
                    `<code>${displayName}</code>`

    const form = new FormData()
    form.append('chat_id', tg.chatId)
    
    // 只有小于 10MB 的图片才发送图片预览，否则发链接
    if (buffer.length < 10 * 1024 * 1024) {
      form.append('photo', buffer, { filename: displayName, contentType: mimetype })
    }
    
    form.append('caption', caption)
    form.append('parse_mode', 'HTML')

    try {
      await axios.post(`https://api.telegram.org/bot${tg.token}/sendPhoto`, form, { 
        headers: form.getHeaders(),
        timeout: 15000 
      })
    } catch (err) {
      // 如果图片发送失败（例如格式不支持），降级为发送纯文字消息
      try {
        await axios.post(`https://api.telegram.org/bot${tg.token}/sendMessage`, {
          chat_id: tg.chatId,
          text: caption,
          parse_mode: 'HTML'
        })
      } catch (retryErr) {}
    }
  }

  async list() {
    return this._readIndex().map(img => ({
      ...img,
      url: `/r2/${img.shortId}${path.extname(img.filename)}`,
      thumbnailUrl: `/r2/${img.shortId}${path.extname(img.filename)}`,
      storageType: 'r2'
    }))
  }

  async delete(filename) {
    try {
      await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: filename }))
      this._writeIndex(this._readIndex().filter(i => i.filename !== filename))
      return true
    } catch (e) { return false }
  }

  async syncFromCloud() {
    if (!this.s3Client) throw new Error('R2 客户端未初始化')
    const res = await this.s3Client.send(new ListObjectsV2Command({ Bucket: this.bucketName }))
    const cloudFiles = res.Contents || []
    let local = this._readIndex()
    let added = 0
    for (const f of cloudFiles) {
      if (!local.find(l => l.filename === f.Key)) {
        local.unshift({ 
          filename: f.Key, 
          shortId: Math.random().toString(36).substring(2, 10), 
          size: f.Size, 
          uploadTime: f.LastModified.toLocaleString('zh-CN') 
        })
        added++
      }
    }
    this._writeIndex(local)
    return { addedCount: added }
  }

  async getFile(filename) {
    const res = await this.s3Client.send(new GetObjectCommand({ Bucket: this.bucketName, Key: filename }))
    const chunks = []
    for await (const chunk of res.Body) { chunks.push(chunk) }
    return { buffer: Buffer.concat(chunks), contentType: res.ContentType, contentLength: res.ContentLength }
  }

  getFilenameByShortId(id) {
    return this._readIndex().find(i => i.shortId === id)?.filename
  }

  getName() { return 'r2' }
}