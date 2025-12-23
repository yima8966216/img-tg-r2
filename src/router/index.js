import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Admin from '../views/Admin.vue'
import Login from '../views/Login.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home,
    meta: { title: '图床首页' }
  },
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { title: '管理员登录' }
  },
  {
    path: '/admin',
    name: 'Admin',
    component: Admin,
    meta: { title: '后台管理', requiresAuth: true }
  },
  {
    // 💡 广场页面：明确标记不需要验证
    path: '/square',
    name: 'Square',
    component: () => import('../views/Square.vue'),
    meta: { title: '图片广场', requiresAuth: false }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫 - 彻底修复死循环逻辑
router.beforeEach(async (to, from, next) => {
  // 1. 设置页面标题
  document.title = to.meta.title ? `${to.meta.title} - Vue 图床` : 'Vue 图床'

  const token = localStorage.getItem('admin_token')

  // 2. 如果是去广场或首页（白名单），直接放行，不走任何 fetch 验证，防止接口卡死网页
  if (to.path === '/square' || to.path === '/') {
    next()
    return
  }

  // 3. 如果访问登录页且已有 token
  if (to.path === '/login' && token) {
    try {
      const response = await fetch('/api/admin/verify', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.ok) {
        next('/admin')
        return
      } else {
        localStorage.removeItem('admin_token')
      }
    } catch (error) {
      localStorage.removeItem('admin_token')
    }
  }

  // 4. 检查是否需要认证 (仅针对 Admin 页面)
  if (to.meta.requiresAuth) {
    if (!token) {
      next('/login')
      return
    }

    try {
      const response = await fetch('/api/admin/verify', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!response.ok) {
        localStorage.removeItem('admin_token')
        next('/login')
        return
      }
    } catch (error) {
      localStorage.removeItem('admin_token')
      next('/login')
      return
    }
  }

  // 5. 最后一道防线：必须调用 next()
  next()
})

export default router