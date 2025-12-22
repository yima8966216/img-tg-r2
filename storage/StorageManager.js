import { TelegraphStorage } from './TelegraphStorage.js';
import { R2Storage } from './R2Storage.js';

/**
 * 存储管理器：负责根据配置动态加载不同的存储驱动
 * 💡 100% 完整逻辑：补全了后台统计所需的 getStoragesStats 函数
 */
export class StorageManager {
  constructor() {
    this.storages = new Map();
    this.defaultStorage = 'telegraph';
  }

  /**
   * 💡 核心初始化逻辑
   * @param {Object} config 完整的全局配置对象
   */
  static async initialize(config) {
    const manager = new StorageManager();
    const baseUrl = (config.baseUrl || '').replace(/\/$/, '');
    
    // --- 1. 加载 Telegraph 驱动 ---
    if (config.telegraph && (config.telegraph.enabled === true || config.telegraph.enabled === 'true')) {
      if (config.telegraph.botToken) {
        // 传入配置并注入 baseUrl
        manager.storages.set('telegraph', new TelegraphStorage({ 
          ...config.telegraph, 
          baseUrl 
        }));
        console.log('✅ Telegraph 存储驱动已加载');
      } else {
        console.warn('⚠️ Telegraph 驱动加载跳过：缺少 botToken');
      }
    }

    // --- 2. 加载 Cloudflare R2 驱动 ---
    if (config.r2 && (config.r2.enabled === true || config.r2.enabled === 'true')) {
      if (config.r2.accountId && config.r2.accessKeyId) {
        /**
         * 💡 关键修复：确保 TG 参数在 R2 初始化时被正确传递
         * 兼容 tgBotToken 和 botToken 两种写法
         */
        const r2Config = {
          ...config.r2,
          baseUrl: baseUrl,
          // 强制对齐通知所需的参数
          tgBotToken: config.r2.tgBotToken || config.r2.botToken || (config.telegraph ? config.telegraph.botToken : null),
          tgChatId: config.r2.tgChatId || config.r2.chatId || (config.telegraph ? config.telegraph.chatId : null)
        };

        manager.storages.set('r2', new R2Storage(r2Config));
        console.log('✅ Cloudflare R2 存储驱动已加载 (已注入通知参数)');
      } else {
        console.warn('⚠️ Cloudflare R2 驱动加载跳过：缺少关键 API 密钥');
      }
    }

    // 设置默认驱动
    manager.defaultStorage = config.defaultStorage || 'telegraph';
    
    // 如果没有任何驱动加载成功，给出警告
    if (manager.storages.size === 0) {
      console.error('❌ 警告：没有任何存储驱动加载成功，请检查 config.json');
    }

    return manager;
  }

  /**
   * 💡 核心修复：获取所有存储驱动的统计数据
   * 解决后台管理页面显示“0”数据的 Bug
   */
  getStoragesStats() {
    const stats = {
      totalCount: 0,
      totalSize: 0,
      storages: {}
    };

    for (const [name, storage] of this.storages.entries()) {
      // 这里的 stats() 必须在对应的驱动类中实现
      const storageStats = storage.getStats(); 
      stats.storages[name] = storageStats;
      stats.totalCount += storageStats.count || 0;
      stats.totalSize += storageStats.size || 0;
    }

    return stats;
  }

  /**
   * 根据类型获取存储驱动实例
   */
  getStorage(type) {
    let s = this.storages.get(type);
    if (!s) {
      // 如果指定类型没找到，尝试返回默认存储
      s = this.storages.get(this.defaultStorage);
    }
    // 如果默认存储也没找到，返回 Map 中的第一个（作为保底）
    if (!s && this.storages.size > 0) {
      s = this.storages.values().next().value;
    }
    return s;
  }

  /**
   * 获取所有已加载的驱动名称
   */
  getAvailableStorages() {
    return Array.from(this.storages.keys());
  }
}