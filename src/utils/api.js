import axios from 'axios'
import { ElMessage } from 'element-plus'

// 创建axios实例
const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

// 请求拦截器
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  response => {
    return response.data
  },
  error => {
    const message = error.response?.data?.message || '网络错误'
    ElMessage.error(message)

    // 如果是401错误，清除token并跳转到登录页
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token')
      window.location.href = '/login'
    }

    return Promise.reject(error)
  }
)

// API方法
export const imageAPI = {
  // 上传图片
  uploadImage(file, storageType = 'local') {
    const formData = new FormData()
    formData.append('image', file)
    formData.append('storageType', storageType)
    return api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  },

  // 获取图片列表
  getImages(storageType = 'local') {
    return api.get('/images', {
      params: { storageType }
    })
  },

  // 删除图片
  deleteImage(filename, storageType = 'local') {
    return api.delete(`/images/${filename}`, {
      params: { storageType }
    })
  },

  // 获取可用的存储服务列表
  getAvailableStorages() {
    return api.get('/storage/available')
  }
}

export const adminAPI = {
  // 管理员登录
  login(username, password) {
    return api.post('/admin/login', { username, password })
  },

  // 验证token
  verifyToken() {
    return api.get('/admin/verify')
  },

  // 获取统计信息
  getStats() {
    return api.get('/admin/stats')
  },

  // 管理员删除图片
  deleteImage(filename, storageType = 'local') {
    return api.delete(`/admin/images/${filename}`, {
      params: { storageType }
    })
  },

  // 清空所有图片
  clearAllImages() {
    return api.delete('/admin/images')
  },

  // 获取存储配置
  getStorageConfig() {
    return api.get('/admin/storage/config')
  },

  // 获取完整存储配置（包含敏感信息）
  getFullStorageConfig() {
    return api.get('/admin/storage/config/full')
  },
  
  // 别名方法
  getStorageConfigFull() {
    return this.getFullStorageConfig()
  },

  // 更新存储配置
  updateStorageConfig(storageType, config) {
    return api.post('/admin/storage/config', { storageType, config })
  },

  // 设置默认存储
  setDefaultStorage(storageType) {
    return api.post('/admin/storage/default', { storageType })
  },

  // 测试存储连接
  testStorage(storageType) {
    return api.post('/admin/storage/test', { storageType })
  },
  
  // 测试存储连接（带配置）
  testStorageConnection(storageType, config) {
    return api.post('/admin/storage/test', { storageType, config })
  }
}

export default api
