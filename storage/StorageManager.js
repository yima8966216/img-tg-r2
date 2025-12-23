import { TelegraphStorage } from './TelegraphStorage.js';
import { R2Storage } from './R2Storage.js';

/**
 * 存储管理器
 * 💡 100% 完整全量：确保 getStoragesStats 汇总逻辑与前端 Dashboard 强对齐
 */
export class StorageManager {
  constructor() {
    this.storages = new Map();
    this.defaultStorage = 'telegraph';
  }

  /**
   * 初始化所有驱动
   */
  static async initialize(config) {
    const manager = new StorageManager();
    const baseUrl = (config.baseUrl || '').replace(/\/$/, '');
    
    // 1. 加载 Telegraph
    if (config.telegraph && (config.telegraph.enabled === true || config.telegraph.enabled === 'true')) {
      if (config.telegraph.botToken) {
        manager.storages.set('telegraph', new TelegraphStorage({ ...config.telegraph, baseUrl }));
        console.log('✅ Telegraph 存储驱动已加载');
      }
    }

    // 2. 加载 Cloudflare R2
    if (config.r2 && (config.r2.enabled === true || config.r2.enabled === 'true')) {
      if (config.r2.accountId && config.r2.accessKeyId) {
        const r2Config = {
          ...config.r2,
          baseUrl: baseUrl,
          tgBotToken: config.r2.tgBotToken || config.r2.botToken,
          tgChatId: config.r2.tgChatId || config.r2.chatId
        };
        manager.storages.set('r2', new R2Storage(r2Config));
        console.log('✅ Cloudflare R2 存储驱动已加载');
      }
    }

    manager.defaultStorage = config.defaultStorage || 'telegraph';
    return manager;
  }

  /**
   * 💡 仪表盘数据核心来源
   * 汇总所有驱动的 count 和 size
   */
  getStoragesStats() {
    const stats = {
      totalCount: 0,
      totalSize: 0,
      storages: {}
    };

    for (const [name, storage] of this.storages.entries()) {
      // 调用每个驱动实现的 getStats()
      const storageStats = storage.getStats ? storage.getStats() : { count: 0, size: 0 }; 
      stats.storages[name] = storageStats;
      
      // 累加总数
      stats.totalCount += (storageStats.count || 0);
      stats.totalSize += (storageStats.size || 0);
    }

    return stats;
  }

  getStorage(type) {
    let s = this.storages.get(type);
    if (!s) s = this.storages.get(this.defaultStorage);
    if (!s && this.storages.size > 0) s = this.storages.values().next().value;
    return s;
  }

  getAvailableStorages() {
    return Array.from(this.storages.keys());
  }
}