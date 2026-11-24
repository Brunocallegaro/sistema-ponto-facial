import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarRange, Download, History, Pencil, Trash2 } from 'lucide-react'
import { api, formatarData, formatarDataHora, formatarHora } from '../services/api'
import { ConfirmDialog, EmptyState, FotoFuncionario, OrigemTag, Spinner, TipoBadge } from '../components/ui'
import { useToast } from '../components/Toast'

export default function FuncionarioDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [func, setFunc] = useState(null)
  const [registros, setRegistros] = useState(null)
  const [periodo, setPeriodo] = useState({ data_inicio: '', data_fim: '' })
  const [excluir, setExcluir] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  useEffect(() => {
    api.consultarFuncionario(id).then(setFunc).catch((e) => { toast.error(e.message); navigate('/funcionarios') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    api.registrosFuncionario(id, periodo).then(setRegistros).catch((e) => toast.error(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, periodo])

  const confirmarExclusao = async () => {
    setExcluindo(true)
    try {
      await api.excluirFuncionario(id)
      toast.success('Funcionário excluído.')
      navigate('/funcionarios')
    } catch (e) {
      toast.error(e.message)
      setExcluindo(false)
    }
  }

  if (!func) return <div className="empty"><Spinner size={26} /></div>

  // agrupa os registros por dia para o espelho de ponto
  const porDia = {}
  ;(registros || []).forEach((r) => { (porDia[r.data] ||= {})[r.tipo] = r.horario })

  return (
    <>
      <div className="page-header">
        <div>
          <Link to="/funcionarios" className="btn btn-ghost btn-sm" style={{ marginLeft: -10, marginBottom: 6 }}><ArrowLeft size={16} /> Funcionários</Link>
          <h1>{func.nome}</h1>
          <p>Ficha do funcionário e histórico individual de ponto.</p>
        </div>
        <div className="row">
          <Link to={`/funcionarios/${id}/editar`} className="btn btn-secondary"><Pencil size={16} /> Editar</Link>
          <button className="btn btn-danger" onClick={() => setExcluir(true)}><Trash2 size={16} /> Excluir</button>
        </div>
      </div>

      <div className="grid grid-detail">
        <div className="card card-body" style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block' }}><FotoFuncionario id={func.id} nome={func.nome} size={150} /></div>
          <h3 style={{ marginTop: 14 }}>{func.nome}</h3>
          <p className="muted" style={{ margin: '4px 0 18px' }}>{func.cargo}</p>
          <dl className="kv" style={{ textAlign: 'left' }}>
            <dt>ID</dt><dd className="mono">{func.id}</dd>
            <dt>Matrícula</dt><dd className="mono">{func.matricula}</dd>
            <dt>Cargo</dt><dd>{func.cargo}</dd>
            <dt>Cadastro</dt><dd className="mono">{formatarDataHora(func.data_cadastro)}</dd>
            <dt>Registros</dt><dd className="mono">{func.total_registros}</dd>
          </dl>
        </div>

        <div className="card">
          <div className="card-header">
            <h2><History size={18} /> Espelho de ponto</h2>
            <div className="row">
              <CalendarRange size={16} className="muted" />
              <input type="date" className="input" style={{ width: 150, height: 34 }} value={periodo.data_inicio} onChange={(e) => setPeriodo((p) => ({ ...p, data_inicio: e.target.value }))} aria-label="Data inicial" />
              <span className="muted">até</span>
              <input type="date" className="input" style={{ width: 150, height: 34 }} value={periodo.data_fim} onChange={(e) => setPeriodo((p) => ({ ...p, data_fim: e.target.value }))} aria-label="Data final" />
              <button className="btn btn-secondary btn-sm" onClick={() => api.exportarCsv({ funcionario_id: id, ...periodo }).catch((e) => toast.error(e.message))}><Download size={15} /> CSV</button>
            </div>
          </div>
          {!registros ? <div className="empty"><Spinner /></div> : registros.length === 0 ? (
            <EmptyState title="Sem registros no período" />
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Data</th><th>Entrada</th><th>Saída intervalo</th><th>Retorno</th><th>Saída final</th></tr></thead>
                  <tbody>
                    {Object.entries(porDia).map(([data, t]) => (
                      <tr key={data}>
                        <td className="mono"><strong>{formatarData(data)}</strong></td>
                        {['ENTRADA', 'SAIDA_INTERVALO', 'RETORNO_INTERVALO', 'SAIDA_FINAL'].map((tipo) => (
                          <td key={tipo} className="mono">{t[tipo] ? formatarHora(t[tipo]) : <span className="muted">—</span>}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card-header" style={{ borderTop: '1px solid var(--border)' }}><h2>Registros detalhados</h2></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Data</th><th>Horário</th><th>Tipo</th></tr></thead>
                  <tbody>
                    {registros.map((r) => (
                      <tr key={r.id}><td className="mono">{formatarData(r.data)}</td><td className="mono">{formatarHora(r.horario)}</td><td><div className="row" style={{ gap: 8 }}><TipoBadge tipo={r.tipo} /><OrigemTag origem={r.origem} /></div></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {excluir && (
        <ConfirmDialog title="Excluir funcionário" confirmLabel="Excluir definitivamente" loading={excluindo}
          message={<>Excluir <strong>{func.nome}</strong>? A fotografia, os dados biométricos e todos os registros de ponto serão apagados permanentemente.</>}
          onConfirm={confirmarExclusao} onClose={() => setExcluir(false)} />
      )}
    </>
  )
}
