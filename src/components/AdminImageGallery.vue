<template>
  <div class="admin-gallery">
    <el-card shadow="hover" class="admin-main-card">
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
            <div class="action-container">
              <el-button 
                v-if="selectedStorage === 'r2'"
                type="primary" 
                size="small"
                :icon="Refresh"
                :loading="syncing"
                @click="handleSyncCloud"
                class="sync-btn"
              >
                同步云端
              </el-button>

              <el-radio-group 
                v-model="selectedStorage" 
                @change="handleStorageChange" 
                size="small" 
                class="storage-radio-group"
              >
                <el-radio-button label="all">全部</el-radio-button>
                <el-radio-button label="telegraph">Telegraph</el-radio-button>
                <el-radio-button label="r2">Cloudflare R2</el-radio-button>
              </el-radio-group>

              <el-button-group class="view-btn-group">
                <el-button :icon="Refresh" @click="loadImages" :loading="loading" size="small"> 刷新 </el-button>
                <el-button 
                  :icon="View" 
                  @click="toggleViewMode" 
                  size="small" 
                  :type="viewMode === 'grid' ? 'primary' : 'default'"
                >
                  {{ viewMode === 'grid' ? '网格' : '列表' }}
                </el-button>
              </el-button-group>
            </div>
          </div>
        </div>
      </template>

      <div class="filter-section">
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :md="8">
            <el-input v-model="searchText" placeholder="搜索原名或短名..." :prefix-icon="Search" clearable />
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-select v-model="sortBy" placeholder="排序方式" style="width: 100%">
              <el-option label="上传时间（新到旧）" value="time-desc" />
              <el-option label="上传时间（旧到新）" value="time-asc" />
              <el-option label="文件大小（大到小）" value="size-desc" />
              <el-option label="文件大小（小到大）" value="size-asc" />
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

      <div v-loading="loading && images.length === 0" class="image-grid-wrapper">
        <div v-if="images.length === 0 && !loading" class="empty-state">
          <el-empty :description="`当前存储(${getStorageLabel(selectedStorage)})还没有图片`" />
        </div>

        <div v-else-if="viewMode === 'grid'" class="image-grid">
          <div 
            v-for="image in filteredImages" 
            :key="image.filename" 
            class="image-card" 
            :class="{ 'is-selected': selectedImages.includes(image.filename) }"
          >
            <div class="image-wrapper" @click="previewImage(image)">
              <el-image :src="image.thumbnailUrl || image.url" :alt="getDisplayName(image)" fit="cover" class="image-preview" loading="lazy" />
              <div class="storage-tag-floating">
                <el-tag :type="getStorageTagType(image.storageType)" size="small" effect="dark">
                  {{ getStorageLabel(image.storageType) }}
                </el-tag>
              </div>
            </div>

            <div class="image-info">
              <div class="info-content-flex">
                <div class="image-filename-box">
                  <div class="title-with-icon">
                    <el-icon size="14" class="title-prefix-icon"><PictureFilled /></el-icon>
                    <span class="square-style-title" :title="getDisplayName(image)">
                      {{ getDisplayName(image) }}
                    </span>
                  </div>
                  <div v-if="getOriginalCacheName(image) && getOriginalCacheName(image) !== getSquareName(image)" class="original-alias-row">
                    <el-icon size="10" class="alias-prefix-icon"><Paperclip /></el-icon>
                    链接标识: {{ getSquareName(image) }}
                  </div>
                </div>
                <div class="info-checkbox-area" @click.stop>
                  <el-checkbox :value="image.filename" v-model="selectedImages" class="circle-tick-checkbox"></el-checkbox>
                </div>
              </div>
              <div class="image-meta">
                <span class="file-size">{{ formatFileSize(image.size) }}</span>
                <span class="upload-time">{{ formatTime(image.uploadTime) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="list-view">
          <el-table :data="filteredImages" @selection-change="handleSelectionChange" style="width: 100%">
            <el-table-column type="selection" width="55" />
            <el-table-column label="预览" width="80">
              <template #default="scope">
                <el-image :src="scope.row.thumbnailUrl || scope.row.url" fit="cover" style="width: 50px; height: 50px; border-radius: 4px; cursor: pointer" @click="previewImage(scope.row)" />
              </template>
            </el-table-column>
            <el-table-column label="文件名" min-width="250">
              <template #default="scope">
                <div class="list-name-cell">
                  <div class="list-p-name">
                    <el-icon size="12" style="margin-right: 4px; vertical-align: middle"><PictureFilled /></el-icon>
                    {{ getDisplayName(scope.row) }}
                  </div>
                  <div v-if="getOriginalCacheName(scope.row) && getOriginalCacheName(scope.row) !== getSquareName(scope.row)" class="list-s-name">
                    <el-icon size="10" style="margin-right: 4px"><Paperclip /></el-icon>
                    链接标识: {{ getSquareName(scope.row) }}
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="大小" width="100">
              <template #default="scope">{{ formatFileSize(scope.row.size) }}</template>
            </el-table-column>
            <el-table-column label="上传时间" width="180">
              <template #default="scope">{{ formatTime(scope.row.uploadTime) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="scope">
                <el-button-group size="small">
                  <el-button :icon="View" @click="previewImage(scope.row)"></el-button>
                  <el-button :icon="Download" @click="downloadImage(scope.row)"></el-button>
                  <el-button type="danger" :icon="Delete" @click="deleteImage(scope.row.filename, scope.row.storageType)"></el-button>
                </el-button-group>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </el-card>

    <el-dialog v-model="previewVisible" :width="isMobile ? '95%' : '650px'" append-to-body>
      <template #header>
        <div class="dialog-custom-header">
          <el-icon size="16" class="dialog-title-icon"><PictureFilled /></el-icon>
          <span class="dialog-title-text">{{ getDisplayName(currentImage) }}</span>
        </div>
      </template>
      <div v-if="currentImage" class="preview-content">
        <div class="preview-img-box">
          <el-image :src="currentImage.url" fit="contain" class="preview-img-main" :preview-src-list="[currentImage.url]" preview-teleported />
        </div>
        <div class="share-links">
          <div class="link-item" v-for="link in linkFormats" :key="link.label">
            <label>{{ link.label }}</label>
            <el-input v-model="link.value" readonly>
              <template #append>
                <el-button @click="copyUrl(link.value, link.label)">复制</el-button>
              </template>
            </el-input>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { PictureRounded, PictureFilled, Refresh, View, Search, Delete, Download, Paperclip } from '@element-plus/icons-vue'
import { imageAPI, adminAPI } from '../utils/api'

// 定义事件
const emit = defineEmits(['stats-updated'])

// 响应式状态
const images = ref([])
const selectedStorage = ref('all') // 💡 初始化为全部
const loading = ref(false)
const syncing = ref(false)
const previewVisible = ref(false)
const currentImage = ref(null)
const viewMode = ref('grid')
const searchText = ref('')
const sortBy = ref('time-desc')
const selectedImages = ref([])
const isMobile = ref(false)

// 云端同步逻辑
const handleSyncCloud = async () => {
  if (selectedStorage.value !== 'r2') return
  syncing.value = true
  try {
    const response = await adminAPI.syncR2()
    if (response.success) {
      ElMessage.success(response.message || '同步成功')
      await loadImages()
      emit('stats-updated')
    } else {
      ElMessage.error(response.message || '同步失败')
    }
  } catch (e) {
    ElMessage.error('同步异常: ' + (e.response?.data?.message || e.message))
  } finally { syncing.value = false }
}

// 缓存与名称处理逻辑
const getOriginalCacheName = (img) => {
  if (!img) return null
  if (img.originalName) return img.originalName
  const cacheMap = JSON.parse(localStorage.getItem('image_name_cache') || '{}')
  return cacheMap[img.filename] || null
}

const getSquareName = (img) => {
  if (!img) return ''
  let raw = img.url ? img.url.split('/').pop() : (img.filename || '')
  if (raw.includes('_')) raw = raw.split('_').pop()
  if (raw.startsWith('file_')) return `TG分享_${raw.split('.')[0].slice(-4)}`
  return raw
}

const getDisplayName = (img) => {
  if (!img) return ''
  return getOriginalCacheName(img) || getSquareName(img)
}

// 分享链接计算属性
const linkFormats = computed(() => {
  if (!currentImage.value) return []
  const { url } = currentImage.value
  const name = getDisplayName(currentImage.value)
  return [
    { label: '原始链接', value: url },
    { label: 'Markdown', value: `![${name}](${url})` },
    { label: 'HTML代码', value: `<img src="${url}" alt="${name}" />` },
    { label: 'BBCode', value: `[img]${url}[/img]` }
  ]
})

// 搜索和排序逻辑
const filteredImages = computed(() => {
  let result = [...images.value]
  if (searchText.value) {
    const s = searchText.value.toLowerCase()
    result = result.filter(img => getDisplayName(img).toLowerCase().includes(s))
  }
  if (sortBy.value === 'time-desc') result.sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime))
  if (sortBy.value === 'time-asc') result.sort((a, b) => new Date(a.uploadTime) - new Date(b.uploadTime))
  if (sortBy.value === 'size-desc') result.sort((a, b) => (b.size || 0) - (a.size || 0))
  if (sortBy.value === 'size-asc') result.sort((a, b) => (a.size || 0) - (b.size || 0))
  return result
})

