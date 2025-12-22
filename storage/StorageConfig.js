import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class StorageConfig {
  constructor() {
    this.configDir = path.join(__dirname, '..', 'data')
    this.configFile = path.join(this.configDir, 'storage-config.json')
    this.config = this.loadConfig()
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf8')
        const loaded = JSON.parse(data)
        if (!loaded.isolation) loaded.isolation = { enabled: false, domains: '' }
        return loaded
      }
    } catch (e) {}
    return this.getDefaultConfig()
  }

  getDefaultConfig() {
    return {
      defaultStorage: 'telegraph',
      telegraph: { enabled: false, botToken: '', chatId: '' },
      r2: { enabled: false, accountId: '', accessKeyId: '', secretAccessKey: '', bucketName: '', publicDomain: '' },
      isolation: { enabled: false, domains: '' }
    }
  }

  saveConfig(newConfig) {
    try {
      if (!fs.existsSync(this.configDir)) fs.mkdirSync(this.configDir, { recursive: true })
      this.config = newConfig
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf8')
      return { success: true, message: 'Saved' }
    } catch (e) { return { success: false, message: e.message } }
  }

  getConfig(full = false) {
    if (full) return this.config
    return {
      defaultStorage: this.config.defaultStorage,
      telegraph: { ...this.config.telegraph, botToken: this.config.telegraph?.botToken ? '***' : '' },
      r2: { ...this.config.r2, accessKeyId: this.config.r2?.accessKeyId ? '***' : '', secretAccessKey: this.config.r2?.secretAccessKey ? '***' : '' },
      isolation: this.config.isolation
    }
  }

  /**
   * 💡 关键修复：支持 global 类型，解决无法切换默认存储的问题
   */
  updateStorageConfig(type, data) {
    if (type === 'global') {
      this.config = { ...this.config, ...data }
    } else {
      const oldConfig = this.config[type] || {}
      const newConfig = { ...data }
      if (type === 'r2') {
        if (newConfig.accessKeyId === '***') newConfig.accessKeyId = oldConfig.accessKeyId
        if (newConfig.secretAccessKey === '***') newConfig.secretAccessKey = oldConfig.secretAccessKey
      }
      if (type === 'telegraph' && newConfig.botToken === '***') newConfig.botToken = oldConfig.botToken
      this.config[type] = newConfig
    }
    return this.saveConfig(this.config)
  }
}