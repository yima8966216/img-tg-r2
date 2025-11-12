import { BaseStorage } from './BaseStorage.js'
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadBucketCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Cloudflare R2 存储实现
 * R2 与 S3 API 兼容
 */
export class R2Storage extends BaseStorage {
  constructor(config = {}) {
    super(config)
    
    // 验证必需的配置
    if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
      throw new Error('R2 存储需要配置: accountId, accessKeyId, secretAccessKey, bucketName')
    }

    this.bucketName = config.bucketName
    this.publicDomain = config.publicDomain || null // 自定义域名（可选）
    this.baseUrl = config.baseUrl || 'http://localhost:33000' // 服务器基础 URL
    this.indexFile = path.join(__dirname, '..', 'data', 'r2-index.json')
    
    // 创建 S3 客户端（R2 兼容 S3 API）
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      },
      requestHandler: {
        requestTimeout: 10000  // 10秒超时
      }
    })
    
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
      console.error('读取 R2 索引失败:', error)
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
      console.error('写入 R2 索引失败:', error)
    }
  }

  /**
   * 生成短ID（8位随机字符串）
   */
  _generateShortId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let shortId = ''
    for (let i = 0; i < 8; i++) {
      shortId += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return shortId
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
    const filtered = images.filter(img => img.filename !== filename)
    this._writeIndex(filtered)
  }

  /**
   * 通过短ID获取文件名
   */
  getFilenameByShortId(shortId) {
    const images = this._readIndex()
    const image = images.find(img => img.shortId === shortId)
    return image ? image.filename : null
  }

  /**
   * 获取文件的公共 URL（使用短链接）
   */
  _getPublicUrl(filename, shortId) {
    // 获取文件扩展名
    const ext = path.extname(filename)
    // 使用短链接格式：/r2/shortId.ext
    return `${this.baseUrl}/r2/${shortId}${ext}`
  }

  async upload(fileBuffer, filename, mimetype) {
    try {
      // 上传原图
      const uploadParams = {
        Bucket: this.bucketName,
        Key: filename,
        Body: fileBuffer,
        ContentType: mimetype
      }

      await this.s3Client.send(new PutObjectCommand(uploadParams))

      // 生成并上传缩略图
      let thumbnailFilename = `thumbnails/${filename}`
      try {
        const thumbnailBuffer = await sharp(fileBuffer)
          .resize(400, 400, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 80 })
          .toBuffer()

        const thumbnailParams = {
          Bucket: this.bucketName,
          Key: thumbnailFilename,
          Body: thumbnailBuffer,
          ContentType: 'image/jpeg'
        }

        await this.s3Client.send(new PutObjectCommand(thumbnailParams))
      } catch (error) {
        console.error('生成缩略图失败:', error)
        // 如果缩略图生成失败，使用原图作为缩略图
        thumbnailFilename = filename
      }

      // 生成短ID
      const shortId = this._generateShortId()
      
      // 添加到索引
      const imageInfo = {
        filename: filename,
        shortId: shortId,
        size: fileBuffer.length,
        uploadTime: new Date().toLocaleString('zh-CN')
      }
      this._addToIndex(imageInfo)

      return {
        url: this._getPublicUrl(filename, shortId),
        thumbnailUrl: this._getPublicUrl(thumbnailFilename, shortId),
        filename: filename,
        storageType: 'r2'
      }
    } catch (error) {
      console.error('R2 上传失败:', error)
      throw error
    }
  }

  async delete(filename) {
    try {
      // 删除原图
      await this.s3Client.send(new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: filename
      }))

      // 删除缩略图
      try {
        await this.s3Client.send(new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: `thumbnails/${filename}`
        }))
      } catch (error) {
        // 缩略图可能不存在，忽略错误
        console.warn('删除缩略图失败或缩略图不存在:', error.message)
      }

      // 从索引中删除
      this._removeFromIndex(filename)

      return true
    } catch (error) {
      console.error('R2 删除失败:', error)
      return false
    }
  }

  async list() {
    try {
      // 从索引文件读取图片列表
      const images = this._readIndex()
      
      // 生成带短链接的列表
      return images.map(item => ({
        filename: item.filename,
        url: this._getPublicUrl(item.filename, item.shortId),
        thumbnailUrl: this._getPublicUrl(`thumbnails/${item.filename}`, item.shortId),
        size: item.size || 0,
        uploadTime: item.uploadTime,
        storageType: 'r2'
      }))
    } catch (error) {
      console.error('R2 列表获取失败:', error)
      return []
    }
  }

  async isAvailable() {
    try {
      // 添加5秒超时检查
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('R2检查超时')), 5000)
      )
      
      const checkPromise = this.s3Client.send(new HeadBucketCommand({
        Bucket: this.bucketName
      }))
      
      await Promise.race([checkPromise, timeoutPromise])
      return true
    } catch (error) {
      if (error.message === 'R2检查超时') {
        console.error('R2 服务检查超时')
      } else {
        console.error('R2 服务不可用:', error)
      }
      return false
    }
  }

  /**
   * 获取文件内容（用于代理）
   */
  async getFile(filename) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: filename
      })
      const response = await this.s3Client.send(command)
      
      // 将流转换为 Buffer
      const chunks = []
      for await (const chunk of response.Body) {
        chunks.push(chunk)
      }
      
      return {
        buffer: Buffer.concat(chunks),
        contentType: response.ContentType,
        contentLength: response.ContentLength
      }
    } catch (error) {
      console.error('R2 获取文件失败:', error)
      throw error
    }
  }

  getName() {
    return 'r2'
  }
}