// 加载数据
const loadImages = async () => {
  loading.value = true
  try {
    const response = await imageAPI.getImages(selectedStorage.value)
    if (response.success) {
      images.value = Array.isArray(response.data) ? response.data : []
      selectedImages.value = []
    }
  } catch (e) { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

// 切换存储触发加载
const handleStorageChange = () => { selectedImages.value = []; loadImages() }

// 标签样式处理
const getStorageTagType = (s) => {
  if (s === 'telegraph') return 'success'
  if (s === 'r2') return 'warning'
  return 'info'
}
const getStorageLabel = (s) => {
  if (s === 'telegraph') return 'TG'
  if (s === 'r2') return 'R2'
  return '全部'
}

// 视图切换与选择逻辑
const toggleViewMode = () => viewMode.value = viewMode.value === 'grid' ? 'list' : 'grid'
const selectAll = () => selectedImages.value = selectedImages.value.length === filteredImages.length ? [] : filteredImages.value.map(img => img.filename)
const handleSelectionChange = selection => selectedImages.value = selection.map(item => item.filename)
const previewImage = image => { currentImage.value = image; previewVisible.value = true }

// 复制功能适配（兼容 HTTP/HTTPS）
const copyUrl = async (text, label) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      const textArea = document.createElement("textarea")
      textArea.value = text
      textArea.style.position = "fixed"
      textArea.style.left = "-9999px"
      textArea.style.top = "0"
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
    ElMessage.success(`${label || '内容'} 已复制`)
  } catch (err) { ElMessage.error('复制失败，请手动选取') }
}

