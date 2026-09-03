import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // Caminhos relativos: o mesmo build funciona na raiz de um domínio e num
  // subcaminho (GitHub Pages serve o site em /lanchonete-martinica/).
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
})
