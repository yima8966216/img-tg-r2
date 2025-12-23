<template>
  <div class="storage-config">
    <el-card class="glass-card main-card" shadow="always">
      <template #header>
        <div class="card-header">
          <el-icon size="20"><Setting /></el-icon>
          <span>存储配置管理</span>
        </div>
      </template>

      <el-form :label-width="isMobile ? '0' : '120px'" :label-position="isMobile ? 'top' : 'left'" class="default-storage-form">
        <el-form-item label="默认存储方式">
          <el-select v-model="config.defaultStorage" @change="handleDefaultStorageChange" :style="{ width: isMobile ? '100%' : '240px' }">
            <el-option label="Telegraph" value="telegraph" :disabled="!config.telegraph.enabled" />
            <el-option label="Cloudflare R2" value="r2" :disabled="!config.r2.enabled" />
          </el-select>
        </el-form-item>
      </el-form>

      <el-divider />

      <el-tabs v-model="activeTab" type="border-card" class="custom-tabs" :stretch="isMobile">
        <el-tab-pane label="Telegraph" name="telegraph">
          <el-form :model="config.telegraph" :label-width="isMobile ? '0' : '140px'" :label-position="isMobile ? 'top' : 'left'">
            <el-form-item label="启用状态">
              <el-switch v-model="config.telegraph.enabled" />
            </el-form-item>

            <el-form-item label="Bot Token" required>
              <el-input v-model="editConfig.telegraph.botToken" type="password" show-password placeholder="格式: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz" />
              <el-text type="info" size="small">
                在 Telegram 搜索 @BotFather 创建 Bot 获取 Token
              </el-text>
            </el-form-item>

            <el-form-item label="Chat ID" required>
              <el-input v-model="editConfig.telegraph.chatId" placeholder="格式: @channel_name 或 -100xxxxxxxxxx" />
              <el-text type="warning" size="small">
                重要：必须先将 Bot 添加到频道/群组，否则会报错 "chat not found"
              </el-text>
              <el-text type="info" size="small">
                频道用户名（如 @my_channel）或频道 ID（如 -1001234567890）
              </el-text>
            </el-form-item>

            <el-form-item>
              <div class="button-group">
                <el-button type="primary" @click="saveConfig('telegraph')" :loading="saving" :icon="Check" :class="{ 'full-btn': isMobile }">
                  保存配置
                </el-button>
                <el-button type="success" @click="testConnection('telegraph')" :loading="testing" :icon="Connection" :class="{ 'full-btn': isMobile }">
                  测试连接
                </el-button>
                <el-button type="info" plain @click="showTelegraphHelp" :icon="QuestionFilled" :class="{ 'full-btn': isMobile }">
                  如何获取 Bot Token?
                </el-button>
              </div>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="Cloudflare R2" name="r2">
          <el-form :model="config.r2" :label-width="isMobile ? '0' : '160px'" :label-position="isMobile ? 'top' : 'left'">
            <el-form-item label="启用状态">
              <el-switch v-model="config.r2.enabled" />
            </el-form-item>

            <el-form-item label="Account ID" required>
              <el-input v-model="editConfig.r2.accountId" placeholder="Cloudflare Account ID" />
            </el-form-item>

            <el-form-item label="Access Key ID" required>
              <el-input v-model="editConfig.r2.accessKeyId" type="password" show-password placeholder="例如: abc123def456ghi789" />
              <el-text type="info" size="small">
                较短的密钥 ID（类似用户名）
              </el-text>
            </el-form-item>

            <el-form-item label="Secret Access Key" required>
              <el-input v-model="editConfig.r2.secretAccessKey" type="password" show-password placeholder="例如: a1b2c3d4e5f6g7h8i9j0..." />
              <el-text type="warning" size="small">
                较长的密钥（类似密码），与 Access Key ID 不同！
              </el-text>
            </el-form-item>

            <el-form-item label="Bucket Name" required>
              <el-input v-model="editConfig.r2.bucketName" placeholder="存储桶名称" />
            </el-form-item>

            <el-form-item label="Public Domain">
              <el-input v-model="editConfig.r2.publicDomain" placeholder="留空即可（通过服务器代理访问）" />
              <el-text type="success" size="small">
                ✓ 默认通过服务器代理访问，不暴露 R2 真实地址，无需配置公共访问
              </el-text>
            </el-form-item>

            <el-form-item>
              <div class="button-group">
                <el-button type="primary" @click="saveConfig('r2')" :loading="saving" :icon="Check" :class="{ 'full-btn': isMobile }">
                  保存配置
                </el-button>
                <el-button type="success" @click="testConnection('r2')" :loading="testing" :icon="Connection" :class="{ 'full-btn': isMobile }">
                  测试连接
                </el-button>
                <el-button type="info" plain @click="showR2Help" :icon="QuestionFilled" :class="{ 'full-btn': isMobile }">
                  配置帮助
                </el-button>
              </div>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="图片域名隔离" name="isolation">
          <el-form :label-width="isMobile ? '0' : '140px'" :label-position="isMobile ? 'top' : 'left'" style="padding: 10px;">
            <el-form-item label="启用域名隔离">
              <el-switch v-model="config.isolation.enabled" />
              <el-text type="danger" size="small" style="margin-left: 15px; font-weight: bold;" v-if="!isMobile">
                ⚠️ 开启后，下方域名将仅能访问图片链接，禁止访问主页/后台。
              </el-text>
              <div v-else style="margin-top: 5px;">
                <el-text type="danger" size="small" style="font-weight: bold;">⚠️ 专用域名禁止访问管理后台</el-text>
              </div>
            </el-form-item>

            <el-form-item label="图片专用域名">
              <el-input
                v-model="editConfig.isolation.domains"
                type="textarea"
                :rows="isMobile ? 4 : 6"
                placeholder="请输入用于展示图片的域名，每行一个。例如：img.yourdomain.com"
                style="border-radius: 12px; overflow: hidden;"
              />
              <div class="isolation-hint-box">
                <p><strong>🔒 严格用途限制规则：</strong></p>
                <ul>
                  <li>若使用上述域名访问 <strong>/</strong>（主页）或 <strong>/admin</strong>（后台），系统将直接拦截报错。</li>
                  <li>目的：确保图片流量与系统管理功能彻底解耦。</li>
                </ul>
              </div>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" @click="saveConfig('isolation')" :loading="saving" :icon="Check" class="full-btn" style="border-radius: 10px;">
                保存并应用域名隔离策略
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog v-model="telegraphHelpVisible" title="如何配置 Telegraph（Telegram Bot）" :width="isMobile ? '92%' : '700px'">
      <el-alert title="重要提示" type="warning" :closable="false" style="margin-bottom: 20px; border-radius: 12px;">
        必须先将 Bot 添加到频道并设为管理员，否则会报错 "chat not found"
      </el-alert>
      
      <el-steps direction="vertical" :active="7">
        <el-step title="步骤 1: 创建 Bot">
          <template #description>
            <div>
              <p>1. 在 Telegram 搜索 <strong>@BotFather</strong></p>
              <p>2. 发送 <code>/newbot</code> 命令</p>
              <p>3. 按提示设置 Bot 名称和用户名</p>
              <p>4. 复制获得的 <strong>Bot Token</strong></p>
            </div>
          </template>
        </el-step>
        
        <el-step title="步骤 2: 创建频道">
          <template #description>
            <div>
              <p>1. 在 Telegram 创建一个<strong>公开频道</strong>或<strong>私有频道</strong></p>
              <p>2. 设置频道名称（公开频道需要设置用户名，如 @my_images）</p>
            </div>
          </template>
        </el-step>
        
        <el-step title="步骤 3: 添加 Bot 为管理员">
          <template #description>
            <div>
              <p>1. 进入频道设置 → 管理员</p>
              <p>2. 添加管理员，搜索你的 Bot 用户名</p>
              <p>3. 将 Bot 设为管理员（至少需要发送消息权限）</p>
              <p style="color: red"><strong>⚠️ 这一步必须完成，否则 Bot 无法发送文件</strong></p>
            </div>
          </template>
        </el-step>
        
        <el-step title="步骤 4: 获取 Chat ID">
          <template #description>
            <div>
              <p><strong>方法 A: 公开频道（推荐）</strong></p>
              <p>直接使用频道用户名，格式: <code>@my_channel</code></p>
              <p style="margin-top: 10px"><strong>方法 B: 使用数字 ID</strong></p>
              <p>1. 转发频道消息给 <strong>@userinfobot</strong> 或 <strong>@getidsbot</strong></p>
              <p>2. 它会显示频道 ID，格式: <code>-1001234567890</code></p>
            </div>
          </template>
        </el-step>
      </el-steps>
      
      <el-divider />
      
      <el-alert title="常见问题" type="info" :closable="false" style="border-radius: 12px;">
        <p><strong>Q: 为什么报错 "chat not found"？</strong></p>
        <p>A: Bot 没有被添加到频道，或者 Chat ID 不正确</p>
        <p style="margin-top: 8px"><strong>Q: Chat ID 格式是什么？</strong></p>
        <p>A: 公开频道用 @username，私有频道用 -100xxxxxxxxxx（负数）</p>
      </el-alert>
    </el-dialog>

    <el-dialog v-model="r2HelpVisible" title="Cloudflare R2 配置帮助" :width="isMobile ? '92%' : '700px'">
      <el-steps direction="vertical" :active="6">
        <el-step title="步骤 1: 登录 Cloudflare">
          <template #description>
            <div>
              <p>访问 <strong>https://dash.cloudflare.com</strong></p>
              <p>使用你的账号登录到 Cloudflare 控制台</p>
            </div>
          </template>
        </el-step>
        
        <el-step title="步骤 2: 获取 Account ID">
          <template #description>
            <div>
              <p>1. 登录后，在右侧可以看到你的账户信息</p>
              <p>2. 点击任意域名进入概览页面</p>
              <p>3. 在右侧栏可以看到 <strong>Account ID</strong>（32位十六进制字符串）</p>
              <p>4. 复制这个 Account ID</p>
            </div>
          </template>
        </el-step>
        
        <el-step title="步骤 3: 进入 R2 服务">
          <template #description>
            <div>
              <p>1. 在左侧导航菜单中找到 <strong>R2</strong></p>
              <p>2. 如果是首次使用，需要先同意服务条款</p>
            </div>
          </template>
        </el-step>
        
        <el-step title="步骤 4: 创建存储桶">
          <template #description>
            <div>
              <p>1. 点击 <strong>Create bucket</strong> 按钮</p>
              <p>2. 输入存储桶名称（如：img、images 等）</p>
              <p>3. 选择存储位置（建议选择离用户最近的地区）</p>
              <p>4. 点击创建，记录下存储桶名称</p>
            </div>
          </template>
        </el-step>
        
        <el-step title="步骤 5: 创建 API Token">
          <template #description>
            <div>
              <p>1. 在 R2 页面点击 <strong>Manage R2 API Tokens</strong></p>
              <p>2. 点击 <strong>Create API Token</strong></p>
              <p>3. 输入 Token 名称（如：image-upload）</p>
              <p>4. 权限选择：<strong>Admin Read & Write</strong></p>
              <p>5. 点击创建后，会显示两个<strong>不同</strong>的值：</p>
              <p style="margin-left: 20px; color: #409eff;">
                • <strong>Access Key ID</strong>（较短，类似用户名）<br/>
                • <strong>Secret Access Key</strong>（较长，类似密码）
              </p>
              <p style="color: red;"><strong>⚠️ 重要提示：</strong></p>
              <p style="color: red; margin-left: 20px;">
                1. 这两个值是<strong>不同的</strong>，千万不要填成一样的！<br/>
                2. 密钥只显示一次，请妥善保存！
              </p>
            </div>
          </template>
        </el-step>
        
        <el-step title="步骤 6: 完成配置">
          <template #description>
            <div>
              <p style="color: #67c23a;"><strong>✓ 无需配置公共访问！</strong></p>
              <p style="margin-top: 10px;">本图床通过<strong>服务器代理</strong>访问 R2 文件：</p>
              <p>• 不暴露 R2 存储桶真实地址</p>
              <p>• 无需启用 R2 公共访问</p>
              <p>• 无需配置自定义域名</p>
              <p>• 更安全，更隐私</p>
              <p style="margin-top: 10px; color: #909399;">
                <strong>注意：</strong>如果您有自定义域名需求，可以在 Public Domain 字段填入域名，系统会优先使用自定义域名
              </p>
            </div>
          </template>
        </el-step>
      </el-steps>
      
      <el-divider />
      
      <el-alert title="常见问题" type="info" :closable="false" style="border-radius: 12px;">
        <p><strong>Q: Access Key ID 和 Secret Access Key 是一样的吗？</strong></p>
        <p>A: <span style="color: red; font-weight: bold;">不是！</span>这是两个完全不同的值，Access Key ID 较短，Secret Access Key 较长</p>
        <p style="margin-top: 8px"><strong>Q: 显示"无效的访问令牌"怎么办？</strong></p>
        <p>A: 检查 Access Key ID 和 Secret Access Key 是否正确，确保它们是不同的值</p>
        <p style="margin-top: 8px"><strong>Q: Account ID 在哪里找？</strong></p>
        <p>A: 登录后在任意域名的概览页面右侧栏可以看到</p>
        <p style="margin-top: 8px"><strong>Q: API Token 忘记了怎么办？</strong></p>
        <p>A: 密钥无法找回，只能删除旧的重新创建新的 Token</p>
        <p style="margin-top: 8px"><strong>Q: 需要配置 R2 公共访问吗？</strong></p>
        <p>A: <span style="color: #67c23a; font-weight: bold;">不需要！</span>系统通过服务器代理访问，更安全</p>
      </el-alert>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Setting, Check, Connection, QuestionFilled } from '@element-plus/icons-vue'
