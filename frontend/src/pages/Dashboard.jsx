import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, CalendarCheck, Clock3, Coffee, History, ListChecks, UserCheck, UserPlus, Users } from 'lucide-react'
import { api, formatarData, formatarHora, hojeISO } from '../services/api'
import { EmptyState, FotoFuncionario, Spinner, StatCard, TipoBadge } from '../components/ui'
import { useToast } from '../components/Toast'

export default function Dashboard() {
  const [dados, setDados] = useState(null)
  const toast = useToast()

  useEffect(() => {
    api.dashboard().then(setDados).catch((e) => toast.error(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!dados) return <div className="empty"><Spinner size={28} /></div>

  const maximo = Math.max(1, ...dados.registros_por_dia.map((d) => d.total))
  const hoje = hojeISO()

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Resumo do controle de ponto em tempo real.</p>
        </div>
        <div className="row">
          <Link to="/funcionarios/novo" className="btn btn-secondary"><UserPlus size={16} /> Novo funcionário</Link>
          <Link to="/ponto" className="btn btn-primary"><Clock3 size={16} /> Registrar ponto</Link>
        </div>
      </div>

      <div className="grid grid-4">
        <StatCard icon={Users} label="Funcionários cadastrados" value={dados.total_funcionarios} tone="blue" />
        <StatCard icon={ListChecks} label="Registros realizados (total)" value={dados.total_registros} tone="cyan" />
        <StatCard icon={CalendarCheck} label="Registros hoje" value={dados.registros_hoje} tone="amber" />
        <StatCard icon={UserCheck} label="Trabalhando agora" value={dados.presentes_agora} tone="green"
          hint={dados.em_intervalo ? `${dados.em_intervalo} em intervalo` : null} />
      </div>

      <div className="grid grid-2 mt">
        <div className="card">
          <div className="card-header"><h2><BarChart3 size={18} /> Registros nos últimos 7 dias</h2></div>
          <div className="card-body">
            <div className="bars">
              {dados.registros_por_dia.map((d) => (
                <div className="bar-col" key={d.data} title={`${formatarData(d.data)}: ${d.total} registro(s)`}>
                  <span className="v">{d.total}</span>
                  <div className={`bar ${d.data === hoje ? 'today' : ''}`} style={{ height: `${(d.total / maximo) * 100}%`, opacity: d.data === hoje ? 1 : 0.75 }} />
                  <span className="l">{formatarData(d.data).slice(0, 5)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2><History size={18} /> Últimos registros</h2>
            <Link to="/historico" className="btn btn-ghost btn-sm">Ver histórico</Link>
          </div>
          {dados.ultimos_registros.length === 0 ? (
            <EmptyState icon={Coffee} title="Nenhum registro ainda">Os registros de ponto aparecerão aqui.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {dados.ultimos_registros.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="person">
                          <FotoFuncionario id={r.funcionario_id} nome={r.nome} size={34} />
                          <div><strong>{r.nome}</strong><span>Mat. {r.matricula}</span></div>
                        </div>
                      </td>
                      <td><TipoBadge tipo={r.tipo} /></td>
                      <td className="mono" style={{ textAlign: 'right' }}>{formatarData(r.data)}<br /><span className="muted">{formatarHora(r.horario)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
