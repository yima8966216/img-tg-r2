<template>
  <div class="gallery-section">
    <el-card shadow="hover">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <el-icon size="20"><PictureRounded /></el-icon>
            <span>图片列表</span>
            <el-tag v-if="images.length > 0" type="info" size="small"> {{ images.length }} 张 </el-tag>
          </div>
          <div class="header-right">
            <el-select v-model="selectedStorage" @change="loadImages" size="small" style="width: 140px; margin-right: 10px">
              <el-option label="Telegraph" value="telegraph" />
              <el-option label="Cloudflare R2" value="r2" />
            </el-select>
            <el-button :icon="Refresh" @click="loadImages" :loading="loading" size="small"> 刷新 </el-button>
          </div>
        </div>
      </template>
      <div v-if="loading && images.length === 0" style="padding: 20px; text-align: center;"><el-skeleton :rows="3" animated /></div>
      <div v-else-if="images.length === 0" style="padding: 40px; text-align: center;"><el-empty description="暂无图片" /></div>
      <div v-else class="image-grid">
        <div v-for="image in images" :key="image.filename" class="image-card">
          <el-image :src="image.url" fit="cover" class="image-preview" :preview-src-list="[image.url]" preview-teleported />
          <div class="image-info">
            <div class="image-filename">{{ image.filename }}</div>
            <div class="image-actions">
              <el-button-group size="small">
                <el-button :icon="CopyDocument" @click="copyUrl(image.url)">复制</el-button>
                <el-button :icon="Delete" type="danger" @click="deleteImage(image.filename)" />
              </el-button-group>
            </div>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>
<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { PictureRounded, Refresh, CopyDocument, Delete } from '@element-plus/icons-vue'
import { imageAPI } from '../utils/api'
const images = ref([]); const loading = ref(false); const selectedStorage = ref('telegraph')
const loadImages = async () => {
  loading.value = true; try { const res = await imageAPI.getImages(selectedStorage.value); if (res.success) images.value = res.data } catch (e) { ElMessage.error('失败') } finally { loading.value = false }
}
const copyUrl = async url => { await navigator.clipboard.writeText(url); ElMessage.success('已复制') }
const deleteImage = async n => { const res = await imageAPI.deleteImage(n, selectedStorage.value); if (res.success) loadImages() }
onMounted(() => loadImages())
</script>
<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
.header-left { display: flex; align-items: center; gap: 8px; font-weight: 600; color: #409eff; }
.image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; padding: 15px 0; }
.image-card { border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
.image-preview { width: 100%; height: 150px; }
.image-info { padding: 10px; }
.image-filename { font-size: 12px; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.image-actions { display: flex; justify-content: center; }
</style>