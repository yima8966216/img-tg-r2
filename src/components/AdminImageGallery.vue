<template>
  <div class="admin-gallery">
    <el-card shadow="hover">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <el-icon size="20"><PictureRounded /></el-icon>
            <span>图片管理</span>
            <el-tag v-if="images.length > 0" type="info" size="small"> {{ images.length }} 张 </el-tag>
            <el-tag :type="getStorageTagType(selectedStorage)" size="small">
              当前: {{ getStorageLabel(selectedStorage) }}
            </el-tag>
          </div>
          <div class="header-right">
            <el-button 
              v-if="selectedStorage === 'r2'"
              type="primary" 
              size="small"
              :icon="Refresh"
              :loading="syncing"
              @click="handleSyncCloud"
              style="margin-right: 10px"
            >
              同步云端
            </el-button>

            <el-select v-model="selectedStorage" @change="handleStorageChange" size="small" style="width: 140px; margin-right: 10px" placeholder="选择存储">
              <el-option label="Telegraph" value="telegraph" />
              <el-option label="Cloudflare R2" value="r2" />
            </el-select>
            <el-button-group>
              <el-button :icon="Refresh" @click="loadImages" :loading="loading" size="small"> 刷新 </el-button>
              <el-button :icon="View" @click="toggleViewMode" size="small" :type="viewMode === 'grid' ? 'primary' : 'default'">
                {{ viewMode === 'grid' ? '网格' : '列表' }}
              </el-button>
            </el-button-group>
          </div>
        </div>
      </template>

      <div class="filter-section">
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :md="8">
            <el-input v-model="searchText" placeholder="搜索图片名称..." :prefix-icon="Search" clearable @input="filterImages" />
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-select v-model="sortBy" placeholder="排序方式" @change="sortImages" style="width: 100%">
              <el-option label="上传时间（新到旧）" value="time-desc" />
              <el-option label="上传时间（旧到新）" value="time-asc" />
              <el-option label="文件大小（大到小）" value="size-desc" />
              <el-option label="文件大小（小到大）" value="size-asc" />
              <el-option label="文件名（A-Z）" value="name-asc" />
              <el-option label="文件名（Z-A）" value="name-desc" />
            </el-select>
          </el-col>
          <el-col :xs="24" :sm="24" :md="8">
            <el-button-group style="width: 100%">
              <el-popconfirm title="确定要删除选中的图片吗？" @confirm="deleteSelectedImages" :disabled="selectedImages.length === 0" popper-class="admin-popconfirm">
                <template #reference>
                  <el-button type="danger" :icon="Delete" :disabled="selectedImages.length === 0"> 删除选中 ({{ selectedImages.length }}) </el-button>
                </template>
              </el-popconfirm>
              <el-button @click="selectAll" :disabled="filteredImages.length === 0">
                {{ selectedImages.length === filteredImages.length ? '取消全选' : '全选' }}
              </el-button>
            </el-button-group>
          </el-col>
        </el-row>
      </div>

      <div v-if="loading && images.length === 0" class="loading-state">
        <el-skeleton :rows="3" animated />
        <div class="loading-text">加载中...</div>
      </div>

      <div v-else-if="!loading && images.length === 0" class="empty-state">
        <el-empty image-size="120" :description="`当前存储(${getStorageLabel(selectedStorage)})还没有图片`">
          <template #image>
            <el-icon size="120" color="#c0c4cc">
              <PictureRounded />
            </el-icon>
          </template>
          <el-text type="info">提示：不同存储方式的图片需要切换到对应的存储查看</el-text>
        </el-empty>
      </div>

      <div v-else-if="viewMode === 'grid'" class="grid-view">
        <div class="image-grid">
          <div v-for="image in filteredImages" :key="image.filename" class="image-card" :class="{ selected: selectedImages.includes(image.filename) }">
            <div class="image-wrapper">
              <el-checkbox v-model="selectedImages" :label="image.filename" class="image-checkbox" />
              <el-image :src="image.thumbnailUrl || image.url" :alt="image.filename" fit="cover" class="image-preview" loading="lazy" @click="previewImage(image)">
                <template #error>
                  <div class="image-error">
                    <el-icon size="32"><PictureFilled /></el-icon>
                    <span>加载失败</span>
                  </div>
                </template>
              </el-image>
              <div class="image-overlay">
                <el-button-group>
                  <el-button :icon="View" circle size="small" @click.stop="previewImage(image)" title="预览与链接" />
                  <el-button :icon="Download" circle size="small" @click.stop="downloadImage(image)" title="下载" />
                  <el-popconfirm title="确定要删除这张图片吗？" @confirm="deleteImage(image.filename)" popper-class="admin-popconfirm">
                    <template #reference>
                      <el-button :icon="Delete" circle size="small" type="danger" @click.stop title="删除" />
                    </template>
                  </el-popconfirm>
                </el-button-group>
              </div>
            </div>

            <div class="image-info">
              <div class="image-filename" :title="image.filename">
                {{ truncateFilename(image.filename) }}
                <el-tag v-if="image.storageType" :type="getStorageTagType(image.storageType)" size="small" style="margin-left: 5px">
                  {{ getStorageLabel(image.storageType) }}
                </el-tag>
              </div>
              <div class="image-meta">
                <span class="file-size">{{ formatFileSize(image.size) }}</span>
                <span class="upload-time">{{ formatTime(image.uploadTime) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="list-view">
        <el-table :data="filteredImages" @selection-change="handleSelectionChange" style="width: 100%">
          <el-table-column type="selection" width="55" />
          <el-table-column label="预览" width="80">
            <template #default="{ row }">
              <el-image :src="row.thumbnailUrl || row.url" :alt="row.filename" fit="cover" style="width: 50px; height: 50px; border-radius: 4px; cursor: pointer;" @click="previewImage(row)" class="table-preview" />
            </template>
          </el-table-column>
          <el-table-column prop="filename" label="文件名" min-width="200">
            <template #default="{ row }">
              <el-link @click="previewImage(row)" :underline="false">
                {{ row.filename }}
              </el-link>
              <el-tag v-if="row.storageType" :type="getStorageTagType(row.storageType)" size="small" style="margin-left: 8px">
                {{ getStorageLabel(row.storageType) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="size" label="大小" width="100">
            <template #default="{ row }">
              {{ formatFileSize(row.size) }}
            </template>
          </el-table-column>
          <el-table-column prop="uploadTime" label="上传时间" width="150" />
          <el-table-column label="操作" width="200">
            <template #default="{ row }">
              <el-button-group size="small">
                <el-button :icon="View" @click="previewImage(row)">预览</el-button>
                <el-button :icon="Download" @click="downloadImage(row)">下载</el-button>
                <el-popconfirm title="确定要删除吗？" @confirm="deleteImage(row.filename)" popper-class="admin-popconfirm">
                  <template #reference>
                    <el-button type="danger" :icon="Delete">删除</el-button>
                  </template>
                </el-popconfirm>
              </el-button-group>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <el-dialog 
      v-model="previewVisible" 
      :title="currentImage?.filename" 
      :width="isMobile ? '95%' : '650px'" 
      :top="isMobile ? '2vh' : '5vh'" 
      append-to-body 
      class="image-preview-dialog"
    >
      <div v-if="currentImage" class="preview-content">
        <div class="preview-image-wrapper">
          <el-image 
            :src="currentImage.url" 
            :alt="currentImage.filename" 
            fit="contain" 
            class="preview-image"
            :preview-src-list="[currentImage.url]"
            :initial-index="0"
          >
            <template #error>
              <div class="preview-error">
                <el-icon size="64"><PictureFilled /></el-icon>
                <p>原图加载失败</p>
              </div>
            </template>
          </el-image>
        </div>
        
        <div class="share-links">
          <div class="link-item" v-for="link in linkFormats" :key="link.label">
            <div class="link-label">{{ link.label }}</div>
            <el-input v-model="link.value" readonly size="default">
              <template #append>
                <el-button @click="copyUrl(link.value)">复制</el-button>
              </template>
            </el-input>
          </div>
        </div>

        <div class="preview-info" style="margin-top: 20px">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="文件详情">
              {{ formatFileSize(currentImage.size) }} | {{ currentImage.uploadTime }} | {{ getStorageLabel(currentImage.storageType) }}
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </div>
      <template #footer>
        <div class="preview-actions">
          <el-button @click="downloadImage(currentImage)" :icon="Download">
            下载图片
          </el-button>
          <el-button type="danger" @click="deleteImage(currentImage?.filename)" :icon="Delete">
            删除
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { PictureRounded, PictureFilled, Refresh, View, Search, Delete, Download, CopyDocument } from '@element-plus/icons-vue'
import { imageAPI, adminAPI } from '../utils/api'

const emit = defineEmits(['stats-updated'])

const images = ref([])
const selectedStorage = ref('telegraph')
const loading = ref(false)
const syncing = ref(false)
const previewVisible = ref(false)
const currentImage = ref(null)
const viewMode = ref('grid')
const searchText = ref('')
const sortBy = ref('time-desc')
const selectedImages = ref([])
const isMobile = ref(false)

// 💡 核心新增：动态计算多种格式链接
const linkFormats = computed(() => {
  if (!currentImage.value) return []
  const url = currentImage.value.url
  const name = currentImage.value.filename
  return [
    { label: 'URL', value: url },
    { label: 'Markdown', value: `![${name}](${url})` },
    { label: 'HTML', value: `<img src="${url}" alt="${name}" />` },
    { label: 'BBCode', value: `[img]${url}[/img]` }
  ]
})

const checkMobile = () => {
  isMobile.value = window.innerWidth <= 768
}

const filteredImages = computed(() => {
  let result = [...images.value]
  if (searchText.value) {
    result = result.filter(image => image.filename.toLowerCase().includes(searchText.value.toLowerCase()))
  }
  switch (sortBy.value) {
    case 'time-desc': result.sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime)); break
    case 'time-asc': result.sort((a, b) => new Date(a.uploadTime) - new Date(b.uploadTime)); break
    case 'size-desc': result.sort((a, b) => b.size - a.size); break
    case 'size-asc': result.sort((a, b) => a.size - b.size); break
    case 'name-asc': result.sort((a, b) => a.filename.localeCompare(b.filename)); break
    case 'name-desc': result.sort((a, b) => b.filename.localeCompare(a.filename)); break
  }
  return result
})

const loadImages = async () => {
  loading.value = true
  try {
    const response = await imageAPI.getImages(selectedStorage.value)
    if (response.success) {
      images.value = response.data
      selectedImages.value = []
    }
  } catch (error) {
    ElMessage.error('加载图片列表失败')
  } finally {
    loading.value = false
  }
}

const handleSyncCloud = async () => {
  try {
    await ElMessageBox.confirm('从 R2 存储桶同步索引？', '确认同步', { type: 'warning' })
    syncing.value = true
    const response = await adminAPI.syncR2()
    if (response.success) {
      ElMessage.success(response.message || '同步成功')
      await loadImages()
      emit('stats-updated')
    } else { ElMessage.error(response.message || '同步失败') }
  } catch (error) { if (error !== 'cancel') ElMessage.error('同步异常') } 
  finally { syncing.value = false }
}

const handleStorageChange = () => { selectedImages.value = []; loadImages() }
const getStorageTagType = (s) => s === 'telegraph' ? 'success' : 'warning'
const getStorageLabel = (s) => s === 'telegraph' ? 'TG' : 'R2'
const toggleViewMode = () => { viewMode.value = viewMode.value === 'grid' ? 'list' : 'grid' }
const filterImages = () => { selectedImages.value = [] }
const sortImages = () => { selectedImages.value = [] }
const selectAll = () => {
  selectedImages.value = selectedImages.value.length === filteredImages.value.length ? [] : filteredImages.value.map(img => img.filename)
}
const handleSelectionChange = selection => { selectedImages.value = selection.map(item => item.filename) }
const previewImage = image => { currentImage.value = image; previewVisible.value = true }

const copyUrl = async url => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url)
      ElMessage.success('复制成功')
    } else {
      const textArea = document.createElement('textarea')
      textArea.value = url; document.body.appendChild(textArea)
      textArea.select(); document.execCommand('copy'); document.body.removeChild(textArea)
      ElMessage.success('复制成功')
    }
  } catch (error) { ElMessage.error('复制失败') }
}