import { adminAPI } from '../utils/api'

const activeTab = ref('telegraph')
const saving = ref(false)
const testing = ref(false)
const telegraphHelpVisible = ref(false)
const r2HelpVisible = ref(false)
const isMobile = ref(false)

const checkMobile = () => {
  isMobile.value = window.innerWidth <= 768
}

const config = reactive({
  defaultStorage: 'telegraph',
  telegraph: { enabled: false, botToken: '', chatId: '' },
  r2: { enabled: false, accountId: '', accessKeyId: '', secretAccessKey: '', bucketName: '', publicDomain: '' },
  isolation: { enabled: false, domains: '' }
})

const editConfig = reactive({
  telegraph: { botToken: '', chatId: '' },
  r2: { accountId: '', accessKeyId: '', secretAccessKey: '', bucketName: '', publicDomain: '' },
  isolation: { domains: '' }
})

const loadConfig = async () => {
  try {
    const response = await adminAPI.getStorageConfigFull()
    if (response.success) {
      Object.assign(config, response.data)
      editConfig.telegraph.botToken = response.data.telegraph.botToken?.includes('***') ? '' : response.data.telegraph.botToken
      editConfig.telegraph.chatId = response.data.telegraph.chatId
      editConfig.r2.accountId = response.data.r2.accountId
      editConfig.r2.accessKeyId = response.data.r2.accessKeyId?.includes('***') ? '' : response.data.r2.accessKeyId
      editConfig.r2.secretAccessKey = response.data.r2.secretAccessKey?.includes('***') ? '' : response.data.r2.secretAccessKey
      editConfig.r2.bucketName = response.data.r2.bucketName
      editConfig.r2.publicDomain = response.data.r2.publicDomain
      if (response.data.isolation) editConfig.isolation.domains = response.data.isolation.domains
    }
  } catch (error) { ElMessage.error('数据加载异常') }
}

