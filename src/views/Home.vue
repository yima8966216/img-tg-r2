<template>
  <div class="home">
    <div class="content-container">
      <div class="page-title">
        <h1 class="title">
          <el-icon size="32"><Picture /></el-icon>
          图床上传
        </h1>
      </div>

      <UploadArea @uploaded="handleUploadSuccess" />

      <div v-if="recentUploads.length > 0" class="recent-uploads">
        <el-card class="glass-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <div class="header-left">
                <el-icon size="20"><Clock /></el-icon>
                <span>最近上传</span>
              </div>
              <el-button size="small" text @click="clearRecent" class="clear-btn">清空</el-button>
            </div>
          </template>

          <div class="recent-list">
            <div v-for="upload in recentUploads" :key="upload.filename" class="recent-item">
              <div class="recent-preview">
                <el-image 
                  :src="upload.url" 
                  :alt="upload.originalName" 
                  fit="cover" 
                  class="recent-image" 
                  :preview-src-list="[upload.url]"
                  preview-teleported
                >
                  <template #error>
                    <div class="image-error-slot">加载失败</div>
                  </template>
                </el-image>
              </div>

              <div class="recent-info-full">
                <div class="info-top-row">
                  <span class="recent-name" :title="upload.originalName">{{ upload.originalName }}</span>
                  <span class="recent-time">{{ upload.uploadTime }}</span>
                </div>

                <div class="links-display-grid">
                  <div class="link-input-group">
                    <el-input v-model="upload.url" readonly size="small">
                      <template #prepend><span class="link-label">URL</span></template>
                      <template #append>
                        <el-button @click="copyText(upload.url, 'URL')">复制</el-button>
                      </template>
                    </el-input>
                  </div>
                  
                  <div class="link-input-group">
                    <el-input :model-value="`![${upload.originalName}](${upload.url})`" readonly size="small">
                      <template #prepend><span class="link-label">Markdown</span></template>
                      <template #append>
                        <el-button @click="copyText(`![${upload.originalName}](${upload.url})`, 'Markdown')">复制</el-button>
                      </template>
                    </el-input>
                  </div>

                  <div class="link-input-group">
                    <el-input :model-value="`<img src='${upload.url}' alt='${upload.originalName}' />`" readonly size="small">
                      <template #prepend><span class="link-label">HTML</span></template>
                      <template #append>
                        <el-button @click="copyText(`<img src='${upload.url}' alt='${upload.originalName}' />`, 'HTML')">复制</el-button>
                      </template>
                    </el-input>
                  </div>

                  <div class="link-input-group">
                    <el-input :model-value="`[img]${upload.url}[/img]`" readonly size="small">
                      <template #prepend><span class="link-label">BBCode</span></template>
                      <template #append>
                        <el-button @click="copyText(`[img]${upload.url}[/img]`, 'BBCode')">复制</el-button>
                      </template>
                    </el-input>
                  </div>
                </div>
              </div>

              <div class="recent-actions">
                <el-button size="small" type="primary" link @click="downloadFile(upload.url, upload.originalName)">下载</el-button>
              </div>
            </div>
          </div>
        </el-card>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Picture, Clock } from '@element-plus/icons-vue'
import UploadArea from '../components/UploadArea.vue'

const recentUploads = ref([])

const handleUploadSuccess = uploadData => {
  if (uploadData) {
    recentUploads.value.unshift(uploadData)
    if (recentUploads.value.length > 5) {
      recentUploads.value = recentUploads.value.slice(0, 5)
    }
  }
}

const copyText = async (text, typeLabel) => {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(`${typeLabel} 已复制`)
  } catch (err) {
    const input = document.createElement('textarea')
    input.value = text
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
    ElMessage.success(`${typeLabel} 已复制`)
  }
}

const downloadFile = (url, name) => {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.target = '_blank'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

const clearRecent = () => {
  recentUploads.value = []
  ElMessage.success('已清空最近记录')
}
</script>

<style scoped>
/* 💡 背景：大格子工程制图风格 */
.home {
  min-height: 100vh;
  background-color: #fcfcfc;
  background-image: 
    linear-gradient(#f1f1f1 1.5px, transparent 1.5px),
    linear-gradient(90deg, #f1f1f1 1.5px, transparent 1.5px),
    linear-gradient(#f9f9f9 1px, transparent 1px),
    linear-gradient(90deg, #f9f9f9 1px, transparent 1px);
  background-size: 60px 60px, 60px 60px, 12px 12px, 12px 12px;
}

.content-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 40px 20px;
}

.page-title {
  text-align: center;
  margin-bottom: 40px;
}

.title {
  font-size: 2.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-weight: 700;
  color: #409eff;
  text-shadow: 0 2px 4px rgba(255,255,255,0.8);
}

/* 💡 下方展示区域磨砂化 */
.glass-card {
  background-color: rgba(255, 255, 255, 0.8) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  color: #303133;
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

/* 💡 最近上传单项交互 */
.recent-item {
  display: flex;
  align-items: flex-start;
  gap: 15px;
  padding: 15px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.5);
  transition: all 0.3s ease;
}

.recent-item:hover {
  background: rgba(255, 255, 255, 1);
  border-color: #409eff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}

.recent-preview {
  flex-shrink: 0;
}

.recent-image {
  width: 90px;
  height: 90px;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
}

.image-error-slot {
  width: 90px;
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  color: #c0c4cc;
  font-size: 12px;
  border-radius: 8px;
}

.recent-info-full {
  flex: 1;
  min-width: 0;
}

.info-top-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.recent-name {
  font-weight: 700;
  color: #303133;
  font-size: 14px;
}

.recent-time {
  font-size: 11px;
  color: #999;
}

.links-display-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.link-label {
  font-size: 11px;
  color: #666;
  width: 60px;
  display: inline-block;
  text-align: center;
}

/* 适配输入框内部样式 */
:deep(.el-input__wrapper) {
  background-color: rgba(255, 255, 255, 0.8);
}

@media (max-width: 768px) {
  .recent-item { flex-direction: column; align-items: center; }
  .links-display-grid { grid-template-columns: 1fr; width: 100%; }
}
</style>