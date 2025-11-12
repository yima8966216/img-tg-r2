<template>
  <div class="admin-page">
    <div class="admin-container">
      <!-- 统计信息 -->
      <div class="stats-section">
        <el-row :gutter="20">
          <el-col :xs="24" :sm="6">
            <el-card class="stat-card" shadow="hover">
              <div class="stat-content">
                <div class="stat-icon total-images">
                  <el-icon size="32"><PictureRounded /></el-icon>
                </div>
                <div class="stat-info">
                  <div class="stat-number">{{ stats.totalImages || 0 }}</div>
                  <div class="stat-label">总图片数</div>
                </div>
              </div>
            </el-card>
          </el-col>
          <el-col :xs="24" :sm="6">
            <el-card class="stat-card" shadow="hover">
              <div class="stat-content">
                <div class="stat-icon total-size">
                  <el-icon size="32"><FolderOpened /></el-icon>
                </div>
                <div class="stat-info">
                  <div class="stat-number">{{ formatFileSize(stats.totalSize || 0) }}</div>
                  <div class="stat-label">总存储空间</div>
                </div>
              </div>
            </el-card>
          </el-col>
          <el-col :xs="24" :sm="6">
            <el-card class="stat-card" shadow="hover">
              <div class="stat-content">
                <div class="stat-icon telegraph-storage">
                  <el-icon size="32"><ChatDotRound /></el-icon>
                </div>
                <div class="stat-info">
                  <div class="stat-number">{{ stats.storageStats?.telegraph?.count || 0 }} 张</div>
                  <div class="stat-label">Telegraph</div>
                  <div class="stat-sublabel">{{ formatFileSize(stats.storageStats?.telegraph?.size || 0) }}</div>
                </div>
              </div>
            </el-card>
          </el-col>
          <el-col :xs="24" :sm="6">
            <el-card class="stat-card" shadow="hover">
              <div class="stat-content">
                <div class="stat-icon r2-storage">
                  <el-icon size="32"><Box /></el-icon>
                </div>
                <div class="stat-info">
                  <div class="stat-number">{{ stats.storageStats?.r2?.count || 0 }} 张</div>
                  <div class="stat-label">R2 存储</div>
                  <div class="stat-sublabel">{{ formatFileSize(stats.storageStats?.r2?.size || 0) }}</div>
                </div>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </div>

      <!-- 存储配置 -->
      <div class="storage-config-section">
        <StorageConfig />
      </div>

      <!-- 图片管理 -->
      <div class="images-management">
        <AdminImageGallery @stats-updated="loadStats" />
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting, PictureRounded, FolderOpened, Monitor, Box, ChatDotRound } from '@element-plus/icons-vue'
import { adminAPI } from '../utils/api'
import AdminImageGallery from '../components/AdminImageGallery.vue'
import StorageConfig from '../components/StorageConfig.vue'

const stats = ref({})

// 加载统计信息
const loadStats = async () => {
  try {
    const response = await adminAPI.getStats()
    if (response.success) {
      stats.value = response.data
    }
  } catch (error) {
    console.error('加载统计信息失败:', error)
  }
}

// 格式化文件大小
const formatFileSize = bytes => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

onMounted(() => {
  loadStats()
})
</script>

<style scoped>
.admin-page {
  min-height: calc(100vh - 60px);
  background: #fafbfc;
  padding: 20px;
}

.admin-container {
  max-width: 1200px;
  margin: 0 auto;
}

.stats-section {
  margin-bottom: 30px;
}

.stat-card {
  height: 120px;
  display: flex;
  align-items: center;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.stat-icon.total-images {
  background: #409eff;
}

.stat-icon.total-size {
  background: #67c23a;
}

.stat-icon.server-status {
  background: #e6a23c;
}

.stat-icon.telegraph-storage {
  background: #409eff;
}

.stat-icon.r2-storage {
  background: #f56c6c;
}

.stat-info {
  flex: 1;
}

.stat-number {
  font-size: 1.8rem;
  font-weight: 700;
  color: #303133;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 0.9rem;
  color: #909399;
}

.stat-sublabel {
  font-size: 0.8rem;
  color: #67c23a;
  margin-top: 2px;
}

.storage-config-section {
  margin-bottom: 30px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #409eff;
}

.images-management {
  margin-bottom: 30px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .admin-page {
    padding: 10px;
  }

  .stat-card {
    margin-bottom: 15px;
    height: 100px;
  }

  .stat-icon {
    width: 50px;
    height: 50px;
  }

  .stat-number {
    font-size: 1.5rem;
  }
}

/* 全局样式 - 提高弹出框层级 */
:deep(.admin-popconfirm) {
  z-index: 9999 !important;
}

:deep(.el-popper) {
  z-index: 9999 !important;
}
</style>