const saveConfig = async type => {
  saving.value = true
  try {
    let payload = {}
    if (type === 'telegraph') {
      payload = { ...editConfig.telegraph, enabled: config.telegraph.enabled }
    } else if (type === 'r2') {
      payload = { ...editConfig.r2, enabled: config.r2.enabled }
    } else if (type === 'isolation') {
      payload = { domains: editConfig.isolation.domains, enabled: config.isolation.enabled }
    }
    const response = await adminAPI.updateStorageConfig(type, payload)
    if (response.success) {
      ElMessage.success('配置已安全保存')
      await loadConfig()
    }
  } catch (e) { ElMessage.error('保存失败') }
  finally { saving.value = false }
}

const testConnection = async type => {
  testing.value = true
  try {
    const testData = type === 'telegraph' ? editConfig.telegraph : editConfig.r2
    const response = await adminAPI.testStorageConnection(type, testData)
    if (response.success && response.data.success) ElMessage.success(response.data.message)
    else ElMessage.error(response.data.message || '测试失败')
  } catch (e) { ElMessage.error('网络连接异常') }
  finally { testing.value = false }
}

const handleDefaultStorageChange = async () => {
  try {
    await adminAPI.setDefaultStorage(config.defaultStorage)
    ElMessage.success('默认存储策略已更新')
  } catch (e) { ElMessage.error('切换失败') }
}

