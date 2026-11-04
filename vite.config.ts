import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { painelAgentes } from './servidor/plugin.mjs'

export default defineConfig({
  plugins: [react(), tailwindcss(), painelAgentes()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // estado do canvas, imagens, cotação e log mudam o tempo todo: não podem recarregar a página
  server: { host: true, port: 5190, strictPort: true, watch: { ignored: ['**/servidor/**', '**/.canvas.json', '**/.canvas-imagens/**', '**/.cotacao', '**/*.log', '**/docs/**'] } },
  preview: { host: true, port: 5190, strictPort: true },
})
