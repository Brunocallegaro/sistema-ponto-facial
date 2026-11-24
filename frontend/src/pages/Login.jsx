import { useState } from 'react'
import { Clock3, Lock, LogIn, ScanFace, ShieldCheck, User, Users } from 'lucide-react'
import { useAuth } from '../services/AuthContext'
import { Spinner } from '../components/ui'

export default function Login() {
  const { entrar } = useAuth()
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      await entrar(usuario.trim(), senha)
    } catch (err) {
      setErro(err.message)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="login">
      <div className="login-art">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-logo"><ScanFace size={20} color="#fff" /></div>
          <div><strong>FacePonto</strong><span>Sistema de registro de ponto</span></div>
        </div>
        <div>
          <h1>Registro de ponto com reconhecimento facial.</h1>
          <ul>
            <li><ScanFace size={20} /> Identificação por DeepFace (Facenet512)</li>
            <li><Clock3 size={20} /> Entrada, intervalo e saída com validação de sequência</li>
            <li><Users size={20} /> Cadastro de funcionários com foto pela webcam</li>
            <li><ShieldCheck size={20} /> Dados biométricos protegidos conforme a LGPD</li>
          </ul>
        </div>
        <div className="small" style={{ color: '#6b7fa6' }}>Projeto acadêmico · React + FastAPI + SQLite + DeepFace</div>
      </div>

      <div className="login-form">
        <form onSubmit={enviar}>
          <h2 style={{ fontSize: 24 }}>Acessar o sistema</h2>
          <p className="muted" style={{ marginTop: 6, marginBottom: 24 }}>Entre com a conta de administrador.</p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="usuario">Usuário</label>
              <div className="input-icon"><User size={16} />
                <input id="usuario" className="input" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoFocus required />
              </div>
            </div>
            <div className="field">
              <label htmlFor="senha">Senha</label>
              <div className="input-icon"><Lock size={16} />
                <input id="senha" type="password" className="input" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
              </div>
            </div>
            {erro && <div className="alert alert-danger">{erro}</div>}
            <button className="btn btn-primary btn-lg btn-block" disabled={carregando}>
              {carregando ? <Spinner /> : <LogIn size={18} />} Entrar
            </button>
            <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>
              Padrão de demonstração: <span className="mono">admin</span> / <span className="mono">admin123</span> (altere no arquivo <span className="mono">backend/.env</span>)
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