const showTelegraphHelp = () => telegraphHelpVisible.value = true
const showR2Help = () => r2HelpVisible.value = true

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  loadConfig()
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>

<style scoped>
.storage-config { margin: 15px 0; }
.card-header { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #409eff; }
.glass-card { background-color: rgba(255, 255, 255, 0.75) !important; backdrop-filter: blur(12px); border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.4); }
.default-storage-form { padding: 10px 15px; background: rgba(64, 158, 255, 0.05); border-radius: 16px; }
.custom-tabs { margin-top: 15px; border-radius: 16px; overflow: hidden; }
.isolation-hint-box { margin-top: 15px; padding: 16px; background: rgba(64, 158, 255, 0.05); border-left: 4px solid #409eff; border-radius: 16px; font-size: 13px; color: #606266; line-height: 1.6; }
:deep(.el-input__wrapper), :deep(.el-textarea__inner) { background-color: rgba(255, 255, 255, 0.5) !important; border-radius: 12px; }
.button-group { display: flex; gap: 12px; flex-wrap: wrap; }
.full-btn { width: 100% !important; margin-left: 0 !important; margin-bottom: 8px; }

@media (max-width: 768px) {
  .custom-tabs :deep(.el-tabs__content) { padding: 15px 10px; }
  .isolation-hint-box { border-radius: 12px; padding: 12px; }
}
</style>