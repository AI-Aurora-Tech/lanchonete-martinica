import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { supabaseDefines } from './vite.supabase-env'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Caminhos relativos: o mesmo build funciona na raiz de um domínio e num
  // subcaminho.
  base: './',
  plugins: [react()],
  define: supabaseDefines(mode),
  server: {
    host: true,
    port: 5173,
  },
}))
