import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Clock3, History, LayoutDashboard, LogOut, Menu, ScanFace, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { useAuth } from '../services/AuthContext'
import { api } from '../services/api'

const MENU = [
  { secao: 'Visão geral' },
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { secao: 'Ponto' },
  { to: '/ponto', label: 'Registrar ponto', icon: Clock3 },
  { to: '/reconhecimento', label: 'Reconhecimento facial', icon: ScanFace },
  { to: '/historico', label: 'Histórico', icon: History },
  { secao: 'Cadastros' },
  { to: '/funcionarios', label: 'Funcionários', icon: Users, end: true },
  { to: '/funcionarios/novo', label: 'Novo funcionário', icon: UserPlus },
]

function Relogio() {
  const [agora, setAgora] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="clock">
      <span className="hide-sm">{agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} · </span>
      {agora.toLocaleTimeString('pt-BR')}
    </div>
  )
}

function StatusModelo() {
  const [st, setSt] = useState(null)
  useEffect(() => {
    let timer
    const verificar = () => api.status()
      .then((s) => { setSt(s); if (!s.reconhecimento.pronto && !s.reconhecimento.erro) timer = setTimeout(verificar, 3000) })
      .catch(() => { setSt({ offline: true }); timer = setTimeout(verificar, 5000) })
    verificar()
    return () => clearTimeout(timer)
  }, [])
  if (!st) return null
  if (st.offline) return <div><span className="status-dot err" />API offline</div>
  const r = st.reconhecimento
  return (
    <div>
      <div><span className={`status-dot ${r.erro ? 'err' : r.pronto ? 'ok' : 'loading'}`} />
        {r.erro ? 'Erro no modelo' : r.pronto ? 'DeepFace pronto' : 'Carregando modelo…'}</div>
      <div style={{ color: '#6b7fa6', marginTop: 4 }}>{r.modelo} · {r.detector} · limite {r.limite?.toFixed(2)}</div>
    </div>
  )
}

export default function Layout() {
  const { usuario, sair } = useAuth()
  const [aberto, setAberto] = useState(false)
  const local = useLocation()
  useEffect(() => setAberto(false), [local.pathname])

  return (
    <div className="app">
      <aside className={`sidebar ${aberto ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-logo"><ScanFace size={20} color="#fff" /></div>
          <div><strong>FacePonto</strong><span>Ponto por reconhecimento facial</span></div>
        </div>
        <nav className="nav">
          {MENU.map((item, i) => item.secao
            ? <div key={i} className="nav-section">{item.secao}</div>
            : <NavLink key={item.to} to={item.to} end={item.end}><item.icon size={18} />{item.label}</NavLink>)}
        </nav>
        <div className="sidebar-footer">
          <StatusModelo />
          <div style={{ marginTop: 12, color: '#6b7fa6', display: 'flex', gap: 6, alignItems: 'center' }}><ShieldCheck size={14} /> Dados biométricos protegidos (LGPD)</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="row">
            <button className="btn btn-ghost btn-icon menu-toggle" onClick={() => setAberto((v) => !v)} aria-label="Abrir menu"><Menu size={20} /></button>
            <Relogio />
          </div>
          <div className="topbar-right">
            <div className="user-chip"><div className="avatar">{usuario?.[0]?.toUpperCase()}</div><span className="hide-sm">{usuario}</span></div>
            <button className="btn btn-ghost btn-sm" onClick={sair}><LogOut size={16} /> <span className="hide-sm">Sair</span></button>
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  )
}
