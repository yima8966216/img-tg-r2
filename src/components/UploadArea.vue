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
      </div>

      <div 
        class="upload-area" 
        :class="{ 'is-dragover': isDragover }" 
        @dragover.prevent="handleDragOver" 
        @dragleave.prevent="handleDragLeave" 
        @drop.prevent="handleDrop" 
        @paste="handlePaste"
        tabindex="0"
      >
        <div class="upload-content">
          <el-icon size="64" class="upload-icon">
            <UploadFilled />
          </el-icon>
          <div class="upload-text">
            <p class="primary-text">拖拽图片至此处 或 <b>Ctrl + V 粘贴</b></p>
            <p class="hint-text">支持 JPG、PNG、GIF、WebP、BMP 格式，最大 10MB</p>
          </div>
        </div>
        
        <input 
          ref="singleInputRef" 
          type="file" 
          accept="image/*" 
          style="display: none" 
          @change="handleSingleChange" 
        />
        <input 
          ref="batchInputRef" 
          type="file" 
          accept="image/*" 
          multiple 
          style="display: none" 
          @change="handleBatchChange" 
        />
      </div>

      <div v-if="uploading" class="upload-progress">
        <el-progress :percentage="uploadProgress" :status="uploadStatus" :stroke-width="8" />
        <p class="progress-text">{{ progressText }}</p>
      </div>

      <div class="quick-actions">
        <el-button type="primary" :icon="Upload" @click.stop="selectSingleFile" :loading="uploading"> 选择图片 </el-button>
        <el-button :icon="FolderOpened" @click.stop="selectBatchFiles" :disabled="uploading"> 批量上传 </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Upload, UploadFilled, FolderOpened } from '@element-plus/icons-vue'
import axios from 'axios'

const emit = defineEmits(['uploaded'])

const singleInputRef = ref(null)
const batchInputRef = ref(null)

const isDragover = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadStatus = ref('')
const progressText = ref('')

const selectedStorage = ref('telegraph')
const availableStorages = ref([{ value: 'telegraph', label: 'Telegraph' }])

/**
 * 💡 获取可用存储时也要带上 Token（如果后端有要求）
 */
const fetchAvailableStorages = async () => {
  try {
    const token = localStorage.getItem('admin_token')
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {}
    const response = await axios.get('/api/storage/available', config)
    if (response.data.success && response.data.data.storages) {
      const storageMap = { 'telegraph': 'Telegraph', 'r2': 'Cloudflare R2' }
      availableStorages.value = response.data.data.storages.map(s => ({ 
        value: s, 
        label: storageMap[s] || s.toUpperCase() 
      }))
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
        // 对于粘贴的图片，手动设置一个带时间戳的文件名
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

const selectSingleFile = () => {
  if (singleInputRef.value) singleInputRef.value.click()
}

const selectBatchFiles = () => {
  if (batchInputRef.value) batchInputRef.value.click()
}

const handleSingleChange = (e) => {
  const files = Array.from(e.target.files)
  if (files.length > 0) {
    uploadFiles([files[0]])
  }
  e.target.value = ''
}

const handleBatchChange = (e) => {
  const files = Array.from(e.target.files)
  if (files.length > 0) {
    uploadFiles(files)
  }
  e.target.value = ''
}

const handleDragOver = () => isDragover.value = true
const handleDragLeave = () => isDragover.value = false
const handleDrop = e => {
  isDragover.value = false
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
  if (files.length > 0) uploadFiles(files)
}

/**
 * 💡 核心修复：不仅发送 originalName，还将对应关系存入本地缓存，防止刷新丢失中文名
 */
const uploadFiles = async files => {
  if (uploading.value) return
  uploading.value = true
  uploadProgress.value = 0
  const totalFiles = files.length
  let uploadedCount = 0

  // 获取本地 Token
  const token = localStorage.getItem('admin_token')

  for (const file of files) {
    try {
      progressText.value = `正在上传: ${file.name}`
      const formData = new FormData()
      formData.append('image', file)
      formData.append('storageType', selectedStorage.value)
      
      // 💡 关键新增：将原始文件名发送给后端
      formData.append('originalName', file.name)

      // 💡 配置请求头
      const axiosConfig = {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
      if (token) {
        axiosConfig.headers.Authorization = `Bearer ${token}`
      }

      const response = await axios.post('/api/upload', formData, axiosConfig)
      
      if (response.data.success) {
        // 💡 双保险逻辑：将 [物理文件名 -> 原始中文名] 的对应关系存入本地 LocalStorage
        // 即使后端由于数据库限制没存下 originalName，我们刷新的后台也能通过这个缓存找回名字
        try {
          const cache = JSON.parse(localStorage.getItem('image_name_cache') || '{}')
          const serverFilename = response.data.data.filename
          if (serverFilename) {
            cache[serverFilename] = file.name
            localStorage.setItem('image_name_cache', JSON.stringify(cache))
          }
        } catch (cacheErr) {
          console.error('本地名称缓存更新失败:', cacheErr)
        }

        const resultWithMeta = {
          ...response.data.data,
          originalName: file.name,
          uploadTime: new Date().toLocaleString()
        }
        emit('uploaded', resultWithMeta)
      } else {
        ElMessage.error(`${file.name} 失败: ${response.data.message}`)
      }
    } catch (error) { 
      console.error('上传出错:', error)
      ElMessage.error(`${file.name} 网络错误`) 
    }
    uploadedCount++
    uploadProgress.value = Math.round((uploadedCount / totalFiles) * 100)
  }
  
  setTimeout(() => { 
    uploading.value = false 
    progressText.value = ''
    uploadProgress.value = 0
  }, 1000)
}
</script>

<style scoped>
.upload-section { margin-bottom: 30px; }
.upload-card { max-width: 600px; margin: 0 auto; border-radius: 12px; }
.card-header { display: flex; align-items: center; gap: 8px; font-weight: 600; color: #409eff; }
.storage-selector { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding: 12px; background: #f5f7fa; border-radius: 8px; }
.upload-area { border: 2px dashed #d9d9d9; border-radius: 8px; padding: 40px 20px; text-align: center; background: #fafafa; transition: all 0.3s ease; cursor: default; margin-bottom: 20px; outline: none; }
.upload-area:hover, .upload-area.is-dragover { border-color: #409eff; background: #f0f9ff; }
.upload-content { display: flex; flex-direction: column; align-items: center; gap: 16px; pointer-events: none; }
.upload-icon { color: #c0c4cc; }
.upload-text .primary-text { font-size: 16px; color: #606266; margin: 0 0 8px 0; font-weight: 500; }
.upload-text .hint-text { font-size: 14px; color: #909399; margin: 0; }
.upload-progress { margin-bottom: 20px; }
.progress-text { text-align: center; margin-top: 8px; font-size: 14px; color: #606266; }
.quick-actions { display: flex; gap: 12px; justify-content: center; }
</style>