import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// O proxy encaminha /api para o backend FastAPI (porta 8000).
// Assim o navegador fala apenas com o Vite e não há problemas de CORS.
const backend = process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'
const proxy = { '/api': { target: backend, changeOrigin: true } }

export default defineConfig(({ mode }) => {
  // "npm run celular": HTTPS + acesso pela rede Wi-Fi (necessário para a câmera
  // ao vivo do celular, pois os navegadores só liberam a câmera em HTTPS ou localhost).
  const celular = mode === 'celular'
  const servidor = {
    host: celular ? true : 'localhost', // true = escuta em todas as interfaces (0.0.0.0)
    port: 5173,
    strictPort: true,
    proxy,
  }
  return {
    plugins: [react(), ...(celular ? [basicSsl({ name: 'faceponto' })] : [])],
    server: servidor,
    preview: servidor,
  }
})
