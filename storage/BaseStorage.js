/**
 * 存储基类
 * 💡 严格执行：全量发送，绝不删减逻辑
 * 补全了统计接口，确保仪表盘数据链路畅通
 */
export class BaseStorage {
  constructor(config = {}) {
    this.config = config;
    this.enabled = config.enabled || false;
  }

  /**
   * 💡 核心补全：获取存储统计信息
   * 子类必须覆盖此方法，否则默认返回 0
   */
  getStats() {
    return {
      count: 0,
      size: 0
    };
  }

  /**
   * 上传文件
   */
  async upload(fileBuffer, filename, mimetype) {
    throw new Error('Method not implemented');
  }

  /**
   * 删除文件
   */
  async delete(filename) {
    throw new Error('Method not implemented');
  }

  /**
   * 获取文件列表
   */
  async list() {
    throw new Error('Method not implemented');
  }

  /**
   * 检查服务可用性 (测试连接的核心)
   */
  async isAvailable() {
    throw new Error('Method not implemented');
  }

  /**
   * 获取存储器名称
   */
  getName() {
    throw new Error('Method not implemented');
  }
}