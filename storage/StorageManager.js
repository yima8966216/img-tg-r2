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
   * 💡 加固说明：增加环境检查与初始化熔断，防止路径解析错误
   */
  static async initialize(config) {
    const manager = new StorageManager();
    // 规范化 BaseUrl，避免双斜杠
    const baseUrl = (config.baseUrl || '').replace(/\/$/, '');
    
    console.log('📦 [StorageManager] 正在初始化存储子系统...');

    // 1. 加载 Telegraph
    const tgCfg = config.telegraph;
    if (tgCfg && (tgCfg.enabled === true || tgCfg.enabled === 'true')) {
      if (tgCfg.botToken) {
        try {
          // 💡 确保将标准化的 baseUrl 传递给驱动
          manager.storages.set('telegraph', new TelegraphStorage({ ...tgCfg, baseUrl }));
          console.log('✅ Telegraph 存储驱动已成功挂载');
        } catch (err) {
          console.error('❌ Telegraph 驱动初始化异常:', err.message);
        }
      } else {
        console.warn('⚠️ Telegraph 配置缺少 botToken，跳过加载');
      }
    }

    // 2. 加载 Cloudflare R2
    const r2Cfg = config.r2;
    if (r2Cfg && (r2Cfg.enabled === true || r2Cfg.enabled === 'true')) {
      if (r2Cfg.accountId && r2Cfg.accessKeyId) {
        try {
          const r2FinalConfig = {
            ...r2Cfg,
            baseUrl: baseUrl,
            // 兼容性字段处理
            tgBotToken: r2Cfg.tgBotToken || r2Cfg.botToken,
            tgChatId: r2Cfg.tgChatId || r2Cfg.chatId
          };
          manager.storages.set('r2', new R2Storage(r2FinalConfig));
          console.log('✅ Cloudflare R2 存储驱动已成功挂载');
        } catch (err) {
          console.error('❌ Cloudflare R2 驱动初始化异常:', err.message);
        }
      } else {
        console.warn('⚠️ Cloudflare R2 配置不完整，跳过加载');
      }
    }

    // 3. 设置默认存储逻辑
    manager.defaultStorage = config.defaultStorage || 'telegraph';
    
    // 💡 熔断检查：如果没有驱动加载成功，输出严重警告
    if (manager.storages.size === 0) {
      console.error('🚨 [CRITICAL] 未能加载任何有效的存储驱动！请检查 config.json 是否挂载正确。');
    } else {
      console.log(`🚀 存储系统就绪，默认驱动: ${manager.defaultStorage}`);
    }

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
      try {
        // 调用每个驱动实现的 getStats()
        // 💡 这里增加一层保护，防止驱动内部 list 为空时抛错
        const storageStats = storage.getStats ? storage.getStats() : { count: 0, size: 0 }; 
        
        stats.storages[name] = {
          count: storageStats.count || 0,
          size: storageStats.size || 0
        };
        
        // 累加总数
        stats.totalCount += (storageStats.count || 0);
        stats.totalSize += (storageStats.size || 0);
      } catch (err) {
        console.error(`📊 [Stats] 获取 ${name} 统计失败:`, err.message);
        stats.storages[name] = { count: 0, size: 0 };
      }
    }

    return stats;
  }

  /**
   * 获取指定的存储驱动
   * @param {string} type 驱动名称 (all / telegraph / r2)
   */
  getStorage(type) {
    // 💡 如果是 'all' 逻辑，由 server.js 处理合并，此处返回默认驱动或第一个
    if (type === 'all' || !type) {
      return this.storages.get(this.defaultStorage) || this.storages.values().next().value;
    }

    let s = this.storages.get(type);
    
    // 💡 备选逻辑：如果请求的驱动未加载，尝试返回默认驱动
    if (!s) {
      console.warn(`⚠️ 请求的驱动 [${type}] 未就绪，自动回退至默认驱动 [${this.defaultStorage}]`);
      s = this.storages.get(this.defaultStorage);
    }
    
    // 💡 最终兜底：返回第一个可用的驱动
    if (!s && this.storages.size > 0) {
      s = this.storages.values().next().value;
    }
    
    return s;
  }

  /**
   * 获取当前所有已挂载的驱动列表
   */
  getAvailableStorages() {
    return Array.from(this.storages.keys());
  }

  /**
   * 💡 安全单例获取（可选，供外部快速访问实例）
   */
  static getInstance() {
    if (!global.storageManagerInstance) {
      console.error('❌ StorageManager 尚未初始化');
      return null;
    }
    return global.storageManagerInstance;
  }
}