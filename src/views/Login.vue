<template>
  <div class="login-page">
    <div class="login-container">
      <el-card class="login-card glass-card" shadow="always">
        <template #header>
          <div class="login-header">
            <el-icon size="40" color="#409eff"><Unlock /></el-icon>
            <h2>管理员登录</h2>
            <p class="subtitle">ENGINEERING CONTROL PANEL</p>
          </div>
        </template>

        <el-form ref="loginFormRef" :model="loginForm" :rules="loginRules" @submit.prevent="handleLogin">
          <el-form-item prop="username">
            <el-input 
              v-model="loginForm.username" 
              placeholder="用户名" 
              size="large" 
              :prefix-icon="User" 
              clearable 
            />
          </el-form-item>

          <el-form-item prop="password">
            <el-input 
              v-model="loginForm.password" 
              type="password" 
              placeholder="密码" 
              size="large" 
              :prefix-icon="Lock" 
              show-password 
              clearable 
              @keyup.enter="handleLogin" 
            />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" size="large" :loading="loading" @click="handleLogin" class="login-button">
              进入管理系统
            </el-button>
          </el-form-item>
        </el-form>

        <div class="login-footer">
          <el-link type="info" :underline="false" @click="$router.push('/')">返回首页</el-link>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock, Unlock } from '@element-plus/icons-vue'
import { adminAPI } from '../utils/api'

const router = useRouter()
const loginFormRef = ref()
const loading = ref(false)

const loginForm = reactive({ username: '', password: '' })
const loginRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }, { min: 5, message: '长度不少于5位', trigger: 'blur' }]
}

onMounted(async () => {
  const token = localStorage.getItem('admin_token')
  if (token) {
    try {
      await adminAPI.verifyToken()
      router.push('/admin')
    } catch (e) {
      localStorage.removeItem('admin_token')
    }
  }
})

const handleLogin = async () => {
  if (!loginFormRef.value) return
  try {
    const valid = await loginFormRef.value.validate()
    if (!valid) return
    loading.value = true
    const response = await adminAPI.login(loginForm.username, loginForm.password)
    if (response.success) {
      localStorage.setItem('admin_token', response.data.token)
      ElMessage.success('登录成功')
      router.push('/admin')
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #fcfcfc;
  background-image: 
    linear-gradient(#f1f1f1 1.5px, transparent 1.5px),
    linear-gradient(90deg, #f1f1f1 1.5px, transparent 1.5px),
    linear-gradient(#f9f9f9 1px, transparent 1px),
    linear-gradient(90deg, #f9f9f9 1px, transparent 1px);
  background-size: 60px 60px, 60px 60px, 12px 12px, 12px 12px;
}

.login-container { width: 100%; max-width: 400px; padding: 20px; }

.glass-card {
  background-color: rgba(255, 255, 255, 0.8) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
}

.glass-card:hover {
  border-color: rgba(64, 158, 255, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 15px 35px rgba(64, 158, 255, 0.1);
}

.login-header { text-align: center; }
.login-header h2 { margin: 10px 0 5px 0; color: #303133; font-weight: 700; }
.subtitle { font-size: 11px; color: #909399; letter-spacing: 2px; margin-bottom: 20px; }

.login-button { width: 100%; height: 48px; font-weight: 600; border-radius: 10px; margin-top: 10px; }
.login-footer { text-align: center; margin-top: 20px; }

:deep(.el-input__wrapper) {
  background-color: rgba(255, 255, 255, 0.5);
  border-radius: 10px;
}
</style>