import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, definirAoExpirarSessao, sessao } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(sessao.usuario())

  const sair = useCallback(() => {
    sessao.limpar()
    setUsuario(null)
  }, [])

  useEffect(() => { definirAoExpirarSessao(() => setUsuario(null)) }, [])

  const entrar = async (nome, senha) => {
    const r = await api.login(nome, senha)
    sessao.salvar(r.access_token, r.usuario)
    setUsuario(r.usuario)
  }

  return <AuthContext.Provider value={{ usuario, entrar, sair }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