// 下载功能
const downloadImage = image => {
  const link = document.createElement('a'); link.href = image.url
  link.download = getDisplayName(image); link.target = '_blank'
  document.body.appendChild(link); link.click(); document.body.removeChild(link)
}

// 删除逻辑（支持单一与批量，需识别图片本身的存储类型）
const deleteImage = async (filename, storageType) => {
  try {
    const response = await adminAPI.deleteImage(filename, storageType)
    if (response.success) { 
      ElMessage.success('删除成功'); loadImages(); emit('stats-updated'); previewVisible.value = false 
    }
  } catch (e) { ElMessage.error('删除失败') }
}

const deleteSelectedImages = async () => {
  try {
    // 💡 全部模式下，每张图片归属不同，必须从对象中提取正确的 storageType
    const promises = filteredImages.value
      .filter(img => selectedImages.value.includes(img.filename))
      .map(img => adminAPI.deleteImage(img.filename, img.storageType))
    await Promise.all(promises); 
    ElMessage.success('批量删除完成'); loadImages(); emit('stats-updated')
  } catch (e) { ElMessage.error('部分删除失败') }
}

// 辅助格式化函数
const formatFileSize = b => {
  if (!b) return '0 B'
  const k = 1024; const i = Math.floor(Math.log(b) / Math.log(k))
  const units = ['B', 'KB', 'MB', 'GB']
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + units[i]
}

