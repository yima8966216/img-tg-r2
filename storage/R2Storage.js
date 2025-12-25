import { BaseStorage } from './BaseStorage.js'
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadBucketCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import FormData from 'form-data'
import { StorageConfig } from './StorageConfig.js'

/**
 * Cloudflare R2 存储驱动
 * 💡 100% 完整实现：增加防索引抹除熔断器，确保 R2 与本地数据安全
 */
export class R2Storage extends BaseStorage {
  constructor(config = {}) {
    super(config)
    this.bucketName = config.bucketName
    this.accountId = config.accountId
    this.baseUrl = (config.baseUrl || '').replace(/\/$/, '')
    // 💡 确保使用 Docker 环境下的持久化路径
    this.indexFile = path.join(process.cwd(), 'data', 'r2-index.json')
    
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

  _getNotificationConfig() {
    const fullConfig = this.configManager.loadConfig()
    return {
      token: process.env.TG_BOT_TOKEN || (fullConfig.telegraph && fullConfig.telegraph.botToken),
      chatId: process.env.TG_CHAT_ID || (fullConfig.telegraph && fullConfig.telegraph.chatId)
    }
  }

  /**
   * 💡 确保数据目录存在，不再盲目写空文件
   */
  _ensureIndexFile() {
    const dir = path.dirname(this.indexFile)
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true })
      } catch (e) {
        console.error('❌ [R2] 无法创建数据目录:', e.message)
      }
    }
  }

  /**
   * 💡 加固读取：防止因文件读取异常导致内存初始化为空
   */
  _readIndex() {
    try {
      if (!fs.existsSync(this.indexFile)) return []
      const content = fs.readFileSync(this.indexFile, 'utf8')
      
      // 如果文件存在但为空，可能正在挂载或已损坏，抛错保护
      if (content.trim().length === 0) {
        throw new Error('索引文件内容为空(可能已损坏)')
      }
      
      const parsed = JSON.parse(content)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      console.error('🚨 [R2-READ-FATAL] 读取索引失败:', e.message)
      // 💡 返回 null，标识读取阶段故障
      return null
    }
  }

  /**
   * 💡 加固写入：增加熔断保护，禁止空数组覆盖有内容的文件
   */
  _writeIndex(data) {
    if (data === null) {
      console.error('🛑 [R2-SAVE-FUSE] 内存数据非法，已拦截空覆盖')
      return
    }

    try {
      // 物理级保护：如果新数据为空，但旧文件很大，禁止写入
      if (data.length === 0 && fs.existsSync(this.indexFile)) {
        const stats = fs.statSync(this.indexFile)
        if (stats.size > 10) {
          console.error('🛑 [R2-SAVE-FUSE] 内存列表为空，但磁盘有旧数据，拒绝抹除')
          return
        }
      }
      fs.writeFileSync(this.indexFile, JSON.stringify(data, null, 2), 'utf8')
    } catch (e) {
      console.error('❌ [R2] 写入索引失败:', e.message)
    }
  }

  getStats() {
    const images = this._readIndex() || []
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
    let images = this._readIndex()
    if (images === null) throw new Error('系统无法访问索引文件，请检查磁盘')

    const newImg = {
      filename,
      originalName: originalName || filename,
      shortId,
      size: fileBuffer.length,
      uploadTime: new Date().toLocaleString('zh-CN')
    }
    images.unshift(newImg)
    this._writeIndex(images)

    // 3. 触发通知（不阻塞响应）
    this._sendSafeNotification(fileBuffer, originalName || filename, mimetype, publicUrl)
      .catch(err => console.error('🔔 通知失败:', err.message))

    return { 
      url: publicUrl, 
      thumbnailUrl: publicUrl, 
      filename: filename, 
      storageType: 'r2',
      ...newImg 
    }
  }

  async _sendSafeNotification(buffer, displayName, mimetype, url) {
    const tg = this._getNotificationConfig()
    if (!tg.token || !tg.chatId) return

    const fullUrl = `${this.baseUrl}${url}`
    const fileSizeText = (buffer.length / 1024).toFixed(2) + ' KB'

    const caption = `☁️ <b>Cloudflare R2 上传成功</b>\n\n` +
                    `🔗 <b>图片链接：</b>\n` +
                    `<code>${fullUrl}</code>\n\n` +
                    `⚖️ <b>文件大小：</b>\n` +
                    `<b>${fileSizeText}</b>\n\n` + 
                    `📦 <b>文件名：</b>\n` +
                    `<code>${displayName}</code>`

    const form = new FormData()
    form.append('chat_id', tg.chatId)
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
    const images = this._readIndex() || []
    return images.map(img => ({
      ...img,
      url: `/r2/${img.shortId}${path.extname(img.filename)}`,
      thumbnailUrl: `/r2/${img.shortId}${path.extname(img.filename)}`,
      storageType: 'r2'
    }))
  }

  async delete(filename) {
    try {
      await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: filename }))
      let images = this._readIndex()
      if (images !== null) {
        this._writeIndex(images.filter(i => i.filename !== filename))
      }
      return true
    } catch (e) { return false }
  }

  /**
   * 💡 同步云端：补全文件名逻辑
   */
  async syncFromCloud() {
    if (!this.s3Client) throw new Error('R2 客户端未初始化')
    const res = await this.s3Client.send(new ListObjectsV2Command({ Bucket: this.bucketName }))
    const cloudFiles = res.Contents || []
    
    let local = this._readIndex()
    if (local === null) local = [] // 这种情况下允许重构

    let added = 0
    for (const f of cloudFiles) {
      if (!local.find(l => l.filename === f.Key)) {
        // 💡 尝试从文件名恢复 originalName (去掉时间戳前缀)
        const nameParts = f.Key.split('_')
        const guessedName = nameParts.length > 1 ? nameParts.slice(1).join('_') : f.Key

        local.unshift({ 
          filename: f.Key,
          originalName: guessedName,
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
    const images = this._readIndex() || []
    return images.find(i => i.shortId === id)?.filename
  }

  getName() { return 'r2' }
}