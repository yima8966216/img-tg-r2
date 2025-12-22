import { BaseStorage } from './BaseStorage.js'
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadBucketCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import FormData from 'form-data'

/**
 * Cloudflare R2 存储驱动
 * 100% 完整实现，包含测试连接、上传、同步和 TG 通知逻辑
 */
export class R2Storage extends BaseStorage {
  constructor(config = {}) {
    super(config)
    this.bucketName = config.bucketName
    this.accountId = config.accountId
    this.baseUrl = (config.baseUrl || '').replace(/\/$/, '')
    this.indexFile = path.join(process.cwd(), 'data', 'r2-index.json')
    
    // 💡 自动识别通知参数
    this.tgBotToken = config.tgBotToken || config.botToken
    this.tgChatId = config.tgChatId || config.chatId

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
   * 💡 核心修复：实现测试连接方法
   */
  async isAvailable() {
    if (!this.s3Client || !this.bucketName) return false
    try {
      await this.s3Client.send(new ListObjectsV2Command({
        Bucket: this.bucketName,
        MaxKeys: 1
      }))
      return true
    } catch (error) {
      console.error('❌ R2 可用性检查失败:', error.message)
      return false
    }
  }

  _ensureIndexFile() {
    const dir = path.dirname(this.indexFile)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    if (!fs.existsSync(this.indexFile)) fs.writeFileSync(this.indexFile, '[]', 'utf8')
  }

  _readIndex() {
    try {
      return JSON.parse(fs.readFileSync(this.indexFile, 'utf8'))
    } catch (e) { return [] }
  }

  _writeIndex(data) {
    fs.writeFileSync(this.indexFile, JSON.stringify(data, null, 2), 'utf8')
  }

  /**
   * 💡 上传逻辑：包含字段对齐和 TG 通知
   */
  async upload(fileBuffer, filename, mimetype) {
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: filename,
      Body: fileBuffer,
      ContentType: mimetype
    }))

    const shortId = Math.random().toString(36).substring(2, 10)
    const publicUrl = `/r2/${shortId}${path.extname(filename)}`
    
    const images = this._readIndex()
    const newImg = {
      filename,
      shortId,
      size: fileBuffer.length,
      uploadTime: new Date().toLocaleString('zh-CN')
    }
    images.unshift(newImg)
    this._writeIndex(images)

    await this._sendSafeNotification(fileBuffer, filename, mimetype, publicUrl)

    return { 
      url: publicUrl, 
      thumbnailUrl: publicUrl, 
      filename: filename, 
      storageType: 'r2',
      ...newImg 
    }
  }

  /**
   * 💡 TG 通知发送逻辑
   */
  async _sendSafeNotification(buffer, filename, mimetype, url) {
    if (!this.tgBotToken || !this.tgChatId) return
    
    const fullUrl = `${this.baseUrl}${url}`
    const caption = `☁️ <b>Cloudflare R2 上传成功</b>\n\n🔗 <b>图片链接：</b>\n<code>${fullUrl}</code>\n\n📦 <b>文件名：</b>\n<code>${filename}</code>`
    
    const form = new FormData()
    form.append('chat_id', this.tgChatId)
    if (buffer.length < 10 * 1024 * 1024) {
      form.append('photo', buffer, { filename, contentType: mimetype })
    }
    form.append('caption', caption)
    form.append('parse_mode', 'HTML')

    try {
      await axios.post(`https://api.telegram.org/bot${this.tgBotToken}/sendPhoto`, form, { 
        headers: form.getHeaders(),
        timeout: 15000 
      })
    } catch (err) {}
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