const downloadImage = image => {
  const link = document.createElement('a'); link.href = image.url; link.download = image.filename; link.target = '_blank'
  document.body.appendChild(link); link.click(); document.body.removeChild(link)
}

const deleteImage = async filename => {
  try {
    const response = await adminAPI.deleteImage(filename, selectedStorage.value)
    if (response.success) {
      ElMessage.success('删除成功'); loadImages(); emit('stats-updated'); previewVisible.value = false
      const index = selectedImages.value.indexOf(filename)
      if (index > -1) selectedImages.value.splice(index, 1)
    }
  } catch (error) { console.error(error) }
}

const deleteSelectedImages = async () => {
  if (selectedImages.value.length === 0) return
  const promises = selectedImages.value.map(f => adminAPI.deleteImage(f, selectedStorage.value))
  try {
    await Promise.all(promises); ElMessage.success(`成功删除 ${selectedImages.value.length} 张`);
    selectedImages.value = []; loadImages(); emit('stats-updated')
  } catch (error) { ElMessage.error('部分删除失败'); loadImages() }
}

const truncateFilename = (filename, maxLength = 20) => {
  if (filename.length <= maxLength) return filename
  const ext = filename.split('.').pop()
  const nameWithoutExt = filename.slice(0, filename.lastIndexOf('.'))
  return nameWithoutExt.slice(0, maxLength - ext.length - 4) + '...' + '.' + ext
}

