import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Coffee, LogIn, LogOut, RotateCcw, Timer, Undo2 } from 'lucide-react'
import Webcam from '../components/Webcam'
import ResultadoReconhecimento from '../components/ResultadoReconhecimento'
import { Spinner, TipoBadge } from '../components/ui'
import { api, formatarData, formatarHora, TIPOS } from '../services/api'
import { useToast } from '../components/Toast'
import useConfigServidor from '../services/useConfigServidor'


const OPCOES = [
  { tipo: 'ENTRADA', icon: LogIn, tone: 'tone-green', desc: 'Início da jornada' },
  { tipo: 'SAIDA_INTERVALO', icon: Coffee, tone: 'tone-amber', desc: 'Pausa para almoço/descanso' },
  { tipo: 'RETORNO_INTERVALO', icon: Undo2, tone: 'tone-cyan', desc: 'Volta do intervalo' },
  { tipo: 'SAIDA_FINAL', icon: LogOut, tone: 'tone-red', desc: 'Encerramento da jornada' },
]

function Etapas({ atual }) {
  const nomes = ['Identificação facial', 'Tipo de registro', 'Confirmação']
  return (
    <div className="steps">
      {nomes.map((n, i) => (
        <div key={n} className={`step ${i === atual ? 'active' : i < atual ? 'done' : ''}`}>
          <b><span>{i < atual ? '✓' : i + 1}</span></b>{n}
        </div>
      ))}
    </div>
  )
}

