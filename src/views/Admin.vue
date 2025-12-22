<template>
  <div class="admin-page">
    <div class="admin-container">
      <div class="stats-section">
        <el-row :gutter="20">
          <el-col :xs="24" :sm="6">
            <el-card class="stat-card glass-card" shadow="hover">
              <div class="stat-content">
                <div class="stat-icon total-images">
                  <el-icon size="28"><PictureRounded /></el-icon>
                </div>
                <div class="stat-info">
                  <div class="stat-number">{{ stats.totalImages || 0 }}</div>
                  <div class="stat-label">总图片数</div>
                </div>
              </div>
            </el-card>
          </el-col>
          <el-col :xs="24" :sm="6">
            <el-card class="stat-card glass-card" shadow="hover">
              <div class="stat-content">
                <div class="stat-icon total-size">
                  <el-icon size="28"><FolderOpened /></el-icon>
                </div>
                <div class="stat-info">
                  <div class="stat-number">{{ formatFileSize(stats.totalSize || 0) }}</div>
                  <div class="stat-label">存储空间</div>
                </div>
              </div>
            </el-card>
          </el-col>
          <el-col :xs="24" :sm="6">
            <el-card class="stat-card glass-card" shadow="hover">
              <div class="stat-content">
                <div class="stat-icon telegraph-storage">
                  <el-icon size="28"><ChatDotRound /></el-icon>
                </div>
                <div class="stat-info">
                  <div class="stat-number">{{ stats.storageStats?.telegraph?.count || 0 }}</div>
                  <div class="stat-label">TG 存储</div>
                </div>
              </div>
            </el-card>
          </el-col>
          <el-col :xs="24" :sm="6">
            <el-card class="stat-card glass-card" shadow="hover">
              <div class="stat-content">
                <div class="stat-icon r2-storage">
                  <el-icon size="28"><Box /></el-icon>
                </div>
                <div class="stat-info">
                  <div class="stat-number">{{ stats.storageStats?.r2?.count || 0 }}</div>
                  <div class="stat-label">R2 存储</div>
                </div>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </div>

      <div class="glass-wrapper">
        <StorageConfig />
      </div>

      <div class="glass-wrapper" style="margin-top: 30px">
        <AdminImageGallery @stats-updated="loadStats" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminAPI } from '../utils/api'
import AdminImageGallery from '../components/AdminImageGallery.vue'
import StorageConfig from '../components/StorageConfig.vue'
import { PictureRounded, FolderOpened, Box, ChatDotRound } from '@element-plus/icons-vue'

const stats = ref({})
const loadStats = async () => {
  try {
    const res = await adminAPI.getStats()
    if (res.success) stats.value = res.data
  } catch (e) { console.error(e) }
}
const formatFileSize = b => {
  if (b === 0) return '0 B'
  const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
onMounted(() => loadStats())
</script>

<style scoped>
.admin-page {
  min-height: 100vh;
  padding: 30px 20px;
  background-color: #fcfcfc;
  background-image: 
    linear-gradient(#f1f1f1 1.5px, transparent 1.5px),
    linear-gradient(90deg, #f1f1f1 1.5px, transparent 1.5px),
    linear-gradient(#f9f9f9 1px, transparent 1px),
    linear-gradient(90deg, #f9f9f9 1px, transparent 1px);
  background-size: 60px 60px, 60px 60px, 12px 12px, 12px 12px;
}

.admin-container { max-width: 1200px; margin: 0 auto; }
.stats-section { margin-bottom: 30px; }

.glass-card {
  background-color: rgba(255, 255, 255, 0.8) !important;
  backdrop-filter: blur(12px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
}

.glass-card:hover {
  border-color: rgba(64, 158, 255, 0.4);
  transform: translateY(-3px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08);
}

/* 深度渗透子组件卡片样式 */
.glass-wrapper :deep(.el-card) {
  background-color: rgba(255, 255, 255, 0.8) !important;
  backdrop-filter: blur(12px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.5);
}

.stat-card { height: 110px; display: flex; align-items: center; }
.stat-content { display: flex; align-items: center; gap: 15px; width: 100%; }
.stat-icon { width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; }

.stat-icon.total-images { background: #409eff; }
.stat-icon.total-size { background: #67c23a; }
.stat-icon.telegraph-storage { background: #409eff; opacity: 0.8; }
.stat-icon.r2-storage { background: #f56c6c; }

.stat-number { font-size: 1.6rem; font-weight: 800; color: #303133; }
.stat-label { font-size: 0.8rem; color: #909399; font-weight: 600; }

@media (max-width: 768px) {
  .stat-card { margin-bottom: 15px; }
}
</style>