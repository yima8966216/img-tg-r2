<template>
  <div class="square-page">
    <div class="square-container">
      <div class="square-header">
        <div class="header-left">
          <el-icon size="32" color="#409eff"><Compass /></el-icon>
          <h1 class="page-title">图片广场</h1>
          <el-text type="info" class="subtitle">
            {{ isLoggedIn ? '欢迎回来，探索社区全部精彩图片' : '查看最近分享的 10 张精彩图片' }}
          </el-text>
        </div>
        <div class="header-right">
          <el-button-group>
            <el-button :type="activeSource === 'all' ? 'primary' : ''" @click="filterSource('all')">全部</el-button>
            <el-button :type="activeSource === 'telegraph' ? 'primary' : ''" @click="filterSource('telegraph')">Telegraph</el-button>
            <el-button :type="activeSource === 'r2' ? 'primary' : ''" @click="filterSource('r2')">Cloudflare R2</el-button>
          </el-button-group>
          <el-button :icon="Refresh" circle @click="loadImages" :loading="loading" style="margin-left: 15px" />
        </div>
      </div>

      <div v-loading="loading" class="image-grid-wrapper">
        <div v-if="displayImages.length > 0" class="image-grid">
          <div 
            v-for="img in displayImages" 
            :key="img.url" 
            class="image-card glass-card"
            @click="viewDetail(img)"
          >
            <div class="img-wrapper">
              <el-image 
                :src="img.thumbnailUrl || img.url" 
                fit="cover" 
                class="main-img" 
                lazy
              >
                <template #placeholder>
                  <div class="img-placeholder">
                    <el-icon class="is-loading"><Loading /></el-icon>
                  </div>
                </template>
                <template #error>
                  <div class="img-placeholder">加载失败</div>
                </template>
              </el-image>
              <div class="img-tag">
                <el-tag size="small" :type="img.storageType === 'r2' ? 'warning' : 'success'" effect="dark">
                  {{ img.storageType === 'r2' ? 'R2' : 'TG' }}
                </el-tag>
              </div>
            </div>
            <div class="img-info">
              <div class="filename-row">
                <el-icon size="14" class="title-prefix-icon"><PictureFilled /></el-icon>
                <div class="filename" :title="img.originalName || img.filename">
                  {{ formatFileName(img) }}
                </div>
              </div>
              <div class="meta">
                <span class="time">{{ formatTime(img.uploadTime) }}</span>
                <span class="size">{{ formatSize(img.size) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="!loading" class="empty-state">
          <el-empty description="暂时没有图片，快去上传吧" />
        </div>

        <div v-if="!isLoggedIn && allImages.length > 10" class="login-guide">
          <div class="guide-content">
            <el-divider>
              <el-icon><Lock /></el-icon>
            </el-divider>
            <p>登录后台可解锁查看全部 {{ allImages.length }} 张图片</p>
            <el-button type="primary" plain round @click="$router.push('/login')">立即登录</el-button>
          </div>
        </div>
      </div>
    </div>

    <el-dialog 
      v-model="detailVisible" 
      :title="formatFileName(currentImg)" 
      :width="isMobile ? '95%' : '650px'"
      append-to-body
      class="square-dialog"
    >
      <template #header>
        <div class="dialog-custom-header">
          <el-icon size="16" style="margin-right: 8px; vertical-align: middle;"><PictureFilled /></el-icon>
          <span style="font-weight: bold;">{{ formatFileName(currentImg) }}</span>
        </div>
      </template>

      <div v-if="currentImg" class="preview-container">
        <div class="image-box">
          <el-image :src="currentImg.url" fit="contain" class="full-img" :preview-src-list="[currentImg.url]" />
        </div>
        <div class="link-group">
          <div class="link-item" v-for="link in linkOptions" :key="link.label">
            <label class="link-label-text">{{ link.label }}</label>
            <el-input v-model="link.value" readonly size="default">
              <template #append>
                <el-button @click="copy(link.value, link.label)">复制</el-button>
              </template>
            </el-input>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { Compass, Refresh, Loading, Lock, PictureFilled } from '@element-plus/icons-vue'
import { imageAPI } from '../utils/api'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const allImages = ref([])
const activeSource = ref('all')
const detailVisible = ref(false)
const currentImg = ref(null)
const isMobile = ref(false)
const isLoggedIn = ref(false)

const checkMobile = () => { isMobile.value = window.innerWidth <= 768 }
const checkLoginStatus = () => { isLoggedIn.value = !!localStorage.getItem('admin_token') }

const loadImages = async () => {
  if (loading.value) return
  loading.value = true
  try {
    const [tgRes, r2Res] = await Promise.all([
      imageAPI.getImages('telegraph').catch(() => ({ success: false, data: [] })),
      imageAPI.getImages('r2').catch(() => ({ success: false, data: [] }))
    ])
    let combined = []
    if (tgRes && tgRes.success) combined = [...combined, ...tgRes.data]
    if (r2Res && r2Res.success) combined = [...combined, ...r2Res.data]
    combined.sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime))
    allImages.value = combined
  } catch (error) { ElMessage.error('加载广场数据异常') }
  finally { loading.value = false }
}

