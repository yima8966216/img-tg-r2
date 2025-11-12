<template>
  <div class="storage-settings">
    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <el-icon size="20"><Setting /></el-icon>
          <span>存储配置管理</span>
        </div>
      </template>

      <!-- 默认存储设置 -->
      <div class="default-storage-section">
        <el-text class="section-title">默认存储方式</el-text>
        <el-radio-group v-model="config.defaultStorage" @change="handleDefaultStorageChange">
          <el-radio-button value="telegraph">Telegraph</el-radio-button>
          <el-radio-button value="r2">Cloudflare R2</el-radio-button>
        </el-radio-group>
      </div>

      <el-divider />

      <!-- 存储配置标签页 -->
      <el-tabs v-model="activeTab" type="border-card">
        <!-- Telegraph 配置 -->
        <el-tab-pane label="Telegraph" name="telegraph">
          <el-alert title="配置说明" type="info" :closable="false" style="margin-bottom: 20px">
            <p>1. 在 Telegram 搜索 @BotFather</p>
            <p>2. 发送 /newbot 创建 Bot</p>
            <p>3. 复制获得的 Bot Token</p>
          </el-alert>

          <el-form :model="config.telegraph" label-width="140px" class="config-form">
            <el-form-item label="启用状态">
              <el-switch v-model="config.telegraph.enabled" />
            </el-form-item>
            <el-form-item label="Bot Token">
              <el-input v-model="config.telegraph.botToken" type="password" show-password placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz" clearable />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveConfig('telegraph')" :disabled="!config.telegraph.botToken">保存配置</el-button>
              <el-button @click="testConnection('telegraph')" :disabled="!config.telegraph.botToken">测试连接</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- Cloudflare R2 配置 -->
        <el-tab-pane label="Cloudflare R2" name="r2">
          <el-alert title="配置说明" type="info" :closable="false" style="margin-bottom: 20px">
            <p>1. 登录 Cloudflare Dashboard</p>
            <p>2. 创建 R2 存储桶并记录名称</p>
            <p>3. 创建 API Token 并记录密钥信息</p>
            <p>4. 配置公共访问或自定义域名</p>
          </el-alert>

          <el-form :model="config.r2" label-width="140px" class="config-form">
            <el-form-item label="启用状态">
              <el-switch v-model="config.r2.enabled" />
            </el-form-item>
            <el-form-item label="Account ID">
              <el-input v-model="config.r2.accountId" placeholder="32位十六进制字符串" clearable />
            </el-form-item>
            <el-form-item label="Access Key ID">
              <el-input v-model="config.r2.accessKeyId" type="password" show-password placeholder="访问密钥 ID" clearable />
            </el-form-item>
            <el-form-item label="Secret Access Key">
              <el-input v-model="config.r2.secretAccessKey" type="password" show-password placeholder="访问密钥" clearable />
            </el-form-item>
            <el-form-item label="Bucket Name">
              <el-input v-model="config.r2.bucketName" placeholder="存储桶名称" clearable />
            </el-form-item>
            <el-form-item label="自定义域名">
              <el-input v-model="config.r2.publicDomain" placeholder="https://img.yourdomain.com（可选）" clearable />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveConfig('r2')" :disabled="!isR2ConfigValid">保存配置</el-button>
              <el-button @click="testConnection('r2')" :disabled="!isR2ConfigValid">测试连接</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting } from '@element-plus/icons-vue'
import { adminAPI } from '../utils/api'

const activeTab = ref('telegraph')
const config = ref({
  defaultStorage: 'telegraph',
  telegraph: {
    enabled: false,
    botToken: ''
  },
  r2: {
    enabled: false,
    accountId: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
    publicDomain: ''
  }
})

// R2 配置是否有效
const isR2ConfigValid = computed(() => {
  const r2 = config.value.r2
  return r2.accountId && r2.accessKeyId && r2.secretAccessKey && r2.bucketName
})

// 格式化文件大小
const formatFileSize = size => {
  if (size < 1024) return size + ' B'
  if (size < 1048576) return (size / 1024).toFixed(2) + ' KB'
  return (size / 1048576).toFixed(2) + ' MB'
}

// 加载配置
const loadConfig = async () => {
  try {
    const response = await adminAPI.getFullStorageConfig()
    if (response.success) {
      config.value = response.data
    }
  } catch (error) {
    ElMessage.error('加载配置失败')
  }
}

// 保存配置
const saveConfig = async storageType => {
  try {
    const response = await adminAPI.updateStorageConfig(storageType, config.value[storageType])
    if (response.success) {
      ElMessage.success('配置保存成功')
    } else {
      ElMessage.error(response.message || '保存失败')
    }
  } catch (error) {
    ElMessage.error('保存配置失败')
  }
}

// 修改默认存储
const handleDefaultStorageChange = async () => {
  try {
    const response = await adminAPI.setDefaultStorage(config.value.defaultStorage)
    if (response.success) {
      ElMessage.success('默认存储设置成功')
    }
  } catch (error) {
    ElMessage.error('设置失败')
  }
}

// 测试连接
const testConnection = async storageType => {
  const loading = ElMessage.loading('正在测试连接...')
  try {
    const response = await adminAPI.testStorage(storageType)
    loading.close()

    if (response.success && response.data.available) {
      ElMessage.success(response.data.message || '连接成功')
    } else {
      ElMessage.warning(response.data.message || '连接失败')
    }
  } catch (error) {
    loading.close()
    ElMessage.error('测试失败')
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<style scoped>
.storage-settings {
  padding: 20px;
}

.settings-card {
  max-width: 900px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #409eff;
}

.default-storage-section {
  margin-bottom: 20px;
}

.section-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 12px;
}

.config-form {
  max-width: 600px;
  margin: 20px 0;
}

.el-alert p {
  margin: 5px 0;
  font-size: 14px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .storage-settings {
    padding: 10px;
  }

  .config-form {
    max-width: 100%;
  }

  :deep(.el-form-item__label) {
    width: 100% !important;
  }

  :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }
}
</style>