const formatFileSize = bytes => {
  if (bytes === 0) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatTime = timeStr => timeStr.replace(/\//g, '-')

onMounted(() => {
  checkMobile(); window.addEventListener('resize', checkMobile); loadImages()
})
onUnmounted(() => { window.removeEventListener('resize', checkMobile) })
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
.header-left { display: flex; align-items: center; gap: 8px; font-weight: 600; color: #409eff; }
.filter-section { margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #ebeef5; }
.image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px; padding: 20px 0; }
.image-card { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); transition: all 0.3s ease; position: relative; }
.image-card:hover { transform: translateY(-4px); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15); }
.image-card.selected { box-shadow: 0 0 0 2px #409eff; }
.image-wrapper { position: relative; cursor: pointer; }
.image-checkbox { position: absolute; top: 8px; left: 8px; z-index: 10; background: rgba(255, 255, 255, 0.9); padding: 2px; border-radius: 4px; }
.image-preview { width: 100%; height: 200px; object-fit: cover; }
.image-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s ease; z-index: 5; }
.image-wrapper:hover .image-overlay { opacity: 1; }
.image-info { padding: 16px; }
.image-filename { font-weight: 600; margin-bottom: 8px; color: #303133; word-break: break-all; }
.image-meta { display: flex; justify-content: space-between; font-size: 12px; color: #909399; }

/* 💡 核心新增：分享链接样式 */
.share-links {
  margin-top: 20px;
  background: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.link-item { display: flex; flex-direction: column; gap: 5px; text-align: left; }
.link-label { font-size: 12px; font-weight: bold; color: #606266; }

.preview-content { text-align: center; }
.preview-image-wrapper { background: #f5f7fa; border-radius: 8px; padding: 20px; margin-bottom: 20px; min-height: 300px; display: flex; align-items: center; justify-content: center; }
.preview-image { max-width: 100%; max-height: 60vh; border-radius: 4px; }
.preview-actions { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }

@media (max-width: 768px) {
  .image-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .image-preview { height: 150px; }
  .card-header { flex-direction: column; gap: 12px; align-items: flex-start; }
  .header-left, .header-right { width: 100%; }
  .image-overlay { opacity: 1; background: rgba(0, 0, 0, 0.3); }
  .share-links { padding: 10px; }
}
</style>