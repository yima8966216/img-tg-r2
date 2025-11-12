import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 存储配置管理
 */
export class StorageConfig {
  constructor() {
    this.configFile = path.join(__dirname, '..', 'storage-config.json')
    this.config = this.loadConfig()
  }

  /**
   * 加载配置
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf8')
        return JSON.parse(data)
      }
    } catch (error) {
      console.error('加载存储配置失败:', error)
    }

    // 返回默认配置
    return this.getDefaultConfig()
  }

  /**
   * 获取默认配置
   */
  getDefaultConfig() {
    return {
      defaultStorage: process.env.DEFAULT_STORAGE || 'telegraph',
      telegraph: {
        enabled: false,
        botToken: process.env.TG_BOT_TOKEN || '',
        chatId: process.env.TG_CHAT_ID || ''
      },
      r2: {
        enabled: false,
        accountId: process.env.R2_ACCOUNT_ID || '',
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        bucketName: process.env.R2_BUCKET_NAME || '',
        publicDomain: process.env.R2_PUBLIC_DOMAIN || ''
      }
    }
  }

  /**
   * 保存配置
   */
  saveConfig(newConfig) {
    try {
      // 合并配置
      this.config = {
        ...this.config,
        ...newConfig
      }

      // 写入文件
      fs.writeFileSync(
        this.configFile,
        JSON.stringify(this.config, null, 2),
        'utf8'
      )

      return { success: true, message: '配置保存成功' }
    } catch (error) {
      console.error('保存存储配置失败:', error)
      return { success: false, message: '配置保存失败: ' + error.message }
    }
  }

  /**
   * 获取配置（脱敏）
   */
  getConfig(includeSensitive = false) {
    if (includeSensitive) {
      return this.config
    }

    // 不包含敏感信息
    return {
      defaultStorage: this.config.defaultStorage,
      telegraph: {
        enabled: this.config.telegraph?.enabled || false,
        botToken: this.config.telegraph?.botToken ? '***已配置***' : '',
        chatId: this.config.telegraph?.chatId || ''
      },
      r2: {
        enabled: this.config.r2?.enabled || false,
        accountId: this.config.r2?.accountId || '',
        accessKeyId: this.config.r2?.accessKeyId ? '***已配置***' : '',
        secretAccessKey: this.config.r2?.secretAccessKey ? '***已配置***' : '',
        bucketName: this.config.r2?.bucketName || '',
        publicDomain: this.config.r2?.publicDomain || ''
      }
    }
  }

  /**
   * 更新特定存储的配置
   */
  updateStorageConfig(storageType, config) {
    if (!this.config[storageType]) {
      return { success: false, message: '不支持的存储类型' }
    }

    this.config[storageType] = {
      ...this.config[storageType],
      ...config
    }

    return this.saveConfig(this.config)
  }

  /**
   * 设置默认存储
   */
  setDefaultStorage(storageType) {
    const validTypes = ['telegraph', 'r2']
    if (!validTypes.includes(storageType)) {
      return { success: false, message: '无效的存储类型' }
    }

    this.config.defaultStorage = storageType
    return this.saveConfig(this.config)
  }

  /**
   * 验证配置
   */
  validateConfig(storageType, config) {
    switch (storageType) {
      case 'telegraph':
        if (!config.botToken) {
          return { valid: false, message: 'Bot Token 不能为空' }
        }
        if (!config.botToken.match(/^\d+:[A-Za-z0-9_-]+$/)) {
          return { valid: false, message: 'Bot Token 格式不正确' }
        }
        if (!config.chatId) {
          return { valid: false, message: 'Chat ID 不能为空' }
        }
        break

      case 'r2':
        if (!config.accountId) {
          return { valid: false, message: 'Account ID 不能为空' }
        }
        if (!config.accessKeyId) {
          return { valid: false, message: 'Access Key ID 不能为空' }
        }
        if (!config.secretAccessKey) {
          return { valid: false, message: 'Secret Access Key 不能为空' }
        }
        if (!config.bucketName) {
          return { valid: false, message: 'Bucket Name 不能为空' }
        }
        break
    }

    return { valid: true }
  }

  /**
   * 重置配置为默认值
   */
  resetConfig() {
    this.config = this.getDefaultConfig()
    return this.saveConfig(this.config)
  }
}

