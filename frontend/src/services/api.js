// Cliente da API REST (FastAPI). Todas as chamadas passam por aqui.
// O Vite encaminha /api para http://127.0.0.1:8000 (veja vite.config.js).
const BASE = import.meta.env.VITE_API_URL || '/api'
const TOKEN_KEY = 'faceponto_token'
const USER_KEY = 'faceponto_usuario'

export class ApiError extends Error {
  constructor(message, status, codigo) {
    super(message)
    this.status = status
    this.codigo = codigo
  }
}

let aoExpirarSessao = () => {}
export const definirAoExpirarSessao = (fn) => { aoExpirarSessao = fn }

export const sessao = {
  token: () => sessionStorage.getItem(TOKEN_KEY),
  usuario: () => sessionStorage.getItem(USER_KEY),
  salvar: (token, usuario) => { sessionStorage.setItem(TOKEN_KEY, token); sessionStorage.setItem(USER_KEY, usuario) },
  limpar: () => { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY) },
}

async function request(path, { method = 'GET', body, params, raw = false } = {}) {
  const url = new URL(BASE + path, window.location.origin)
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
  })
  const headers = {}
  const token = sessao.token()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let resp
  try {
    resp = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor. Verifique se o backend está em execução (porta 8000).', 0, 'SEM_CONEXAO')
  }

  if (resp.status === 401 && path !== '/auth/login') {
    sessao.limpar()
    aoExpirarSessao()
  }
  if (!resp.ok) {
    let detail = `Erro ${resp.status}`
    let codigo
    try {
      const data = await resp.json()
      detail = typeof data.detail === 'string' ? data.detail : detail
      codigo = data.codigo
    } catch { /* resposta sem JSON */ }
    if (resp.status === 502 || resp.status === 504) {
      detail = 'Backend indisponível. Inicie a API com "uvicorn app.main:app --port 8000".'
    }
    throw new ApiError(detail, resp.status, codigo)
  }
  if (raw) return resp
  if (resp.status === 204) return null
  return resp.json()
}

export const api = {
  status: () => request('/status'),
  login: (usuario, senha) => request('/auth/login', { method: 'POST', body: { usuario, senha } }),
  dashboard: () => request('/dashboard'),

  listarFuncionarios: (busca) => request('/funcionarios', { params: { busca } }),
  consultarFuncionario: (id) => request(`/funcionarios/${id}`),
  cadastrarFuncionario: (dados) => request('/funcionarios', { method: 'POST', body: dados }),
  atualizarFuncionario: (id, dados) => request(`/funcionarios/${id}`, { method: 'PUT', body: dados }),
  excluirFuncionario: (id) => request(`/funcionarios/${id}`, { method: 'DELETE' }),
  registrosFuncionario: (id, params) => request(`/funcionarios/${id}/registros`, { params }),
  fotoFuncionario: async (id) => {
    const resp = await request(`/funcionarios/${id}/foto`, { raw: true })
    return URL.createObjectURL(await resp.blob())
  },

  reconhecer: (imagem, origem = 'camera') => request('/reconhecimento', { method: 'POST', body: { imagem, origem } }),
  registrarPonto: (token_registro, tipo) => request('/ponto', { method: 'POST', body: { token_registro, tipo } }),

  historico: (params) => request('/registros', { params }),
  exportarCsv: async (params) => {
    const resp = await request('/registros/exportar', { params, raw: true })
    const url = URL.createObjectURL(await resp.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = `registros_ponto_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}

// ---- Utilitários de formatação ----
export const TIPOS = {
  ENTRADA: 'Entrada',
  SAIDA_INTERVALO: 'Saída para intervalo',
  RETORNO_INTERVALO: 'Retorno do intervalo',
  SAIDA_FINAL: 'Saída final',
}

export const formatarData = (iso) => {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
export const formatarHora = (h) => (h ? h.slice(0, 8) : '—')
export const formatarDataHora = (iso) => (iso ? `${formatarData(iso)} ${iso.slice(11, 16)}` : '—')
export const iniciais = (nome = '') => nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
export const hojeISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

// Configuração pública do servidor (/api/status), carregada uma única vez
let _config = null
export const configServidor = () => {
  if (!_config) _config = api.status().catch(() => { _config = null; return null })
  return _config
}
