/**
 * 存储服务抽象基类
 * 所有存储服务都应该继承此类并实现其方法
 */
export class BaseStorage {
  constructor(config = {}) {
    this.config = config
  }

  /**
   * 上传文件
   * @param {Buffer} fileBuffer - 文件缓冲区
   * @param {string} filename - 文件名
   * @param {string} mimetype - 文件MIME类型
   * @returns {Promise<{url: string, filename: string}>} 上传后的URL和文件名
   */
  async upload(fileBuffer, filename, mimetype) {
    throw new Error('upload 方法必须被子类实现')
  }

  /**
   * 删除文件
   * @param {string} filename - 文件名
   * @returns {Promise<boolean>} 是否删除成功
   */
  async delete(filename) {
    throw new Error('delete 方法必须被子类实现')
  }

  /**
   * 获取文件列表
   * @returns {Promise<Array>} 文件列表
   */
  async list() {
    throw new Error('list 方法必须被子类实现')
  }

  /**
   * 检查存储服务是否可用
   * @returns {Promise<boolean>} 是否可用
   */
  async isAvailable() {
    return true
  }

  /**
   * 获取存储服务名称
   * @returns {string} 存储服务名称
   */
  getName() {
    return 'BaseStorage'
  }
}

