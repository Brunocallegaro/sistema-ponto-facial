import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, Pencil, Search, Trash2, UserPlus, Users } from 'lucide-react'
import { api, formatarDataHora } from '../services/api'
import { ConfirmDialog, EmptyState, FotoFuncionario, Spinner } from '../components/ui'
import { useToast } from '../components/Toast'

export default function Funcionarios() {
  const [lista, setLista] = useState(null)
  const [busca, setBusca] = useState('')
  const [excluir, setExcluir] = useState(null)
  const [excluindo, setExcluindo] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()

  const carregar = (termo) => api.listarFuncionarios(termo).then(setLista).catch((e) => toast.error(e.message))

  useEffect(() => {
    const t = setTimeout(() => carregar(busca), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  const confirmarExclusao = async () => {
    setExcluindo(true)
    try {
      await api.excluirFuncionario(excluir.id)
      toast.success(`${excluir.nome} foi excluído(a), junto com a fotografia e os registros.`)
      setExcluir(null)
      carregar(busca)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Funcionários</h1>
          <p>Consulte, edite ou exclua os funcionários cadastrados.</p>
        </div>
        <Link to="/funcionarios/novo" className="btn btn-primary"><UserPlus size={16} /> Novo funcionário</Link>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="input-icon" style={{ width: 340, maxWidth: '100%' }}>
            <Search size={16} />
            <input className="input" placeholder="Buscar por nome, matrícula ou cargo" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <span className="muted small">{lista ? `${lista.length} funcionário(s)` : ''}</span>
        </div>

        {!lista ? <div className="empty"><Spinner size={26} /></div> : lista.length === 0 ? (
          <EmptyState icon={Users} title={busca ? 'Nenhum funcionário encontrado' : 'Nenhum funcionário cadastrado'}>
            {!busca && <Link to="/funcionarios/novo">Cadastre o primeiro funcionário</Link>}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Funcionário</th><th>Matrícula</th><th>Cargo</th><th>Cadastro</th><th>Registros</th><th style={{ textAlign: 'right' }}>Ações</th></tr>
              </thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div className="person" style={{ cursor: 'pointer' }} onClick={() => navigate(`/funcionarios/${f.id}`)}>
                        <FotoFuncionario id={f.id} nome={f.nome} size={38} />
                        <div><strong>{f.nome}</strong><span>ID {f.id}</span></div>
                      </div>
                    </td>
                    <td className="mono">{f.matricula}</td>
                    <td>{f.cargo}</td>
                    <td className="mono small">{formatarDataHora(f.data_cadastro)}</td>
                    <td className="mono">{f.total_registros}</td>
                    <td>
                      <div className="actions">
                        <Link className="btn btn-ghost btn-icon" to={`/funcionarios/${f.id}`} title="Consultar"><Eye size={17} /></Link>
                        <Link className="btn btn-ghost btn-icon" to={`/funcionarios/${f.id}/editar`} title="Editar"><Pencil size={17} /></Link>
                        <button className="btn btn-ghost btn-icon" style={{ color: 'var(--danger)' }} onClick={() => setExcluir(f)} title="Excluir"><Trash2 size={17} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {excluir && (
        <ConfirmDialog
          title="Excluir funcionário"
          message={<>Tem certeza que deseja excluir <strong>{excluir.nome}</strong> (matrícula {excluir.matricula})? A fotografia, os dados biométricos e <strong>todos os {excluir.total_registros} registro(s) de ponto</strong> serão apagados permanentemente.</>}
          confirmLabel="Excluir definitivamente"
          loading={excluindo}
          onConfirm={confirmarExclusao}
          onClose={() => setExcluir(null)}
        />
      )}
    </>
  )
}
