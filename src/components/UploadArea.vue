<template>
  <div class="upload-section">
    <el-card class="upload-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <el-icon size="20"><Upload /></el-icon>
          <span>图片上传</span>
        </div>
      </template>

      <div class="storage-selector">
        <el-text class="storage-label">存储方式：</el-text>
        <el-radio-group v-model="selectedStorage" size="small">
          <el-radio-button v-for="storage in availableStorages" :key="storage.value" :value="storage.value">
            {{ storage.label }}
          </el-radio-button>
        </el-radio-group>
        <el-tag v-if="selectedStorage === 'r2'" size="small" type="warning" style="margin-left: 10px">R2 活动中</el-tag>
      </div>

      <div 
        class="upload-area" 
        :class="{ 'is-dragover': isDragover }" 
        @dragover.prevent="handleDragOver" 
        @dragleave.prevent="handleDragLeave" 
        @drop.prevent="handleDrop" 
        @click="selectFiles"
        @paste="handlePaste"
        tabindex="0"
      >
        <div class="upload-content">
          <el-icon size="64" class="upload-icon">
            <UploadFilled />
          </el-icon>
          <div class="upload-text">
            <p class="primary-text">点击、拖拽或 <b>Ctrl + V 粘贴</b> 上传</p>
            <p class="hint-text">支持 JPG、PNG、GIF、WebP、BMP 格式，最大 10MB</p>
          </div>
        </div>
        <input ref="fileInput" type="file" accept="image/*" multiple style="display: none" @change="handleFileSelect" />
      </div>

      <div v-if="uploading" class="upload-progress">
        <el-progress :percentage="uploadProgress" :status="uploadStatus" :stroke-width="8" />
        <p class="progress-text">{{ progressText }}</p>
      </div>

      <div class="quick-actions">
        <el-button type="primary" :icon="Upload" @click="selectFiles" :loading="uploading"> 选择图片 </el-button>
        <el-button :icon="FolderOpened" @click="selectFiles" :disabled="uploading"> 批量上传 </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload, UploadFilled, FolderOpened } from '@element-plus/icons-vue'
import axios from 'axios' // 直接使用 axios 确保路径正确

const emit = defineEmits(['uploaded'])

const fileInput = ref()
const isDragover = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadStatus = ref('')
const progressText = ref('')

const selectedStorage = ref('telegraph')
const availableStorages = ref([{ value: 'telegraph', label: 'Telegraph' }])

/**
 * 💡 关键修复：从后端真实接口拉取挂载状态
 */
const fetchAvailableStorages = async () => {
  try {
    // 强制请求后端可用性接口
    const response = await axios.get('/api/storage/available')
    if (response.data.success && response.data.data.storages) {
      const storageMap = { 'telegraph': 'Telegraph', 'r2': 'Cloudflare R2' }
      availableStorages.value = response.data.data.storages.map(s => ({ 
        value: s, 
        label: storageMap[s] || s.toUpperCase() 
      }))
      // 设置默认选中的存储
      if (response.data.data.default) {
        selectedStorage.value = response.data.data.default
      }
    }
  } catch (error) { 
    console.error('获取存储方式失败:', error) 
  }
}

const handlePaste = async (event) => {
  if (uploading.value) return
  const items = (event.clipboardData || event.originalEvent.clipboardData).items
  const files = []
  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      const blob = item.getAsFile()
      if (blob) {
        files.push(new File([blob], `pasted_${Date.now()}.png`, { type: blob.type }))
      }
    }
  }
  if (files.length > 0) uploadFiles(files)
}

const globalPasteHandler = (e) => {
  if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') handlePaste(e)
}

onMounted(() => {
  fetchAvailableStorages()
  window.addEventListener('paste', globalPasteHandler)
})

onUnmounted(() => window.removeEventListener('paste', globalPasteHandler))

const selectFiles = () => fileInput.value.click()
const handleFileSelect = e => {
  const files = Array.from(e.target.files)
  if (files.length > 0) uploadFiles(files)
}

const handleDragOver = () => isDragover.value = true
const handleDragLeave = () => isDragover.value = false
const handleDrop = e => {
  isDragover.value = false
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
  if (files.length > 0) uploadFiles(files)
}

const uploadFiles = async files => {
  if (uploading.value) return
  uploading.value = true
  uploadProgress.value = 0
  const totalFiles = files.length
  let uploadedCount = 0

  for (const file of files) {
    try {
      progressText.value = `正在上传: ${file.name}`
      const formData = new FormData()
      formData.append('image', file)
      formData.append('storageType', selectedStorage.value)

      const response = await axios.post('/api/upload', formData)
      if (response.data.success) {
        emit('uploaded', response.data.data)
      } else {
        ElMessage.error(`${file.name} 失败: ${response.data.message}`)
      }
    } catch (error) { 
      ElMessage.error(`${file.name} 网络错误`) 
    }
    uploadedCount++
    uploadProgress.value = Math.round((uploadedCount / totalFiles) * 100)
  }
  setTimeout(() => { 
    uploading.value = false 
    progressText.value = ''
  }, 1000)
}
</script>

<style scoped>
.upload-section { margin-bottom: 30px; }
.upload-card { max-width: 600px; margin: 0 auto; border-radius: 12px; }
.card-header { display: flex; align-items: center; gap: 8px; font-weight: 600; color: #409eff; }
.storage-selector { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding: 12px; background: #f5f7fa; border-radius: 8px; }
.upload-area { border: 2px dashed #d9d9d9; border-radius: 8px; padding: 40px 20px; text-align: center; background: #fafafa; transition: all 0.3s ease; cursor: pointer; margin-bottom: 20px; outline: none; }
.upload-area:hover, .upload-area.is-dragover { border-color: #409eff; background: #f0f9ff; }
.upload-content { display: flex; flex-direction: column; align-items: center; gap: 16px; }
.upload-icon { color: #c0c4cc; }
.upload-text .primary-text { font-size: 16px; color: #606266; margin: 0 0 8px 0; font-weight: 500; }
.upload-text .hint-text { font-size: 14px; color: #909399; margin: 0; }
.upload-progress { margin-bottom: 20px; }
.progress-text { text-align: center; margin-top: 8px; font-size: 14px; color: #606266; }
.quick-actions { display: flex; gap: 12px; justify-content: center; }
</style>