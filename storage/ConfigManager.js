import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 存储配置管理器
 * 负责管理存储服务的配置信息
 */
export class ConfigManager {
  constructor(configPath) {
    this.configPath = configPath || path.join(__dirname, '..', 'config', 'storage-config.json')
    this.config = this.loadConfig()
    this.encryptionKey = process.env.CONFIG_ENCRYPTION_KEY || this.generateKey()
  }

  /**
   * 生成加密密钥
   */
  generateKey() {
    return crypto.randomBytes(32).toString('hex')
  }

  /**
   * 加密敏感信息
   */
  encrypt(text) {
    try {
      const algorithm = 'aes-256-cbc'
      const key = Buffer.from(this.encryptionKey.slice(0, 32))
      const iv = crypto.randomBytes(16)
      const cipher = crypto.createCipheriv(algorithm, key, iv)
      let encrypted = cipher.update(text, 'utf8', 'hex')
      encrypted += cipher.final('hex')
      return iv.toString('hex') + ':' + encrypted
    } catch (error) {
      console.error('加密失败:', error)
      return text
    }
  }

  /**
   * 解密敏感信息
   */
  decrypt(text) {
    try {
      const algorithm = 'aes-256-cbc'
      const key = Buffer.from(this.encryptionKey.slice(0, 32))
      const parts = text.split(':')
      const iv = Buffer.from(parts[0], 'hex')
      const encryptedText = parts[1]
      const decipher = crypto.createDecipheriv(algorithm, key, iv)
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      return decrypted
    } catch (error) {
      console.error('解密失败:', error)
      return text
    }
  }

  /**
   * 加载配置
   */
  loadConfig() {
    try {
      // 确保配置目录存在
      const configDir = path.dirname(this.configPath)
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      // 如果配置文件不存在，返回默认配置
      if (!fs.existsSync(this.configPath)) {
        return this.getDefaultConfig()
      }

      const data = fs.readFileSync(this.configPath, 'utf8')
      const config = JSON.parse(data)
      
      // 解密敏感信息
      if (config.telegraph && config.telegraph.botToken) {
        config.telegraph.botToken = this.decrypt(config.telegraph.botToken)
      }
      if (config.r2) {
        if (config.r2.accessKeyId) config.r2.accessKeyId = this.decrypt(config.r2.accessKeyId)
        if (config.r2.secretAccessKey) config.r2.secretAccessKey = this.decrypt(config.r2.secretAccessKey)
      }

      return config
    } catch (error) {
      console.error('加载配置失败:', error)
      return this.getDefaultConfig()
    }
  }

  /**
   * 保存配置
   */
  saveConfig(config) {
    try {
      // 加密敏感信息
      const encryptedConfig = JSON.parse(JSON.stringify(config))
      
      if (encryptedConfig.telegraph && encryptedConfig.telegraph.botToken) {
        encryptedConfig.telegraph.botToken = this.encrypt(encryptedConfig.telegraph.botToken)
      }
      if (encryptedConfig.r2) {
        if (encryptedConfig.r2.accessKeyId) {
          encryptedConfig.r2.accessKeyId = this.encrypt(encryptedConfig.r2.accessKeyId)
        }
        if (encryptedConfig.r2.secretAccessKey) {
          encryptedConfig.r2.secretAccessKey = this.encrypt(encryptedConfig.r2.secretAccessKey)
        }
      }

      // 确保配置目录存在
      const configDir = path.dirname(this.configPath)
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      fs.writeFileSync(this.configPath, JSON.stringify(encryptedConfig, null, 2), 'utf8')
      this.config = config
      return true
    } catch (error) {
      console.error('保存配置失败:', error)
      return false
    }
  }

  /**
   * 获取默认配置
   */
  getDefaultConfig() {
    return {
      defaultStorage: 'local',
      local: {
        enabled: true
      },
      telegraph: {
        enabled: false,
        botToken: ''
      },
      r2: {
        enabled: false,
        accountId: '',
        accessKeyId: '',
        secretAccessKey: '',
        bucketName: '',
        publicDomain: ''
      }
    }
  }

  /**
   * 获取配置
   */
  getConfig() {
    return this.config
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig) {
    // 合并配置
    this.config = {
      ...this.config,
      ...newConfig
    }
    return this.saveConfig(this.config)
  }

  /**
   * 获取存储配置（不包含敏感信息）
   */
  getPublicConfig() {
    const config = JSON.parse(JSON.stringify(this.config))
    
    // 隐藏敏感信息
    if (config.telegraph && config.telegraph.botToken) {
      config.telegraph.botToken = config.telegraph.botToken ? '******' : ''
    }
    if (config.r2) {
      if (config.r2.accessKeyId) config.r2.accessKeyId = config.r2.accessKeyId ? '******' : ''
      if (config.r2.secretAccessKey) config.r2.secretAccessKey = config.r2.secretAccessKey ? '******' : ''
    }

    return config
  }

  /**
   * 重置配置为默认值
   */
  resetConfig() {
    this.config = this.getDefaultConfig()
    return this.saveConfig(this.config)
  }

  /**
   * 从环境变量加载配置
   */
  loadFromEnv() {
    const config = this.getDefaultConfig()

    // 默认存储
    if (process.env.DEFAULT_STORAGE) {
      config.defaultStorage = process.env.DEFAULT_STORAGE
    }

    // Telegraph 配置
    if (process.env.TG_BOT_TOKEN) {
      config.telegraph.enabled = true
      config.telegraph.botToken = process.env.TG_BOT_TOKEN
    }

    // R2 配置
    if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && 
        process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME) {
      config.r2.enabled = true
      config.r2.accountId = process.env.R2_ACCOUNT_ID
      config.r2.accessKeyId = process.env.R2_ACCESS_KEY_ID
      config.r2.secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
      config.r2.bucketName = process.env.R2_BUCKET_NAME
      config.r2.publicDomain = process.env.R2_PUBLIC_DOMAIN || ''
    }

    this.config = config
    return config
  }
}