/**
 * 💡 核心逻辑：智能处理历史数据的文件名显示
 */
const formatFileName = (img) => {
  if (!img) return ''
  // 1. 如果有原始文件名直接用
  if (img.originalName) return img.originalName
  // 2. 如果是 Telegraph 的随机名 image_xxxx.png，尝试美化
  if (img.filename && img.filename.startsWith('file_')) {
    return `TG分享_${img.filename.split('.')[0].slice(-4)}`
  }
  // 3. 实在不行用 URL 截取
  if (img.url) {
    const parts = img.url.split('/')
    return parts[parts.length - 1]
  }
  return '未命名图片'
}

const displayImages = computed(() => {
  let list = allImages.value
  if (activeSource.value !== 'all') list = list.filter(img => img.storageType === activeSource.value)
  return !isLoggedIn.value ? list.slice(0, 10) : list
})

const linkOptions = computed(() => {
  if (!currentImg.value) return []
  const { url } = currentImg.value
  const name = formatFileName(currentImg.value)
  return [
    { label: '原始链接', value: url },
    { label: 'Markdown', value: `![${name}](${url})` },
    { label: 'HTML代码', value: `<img src="${url}" alt="${name}" />` },
    { label: 'BBCode', value: `[img]${url}[/img]` }
  ]
})

const filterSource = (src) => { activeSource.value = src }
const viewDetail = (img) => { currentImg.value = img; detailVisible.value = true }

const copy = async (text, label) => {
  await navigator.clipboard.writeText(text)
  ElMessage.success(`${label} 已复制`)
}

const formatTime = (t) => {
  if (!t) return ''
  const d = new Date(t.replace(/-/g, '/'))
  return `${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

const formatSize = (bytes) => {
  if (!bytes) return '未知大小'
  const k = 1024; const i = Math.floor(Math.log(bytes) / Math.log(k))
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB'][i]
}

onMounted(() => { checkMobile(); checkLoginStatus(); window.addEventListener('resize', checkMobile); loadImages() })
onUnmounted(() => window.removeEventListener('resize', checkMobile))
</script>

<style scoped>
.square-page { min-height: 100vh; background-color: #fcfcfc; background-image: linear-gradient(#f1f1f1 1.5px, transparent 1.5px), linear-gradient(90deg, #f1f1f1 1.5px, transparent 1.5px); background-size: 60px 60px; padding: 40px 20px; }
.square-container { max-width: 1200px; margin: 0 auto; }
.square-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; flex-wrap: wrap; gap: 20px; }
.header-left { display: flex; flex-direction: column; gap: 4px; }
.page-title { font-size: 2rem; font-weight: 800; color: #303133; margin: 0; }
.subtitle { font-size: 14px; }
.image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
.glass-card { background: rgba(255, 255, 255, 0.8) !important; backdrop-filter: blur(10px); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.5); box-shadow: 0 4px 16px rgba(0,0,0,0.05); overflow: hidden; cursor: pointer; transition: all 0.3s ease; }
.glass-card:hover { transform: translateY(-6px); box-shadow: 0 12px 32px rgba(64,158,255,0.2); }
.img-wrapper { position: relative; aspect-ratio: 4/3; }
.main-img { width: 100%; height: 100%; transition: transform 0.5s; }
.glass-card:hover .main-img { transform: scale(1.1); }
.img-tag { position: absolute; top: 10px; right: 10px; }
.img-info { padding: 12px; }

/* 💡 对齐核心：标题行图标对齐 */
.filename-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; overflow: hidden; }
.title-prefix-icon { color: #606266; flex-shrink: 0; }

.filename { font-size: 14px; font-weight: 600; color: #303133; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.meta { display: flex; justify-content: space-between; font-size: 12px; color: #909399; }
.login-guide { margin-top: 50px; text-align: center; padding-bottom: 40px; }
.guide-content { max-width: 400px; margin: 0 auto; color: #909399; }
.guide-content p { margin: 20px 0; font-size: 14px; }
.preview-container { text-align: center; }
.image-box { background: #f5f7fa; border-radius: 12px; padding: 15px; margin-bottom: 20px; }
.full-img { max-height: 450px; border-radius: 4px; }
.link-group { display: flex; flex-direction: column; gap: 15px; text-align: left; }
.link-label-text { display: block; font-size: 12px; font-weight: bold; margin-bottom: 5px; color: #606266; }
.img-placeholder { height: 100%; display: flex; align-items: center; justify-content: center; background: #f0f2f5; }

/* 💡 弹窗头部对齐 */
.dialog-custom-header { display: flex; align-items: center; }

@media (max-width: 768px) { .square-header { flex-direction: column; align-items: flex-start; } .image-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; } .square-page { padding: 20px 10px; } }
</style>