export default function RegistroPonto() {
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const { permitirFotoArquivo, validadeSegundos: VALIDADE_SEGUNDOS } = useConfigServidor()
  const painelRef = useRef(null)
  const vindoDoReconhecimento = location.state?.resultado
  const [foto, setFoto] = useState(location.state?.foto || null)
  const [resultado, setResultado] = useState(vindoDoReconhecimento || null)
  const [inicio, setInicio] = useState(location.state?.recebidoEm || null)
  const [restante, setRestante] = useState(90)
  const [analisando, setAnalisando] = useState(false)
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(null)
  const [registro, setRegistro] = useState(null)
  const timerReset = useRef(null)

  // limpa o state de navegação para não reutilizar o token num refresh
  useEffect(() => { if (vindoDoReconhecimento) navigate('.', { replace: true, state: null }) }, []) // eslint-disable-line

  // contagem regressiva da validade do reconhecimento
  useEffect(() => {
    if (!resultado?.reconhecido || registro) return
    const tick = () => {
      const r = VALIDADE_SEGUNDOS - Math.floor((Date.now() - inicio) / 1000)
      setRestante(r)
      if (r <= 0) { reiniciar(); toast.warning('O reconhecimento expirou. Faça a identificação novamente.') }
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [resultado, inicio, registro, VALIDADE_SEGUNDOS]) // eslint-disable-line

  useEffect(() => () => clearTimeout(timerReset.current), [])

  // no celular o painel de escolha fica abaixo da câmera: rola até ele
  useEffect(() => {
    if ((resultado || erro || registro) && window.innerWidth < 1100) painelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [resultado, erro, registro])

  const reiniciar = () => {
    clearTimeout(timerReset.current)
    setFoto(null); setResultado(null); setErro(null); setRegistro(null); setEnviando(null)
  }

  const identificar = async (dataUrl, origem) => {
    setFoto(dataUrl); setErro(null); setResultado(null); setAnalisando(true)
    try {
      const r = await api.reconhecer(dataUrl, origem)
      setResultado(r)
      setInicio(Date.now())
    } catch (e) {
      setErro(e)
    } finally {
      setAnalisando(false)
    }
  }

  const registrar = async (tipo) => {
    setEnviando(tipo)
    try {
      const r = await api.registrarPonto(resultado.token_registro, tipo)
      setRegistro(r)
      toast.success(`${TIPOS[tipo]} registrada para ${r.nome} às ${formatarHora(r.horario)}.`)
      timerReset.current = setTimeout(reiniciar, 12000) // volta sozinho para o próximo funcionário
    } catch (e) {
      toast.error(e.message)
      if (e.status === 409 && /expirou|utilizado/.test(e.message)) reiniciar()
    } finally {
      setEnviando(null)
    }
  }

  const etapa = registro ? 2 : resultado?.reconhecido ? 1 : 0
  const jaFeito = Object.fromEntries((resultado?.registros_hoje || []).map((r) => [r.tipo, r.horario]))

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Registro de ponto</h1>
          <p>Identifique-se pela câmera e escolha o tipo de registro.</p>
        </div>
        {(resultado || erro) && <button className="btn btn-secondary" onClick={reiniciar}><RotateCcw size={16} /> Recomeçar</button>}
      </div>

      <Etapas atual={etapa} />

      <div className="grid grid-cam">
        <div className="card card-body">
          <Webcam foto={foto} onCapture={identificar} onReset={reiniciar} busy={analisando} captureLabel="Reconhecer e registrar" permitirArquivo={permitirFotoArquivo} />
        </div>

        <div className="card" ref={painelRef}>
          <div className="card-body">
            {etapa === 0 && !resultado && !erro && !analisando && (
              <div className="empty" style={{ padding: '30px 10px' }}>
                <Timer size={44} />
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>Aguardando identificação</div>
                <div className="small">Olhe para a câmera e clique em <strong>Reconhecer e registrar</strong>.</div>
              </div>
            )}
            {analisando && <div className="empty"><Spinner size={24} /><p>Identificando funcionário…</p></div>}

            {erro && (
              <div className="result fail">
                <div className="result-title"><AlertTriangle size={22} /> Não foi possível identificar</div>
                <p style={{ margin: '8px 0 0' }}>{erro.message}</p>
                <p className="small" style={{ margin: '8px 0 0' }}>Nenhum registro foi realizado. Capture uma nova foto.</p>
              </div>
            )}

            {resultado && !registro && <ResultadoReconhecimento resultado={resultado} />}

            {resultado?.reconhecido && !registro && (
              <>
                <div className="row mt" style={{ justifyContent: 'space-between' }}>
                  <h3 style={{ fontSize: 15 }}>Selecione o registro</h3>
                  <span className={`small mono ${restante <= 20 ? '' : 'muted'}`} style={{ color: restante <= 20 ? 'var(--danger)' : undefined }}>
                    <Timer size={13} style={{ verticalAlign: -2 }} /> válido por {restante}s
                  </span>
                </div>
                {resultado.proximos_tipos.length === 0 && (
                  <div className="alert alert-warning mt-sm"><AlertTriangle size={18} /><div>A jornada de hoje já foi encerrada (saída final registrada). Nenhum novo registro é permitido hoje.</div></div>
                )}
                <div className="punch-grid mt-sm">
                  {OPCOES.map(({ tipo, icon: Icon, tone, desc }) => {
                    const permitido = resultado.proximos_tipos.includes(tipo)
                    const motivo = jaFeito[tipo] ? `Registrado às ${formatarHora(jaFeito[tipo])}` : permitido ? desc : 'Fora da sequência'
                    return (
                      <button key={tipo} className="punch" disabled={!permitido || enviando !== null} onClick={() => registrar(tipo)}>
                        <div className={`punch-icon ${tone}`}>{enviando === tipo ? <Spinner /> : <Icon size={19} />}</div>
                        <strong>{TIPOS[tipo]}</strong>
                        <span>{motivo}</span>
                      </button>
                    )
                  })}
                </div>
                {resultado.registros_hoje.length > 0 && (
                  <div className="mt">
                    <div className="small muted" style={{ marginBottom: 4 }}>Registros de hoje</div>
                    <ul className="timeline">
                      {resultado.registros_hoje.map((r) => (
                        <li key={r.id}><TipoBadge tipo={r.tipo} /><span className="mono">{formatarHora(r.horario)}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {registro && (
              <div className="result ok" style={{ textAlign: 'center', padding: 28 }}>
                <CheckCircle2 size={54} color="var(--success)" />
                <h2 style={{ marginTop: 10, color: 'var(--success)' }}>Ponto registrado!</h2>
                <dl className="kv" style={{ textAlign: 'left', maxWidth: 340, margin: '18px auto 0' }}>
                  <dt>Funcionário</dt><dd>{registro.nome}</dd>
                  <dt>Matrícula</dt><dd className="mono">{registro.matricula}</dd>
                  <dt>Data</dt><dd className="mono">{formatarData(registro.data)}</dd>
                  <dt>Horário</dt><dd className="mono" style={{ fontSize: 18 }}>{formatarHora(registro.horario)}</dd>
                  <dt>Tipo</dt><dd><TipoBadge tipo={registro.tipo} /></dd>
                </dl>
                <button className="btn btn-primary btn-lg mt" onClick={reiniciar}><RotateCcw size={18} /> Próximo funcionário</button>
                <p className="small muted" style={{ marginBottom: 0 }}>A tela será reiniciada automaticamente em alguns segundos.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
