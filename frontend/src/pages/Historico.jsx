import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Filter, History, X } from 'lucide-react'
import { api, formatarData, formatarHora, hojeISO, TIPOS } from '../services/api'
import { EmptyState, FotoFuncionario, OrigemTag, Spinner, TipoBadge } from '../components/ui'
import { useToast } from '../components/Toast'

const FILTRO_VAZIO = { funcionario_id: '', matricula: '', tipo: '', data_inicio: '', data_fim: '' }
const POR_PAGINA = 20

export default function Historico() {
  const toast = useToast()
  const [funcionarios, setFuncionarios] = useState([])
  const [form, setForm] = useState(FILTRO_VAZIO)
  const [filtros, setFiltros] = useState(FILTRO_VAZIO)
  const [pagina, setPagina] = useState(1)
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => { api.listarFuncionarios().then(setFuncionarios).catch(() => {}) }, [])

  useEffect(() => {
    setCarregando(true)
    api.historico({ ...filtros, pagina, limite: POR_PAGINA })
      .then(setDados)
      .catch((e) => toast.error(e.message))
      .finally(() => setCarregando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, pagina])

  const alterar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))
  const aplicar = (e) => {
    e.preventDefault()
    if (form.data_inicio && form.data_fim && form.data_inicio > form.data_fim) {
      toast.warning('A data inicial não pode ser posterior à data final.')
      return
    }
    setPagina(1)
    setFiltros(form)
  }
  const limpar = () => { setForm(FILTRO_VAZIO); setFiltros(FILTRO_VAZIO); setPagina(1) }
  const apenasHoje = () => { const h = hojeISO(); const f = { ...form, data_inicio: h, data_fim: h }; setForm(f); setFiltros(f); setPagina(1) }

  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / POR_PAGINA)) : 1
  const temFiltro = Object.values(filtros).some(Boolean)

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Histórico de registros</h1>
          <p>Consulte os registros de ponto por funcionário, matrícula, data e tipo.</p>
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={apenasHoje}>Somente hoje</button>
          <button className="btn btn-secondary" onClick={() => api.exportarCsv(filtros).catch((e) => toast.error(e.message))}><Download size={16} /> Exportar CSV</button>
        </div>
      </div>

      <form className="card card-body" onSubmit={aplicar}>
        <div className="filters">
          <div className="field">
            <label htmlFor="f-func">Funcionário</label>
            <select id="f-func" className="select" value={form.funcionario_id} onChange={alterar('funcionario_id')}>
              <option value="">Todos</option>
              {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-mat">Matrícula</label>
            <input id="f-mat" className="input mono" value={form.matricula} onChange={alterar('matricula')} placeholder="Ex.: F0001" maxLength={20} />
          </div>
          <div className="field">
            <label htmlFor="f-tipo">Tipo de registro</label>
            <select id="f-tipo" className="select" value={form.tipo} onChange={alterar('tipo')}>
              <option value="">Todos</option>
              {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-ini">Data inicial</label>
            <input id="f-ini" type="date" className="input" value={form.data_inicio} onChange={alterar('data_inicio')} />
          </div>
          <div className="field">
            <label htmlFor="f-fim">Data final</label>
            <input id="f-fim" type="date" className="input" value={form.data_fim} onChange={alterar('data_fim')} />
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <button className="btn btn-primary" type="submit"><Filter size={16} /> Filtrar</button>
            {temFiltro && <button className="btn btn-ghost btn-icon" type="button" onClick={limpar} title="Limpar filtros"><X size={18} /></button>}
          </div>
        </div>
      </form>

      <div className="card mt">
        <div className="card-header">
          <h2><History size={18} /> Registros</h2>
          <span className="muted small">{dados ? `${dados.total} registro(s) encontrado(s)` : ''} {carregando && <Spinner size={14} />}</span>
        </div>
        {!dados ? <div className="empty"><Spinner size={26} /></div> : dados.itens.length === 0 ? (
          <EmptyState title="Nenhum registro encontrado">{temFiltro ? 'Ajuste ou limpe os filtros.' : 'Ainda não há registros de ponto.'}</EmptyState>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Funcionário</th><th>Matrícula</th><th>Data</th><th>Horário</th><th>Tipo</th></tr></thead>
                <tbody>
                  {dados.itens.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link to={`/funcionarios/${r.funcionario_id}`} className="person" style={{ color: 'inherit' }}>
                          <FotoFuncionario id={r.funcionario_id} nome={r.nome} size={34} />
                          <div><strong>{r.nome}</strong><span>{r.cargo}</span></div>
                        </Link>
                      </td>
                      <td className="mono">{r.matricula}</td>
                      <td className="mono">{formatarData(r.data)}</td>
                      <td className="mono"><strong>{formatarHora(r.horario)}</strong></td>
                      <td><div className="row" style={{ gap: 8 }}><TipoBadge tipo={r.tipo} /><OrigemTag origem={r.origem} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>Página {pagina} de {totalPaginas}</span>
              <div className="row">
                <button className="btn btn-secondary btn-sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}><ChevronLeft size={16} /> Anterior</button>
                <button className="btn btn-secondary btn-sm" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>Próxima <ChevronRight size={16} /></button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
