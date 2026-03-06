import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/calendar_app/',   // 这里改成你的仓库名，比如 '/myapp/'
})
