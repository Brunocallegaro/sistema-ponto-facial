import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuth } from './services/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Funcionarios from './pages/Funcionarios'
import CadastroFuncionario from './pages/CadastroFuncionario'
import FuncionarioDetalhe from './pages/FuncionarioDetalhe'
import Reconhecimento from './pages/Reconhecimento'
import RegistroPonto from './pages/RegistroPonto'
import Historico from './pages/Historico'

export default function App() {
  const { usuario } = useAuth()
  if (!usuario) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="funcionarios" element={<Funcionarios />} />
        <Route path="funcionarios/novo" element={<CadastroFuncionario />} />
        <Route path="funcionarios/:id" element={<FuncionarioDetalhe />} />
        <Route path="funcionarios/:id/editar" element={<CadastroFuncionario />} />
        <Route path="reconhecimento" element={<Reconhecimento />} />
        <Route path="ponto" element={<RegistroPonto />} />
        <Route path="historico" element={<Historico />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