const formatTime = t => t ? t.replace(/\//g, '-') : ''

// 初始化
onMounted(() => { isMobile.value = window.innerWidth <= 768; loadImages() })
</script>

<style scoped>
.admin-gallery { margin-top: 10px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.header-left { display: flex; align-items: center; gap: 8px; font-weight: 600; color: #409eff; }

/* 💡 顶部右侧对齐补丁 */
.header-right { display: flex; align-items: center; }
.action-container { display: flex; align-items: center; gap: 12px; }
.sync-btn { margin: 0 !important; }
.storage-radio-group { display: flex; align-items: center; }
.view-btn-group { display: flex; align-items: center; }

/* 过滤区域样式 */
.filter-section { margin-bottom: 20px; padding: 15px; background: #fafafa; border-radius: 8px; }

/* 网格样式 */
.image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; padding: 10px 0; }
.image-card { border: 1px solid #eee; border-radius: 12px; overflow: hidden; background: white; transition: 0.3s; position: relative; }
.image-card.is-selected { border-color: #409eff; box-shadow: 0 0 0 2px #409eff; }
.image-wrapper { position: relative; width: 100%; height: 160px; cursor: pointer; overflow: hidden; display: flex; background: #f9f9f9; }
.image-preview { width: 100%; height: 100%; transition: 0.3s; }
.image-card:hover .image-preview { transform: scale(1.05); }
.storage-tag-floating { position: absolute; top: 8px; right: 8px; z-index: 10; }

/* 卡片信息区 */
.image-info { padding: 12px; background: white; border-top: 1px solid #f0f0f0; }
.info-content-flex { display: flex; align-items: center; justify-content: space-between; min-height: 48px; }
.image-filename-box { flex: 1; display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
.title-with-icon { display: flex; align-items: center; gap: 6px; overflow: hidden; }
.title-prefix-icon { color: #333; flex-shrink: 0; }
.square-style-title { font-size: 14px; font-weight: 800; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.original-alias-row { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #999; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.alias-prefix-icon { flex-shrink: 0; margin-left: 2px; }

/* 自定义圆形 Checkbox 样式 */
.info-checkbox-area { padding-left: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; height: 32px; width: 32px; }
.circle-tick-checkbox { height: 32px; width: 32px; display: flex; align-items: center; justify-content: center; }
:deep(.el-checkbox__inner) { width: 28px !important; height: 28px !important; border-radius: 50% !important; border: 2px solid #dcdfe6 !important; background-color: #fff !important; transition: none !important; position: relative !important; }
:deep(.el-checkbox.is-checked .el-checkbox__inner) { background-color: #409eff !important; border-color: #409eff !important; }
:deep(.el-checkbox__inner::after) { box-sizing: content-box !important; content: "" !important; border: 3px solid #fff !important; border-left: 0 !important; border-top: 0 !important; height: 12px !important; width: 6px !important; left: 9px !important; top: 4px !important; transform: rotate(45deg) !important; transition: none !important; position: absolute !important; }

.image-meta { display: flex; justify-content: space-between; font-size: 11px; color: #999; margin-top: 8px; border-top: 1px solid #f5f5f5; padding-top: 8px; }

/* 预览弹窗样式 */
.dialog-custom-header { display: flex; align-items: center; gap: 8px; }
.dialog-title-icon { color: #409eff; }
.dialog-title-text { font-weight: bold; font-size: 16px; color: #303133; }
.preview-content { text-align: center; }
.preview-img-box { background: #f5f7fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
.preview-img-main { max-width: 100%; max-height: 60vh; border-radius: 4px; }
.share-links { text-align: left; }
.link-item { margin-bottom: 12px; }
.link-item label { font-size: 12px; font-weight: bold; color: #666; display: block; margin-bottom: 5px; }

/* 响应式适配 */
@media (max-width: 768px) { 
  .image-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; } 
  .card-header { flex-direction: column; gap: 12px; align-items: flex-start; } 
  .header-right { width: 100%; }
  .action-container { width: 100%; justify-content: space-between; overflow-x: auto; padding-bottom: 5px; }
}
</style>