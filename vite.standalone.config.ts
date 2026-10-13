import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { supabaseDefines } from './vite.supabase-env'

// Gera um único HTML autocontido (CSS + JS embutidos), que abre direto no
// navegador com dois cliques, sem servidor — útil para levar o sistema para o
// balcão num computador sem infraestrutura.
// Uso: npm run build:standalone  ->  dist-standalone/index.html
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), viteSingleFile()],
  define: supabaseDefines(mode),
  build: {
    outDir: 'dist-standalone',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
}))
