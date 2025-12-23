<template>
  <div id="app">
    <el-config-provider :locale="zhCn">
      <el-header class="navbar">
        <div class="nav-container">
          <div class="nav-left">
            <router-link to="/" class="logo">
              <el-icon size="24"><Picture /></el-icon>
              <span>Vue 图床</span>
            </router-link>
          </div>

          <div class="nav-right-custom">
            <router-link to="/" class="custom-nav-item" :class="{ active: activeIndex === '/' }">
              <el-icon><House /></el-icon>
              <span>首页</span>
            </router-link>

            <router-link 
              to="/square" 
              class="custom-nav-item" 
              :class="{ active: activeIndex === '/square' }"
            >
              <el-icon><Compass /></el-icon>
              <span>图片广场</span>
            </router-link>

            <router-link 
              v-if="!isLoggedIn" 
              to="/login" 
              class="custom-nav-item" 
              :class="{ active: activeIndex === '/login' }"
            >
              <el-icon><Setting /></el-icon>
              <span>登录</span>
            </router-link>

            <router-link 
              v-if="isLoggedIn && !isInAdminPage" 
              to="/admin" 
              class="custom-nav-item" 
              :class="{ active: activeIndex.startsWith('/admin') }"
            >
              <el-icon><Setting /></el-icon>
              <span>后台管理</span>
            </router-link>

            <div 
              v-if="isLoggedIn && isInAdminPage" 
              class="custom-nav-item logout-btn" 
              @click="logout"
            >
              <el-icon><SwitchButton /></el-icon>
              <span>退出登录</span>
            </div>
          </div>
        </div>
      </el-header>

      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-config-provider>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElConfigProvider, ElMessageBox } from 'element-plus'
import { House, Picture, Setting, SwitchButton, Compass } from '@element-plus/icons-vue'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import { adminAPI } from './utils/api'

const router = useRouter()
const route = useRoute()

// 💡 状态管理：是否已登录
const isLoggedIn = ref(false)

// 💡 计算属性：当前激活的路径
const activeIndex = computed(() => route.path)

// 💡 计算属性：判断当前是否在后台页面
const isInAdminPage = computed(() => route.path.startsWith('/admin'))

// 检查管理员登录状态
const checkAdminStatus = async () => {
  const token = localStorage.getItem('admin_token')
  if (token) {
    try {
      await adminAPI.verifyToken()
      isLoggedIn.value = true
    } catch (error) {
      localStorage.removeItem('admin_token')
      isLoggedIn.value = false
    }
  } else {
    isLoggedIn.value = false
  }
}

// 监听路由变化
watch(() => route.path, () => {
  checkAdminStatus()
})

// 退出登录
const logout = () => {
  ElMessageBox.confirm('确定要退出登录吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    localStorage.removeItem('admin_token')
    isLoggedIn.value = false
    ElMessage.success('已退出登录')
    router.push('/')
  }).catch(() => {})
}

onMounted(() => {
  checkAdminStatus()
})
</script>

<style>
/* 全局样式 - 防止移动端溢出 */
* {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  overflow-x: hidden;
}

#app {
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
}

/* Element Plus 移动端适配 */
@media (max-width: 768px) {
  .el-card {
    margin: 0 !important;
  }
  .el-card__body {
    padding: 15px !important;
  }
}
</style>

<style scoped>
#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.navbar {
  background: #ffffff;
  border-bottom: 1px solid #e4e7ed;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 0;
  height: 60px !important;
  line-height: 60px;
}

.nav-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
}

.nav-left .logo {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #409eff;
  text-decoration: none;
  font-size: 20px;
  font-weight: bold;
}

/* 💡 自定义导航项样式 - 强制不换行，不显示三个点 */
.nav-right-custom {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 100%;
}

.custom-nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #606266;
  text-decoration: none;
  font-size: 15px;
  cursor: pointer;
  padding: 0 10px;
  height: 60px;
  border-bottom: 2px solid transparent;
  transition: all 0.3s ease;
  white-space: nowrap; /* 💡 强制不换行 */
}

.custom-nav-item:hover,
.custom-nav-item.active {
  color: #409eff;
  background-color: rgba(64, 158, 255, 0.08);
  border-bottom-color: #409eff;
}

.logout-btn {
  color: #f56c6c !important;
}

.logout-btn:hover {
  background-color: rgba(245, 108, 108, 0.08) !important;
  border-bottom-color: #f56c6c !important;
}

.main-content {
  flex: 1;
  padding: 0;
  background: #fafbfc;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .navbar {
    height: 50px !important;
    line-height: 50px;
  }
  .nav-container {
    padding: 0 10px;
  }
  .custom-nav-item {
    height: 50px;
    padding: 0 8px;
    font-size: 14px;
    gap: 4px;
  }
  /* 移动端如果太窄，可以隐藏文字只留图标，或者缩小间距 */
  .nav-right-custom {
    gap: 10px;
  }
}
</style>