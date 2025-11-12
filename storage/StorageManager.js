import { TelegraphStorage } from './TelegraphStorage.js'
import { R2Storage } from './R2Storage.js'

/**
 * 存储管理器
 * 负责管理和选择不同的存储服务
 * 支持 Telegraph 和 Cloudflare R2 存储
 */
export class StorageManager {
  constructor() {
    this.storages = new Map()
    this.defaultStorage = 'telegraph'
  }

  /**
   * 注册存储服务
   */
  registerStorage(name, storage) {
    this.storages.set(name, storage)
    console.log(`✅ 存储服务已注册: ${name}`)
  }

  /**
   * 设置默认存储服务
   */
  setDefaultStorage(name) {
    if (!this.storages.has(name)) {
      throw new Error(`存储服务 ${name} 未注册`)
    }
    this.defaultStorage = name
    console.log(`📦 默认存储服务设置为: ${name}`)
  }

  /**
   * 获取存储服务
   */
  getStorage(name) {
    if (!name) {
      name = this.defaultStorage
    }

    const storage = this.storages.get(name)
    if (!storage) {
      throw new Error(`存储服务 ${name} 不存在`)
    }

    return storage
  }

  /**
   * 获取所有可用的存储服务列表
   */
  getAvailableStorages() {
    return Array.from(this.storages.keys())
  }

  /**
   * 检查存储服务是否可用
   */
  async checkStorageAvailability(name) {
    const storage = this.storages.get(name)
    if (!storage) {
      return false
    }
    return await storage.isAvailable()
  }

  /**
   * 初始化所有存储服务
   */
  static async initialize(config = {}) {
    const manager = new StorageManager()

    // 初始化 Telegraph 存储
    try {
      const telegraphConfig = {
        botToken: config.telegraph?.botToken,
        chatId: config.telegraph?.chatId,
        baseUrl: config.baseUrl || ''
      }
      console.log('📱 Telegraph 配置:', {
        hasToken: !!telegraphConfig.botToken,
        chatId: telegraphConfig.chatId || '未配置'
      })
      manager.registerStorage('telegraph', new TelegraphStorage(telegraphConfig))
      if (telegraphConfig.botToken && telegraphConfig.chatId) {
        console.log('✅ Telegraph 存储已配置（Bot Token + Chat ID）')
      } else if (telegraphConfig.botToken) {
        console.log('⚠️  Telegraph 存储部分配置（缺少 Chat ID）')
      } else {
        console.log('ℹ️  Telegraph 存储未配置（需要 Bot Token 和 Chat ID）')
      }
    } catch (error) {
      console.error('Telegraph 存储初始化失败:', error)
    }

    // 初始化 R2 存储
    if (config.r2 && config.r2.accountId && config.r2.accessKeyId && config.r2.secretAccessKey && config.r2.bucketName) {
      try {
        manager.registerStorage('r2', new R2Storage(config.r2))
        console.log('✅ Cloudflare R2 存储已配置')
      } catch (error) {
        console.error('R2 存储初始化失败:', error)
      }
    } else {
      console.log('ℹ️  Cloudflare R2 存储未配置（需要完整的配置信息）')
    }

    // 设置默认存储
    const defaultStorage = config.defaultStorage || 'telegraph'
    if (manager.storages.has(defaultStorage)) {
      manager.setDefaultStorage(defaultStorage)
    } else {
      // 如果默认存储不可用，使用第一个可用的存储
      const availableStorages = manager.getAvailableStorages()
      if (availableStorages.length > 0) {
        manager.setDefaultStorage(availableStorages[0])
      } else {
        throw new Error('没有可用的存储服务，请配置 Telegraph 或 R2')
      }
    }

    return manager
  }
}

