import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, Info, Save, ShieldCheck } from 'lucide-react'
import Webcam from '../components/Webcam'
import { FotoFuncionario, Spinner } from '../components/ui'
import { api } from '../services/api'
import { useToast } from '../components/Toast'

const VAZIO = { nome: '', matricula: '', cargo: '' }

function validar(f) {
  const e = {}
  const nome = f.nome.trim().replace(/\s+/g, ' ')
  if (!nome) e.nome = 'Informe o nome completo.'
  else if (nome.split(' ').length < 2) e.nome = 'Informe nome e sobrenome.'
  else if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' .-]+$/.test(nome)) e.nome = 'Use apenas letras e espaços.'
  if (!/^[A-Za-z0-9._-]{3,20}$/.test(f.matricula.trim())) e.matricula = 'De 3 a 20 caracteres: letras, números, ".", "-" ou "_".'
  if (f.cargo.trim().length < 2) e.cargo = 'Informe o cargo.'
  return e
}

export default function CadastroFuncionario() {
  const { id } = useParams()
  const editando = Boolean(id)
  const navigate = useNavigate()
  const toast = useToast()

  const [form, setForm] = useState(VAZIO)
  const [erros, setErros] = useState({})
  const [foto, setFoto] = useState(null)
  const [trocarFoto, setTrocarFoto] = useState(!editando)
  const [consentimento, setConsentimento] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [carregando, setCarregando] = useState(editando)
  const [erroApi, setErroApi] = useState('')

  useEffect(() => {
    if (!editando) return
    api.consultarFuncionario(id)
      .then((f) => setForm({ nome: f.nome, matricula: f.matricula, cargo: f.cargo }))
      .catch((e) => { toast.error(e.message); navigate('/funcionarios') })
      .finally(() => setCarregando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const alterar = (campo) => (e) => {
    setForm((f) => ({ ...f, [campo]: e.target.value }))
    setErros((er) => ({ ...er, [campo]: undefined }))
  }

  const salvar = async (e) => {
    e.preventDefault()
    setErroApi('')
    const v = validar(form)
    setErros(v)
    if (Object.keys(v).length) return
    if (trocarFoto && !foto) { setErroApi('Capture a fotografia facial pela webcam.'); return }
    if (trocarFoto && !consentimento) { setErroApi('É necessário confirmar o consentimento para o uso da imagem facial.'); return }

    setSalvando(true)
    try {
      const dados = { ...form }
      if (trocarFoto) dados.foto = foto
      const r = editando ? await api.atualizarFuncionario(id, dados) : await api.cadastrarFuncionario(dados)
      toast.success(editando ? 'Funcionário atualizado com sucesso.' : `${r.nome} cadastrado(a) com sucesso!`)
      navigate(`/funcionarios/${r.id}`)
    } catch (err) {
      setErroApi(err.message)
      if (['SEM_ROSTO', 'VARIOS_ROSTOS', 'IMAGEM_ESCURA', 'IMAGEM_CLARA', 'IMAGEM_DESFOCADA', 'ROSTO_PEQUENO'].includes(err.codigo)) setFoto(null)
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) return <div className="empty"><Spinner size={26} /></div>

  return (
    <>
      <div className="page-header">
        <div>
          <Link to="/funcionarios" className="btn btn-ghost btn-sm" style={{ marginLeft: -10, marginBottom: 6 }}><ArrowLeft size={16} /> Funcionários</Link>
          <h1>{editando ? 'Editar funcionário' : 'Cadastrar funcionário'}</h1>
          <p>{editando ? 'Altere os dados e, se necessário, capture uma nova fotografia.' : 'Preencha os dados e capture a fotografia facial pela webcam.'}</p>
        </div>
      </div>

      <form onSubmit={salvar} noValidate>
        <div className="grid grid-cam">
          <div className="card">
            <div className="card-header"><h2><Camera size={18} /> Fotografia facial</h2></div>
            <div className="card-body">
              {trocarFoto ? (
                <Webcam foto={foto} onCapture={(url) => setFoto(url)} onReset={() => setFoto(null)} busy={salvando} captureLabel="Capturar foto"
                  extraActions={editando && <button type="button" className="btn btn-ghost" onClick={() => { setTrocarFoto(false); setFoto(null) }}>Manter foto atual</button>} />
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <div style={{ display: 'inline-block' }}><FotoFuncionario id={id} nome={form.nome} size={180} /></div>
                  <p className="muted">Foto atualmente cadastrada</p>
                  <button type="button" className="btn btn-secondary" onClick={() => setTrocarFoto(true)}><Camera size={16} /> Capturar nova foto</button>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h2>Dados do funcionário</h2></div>
            <div className="card-body form-grid">
              <div className="field">
                <label htmlFor="nome">Nome completo *</label>
                <input id="nome" className={`input ${erros.nome ? 'invalid' : ''}`} value={form.nome} onChange={alterar('nome')} maxLength={120} placeholder="Ex.: Maria Oliveira Santos" />
                {erros.nome && <div className="error">{erros.nome}</div>}
              </div>
              <div className="field">
                <label htmlFor="matricula">Matrícula *</label>
                <input id="matricula" className={`input mono ${erros.matricula ? 'invalid' : ''}`} value={form.matricula} onChange={alterar('matricula')} maxLength={20} placeholder="Ex.: F0001" />
                {erros.matricula ? <div className="error">{erros.matricula}</div> : <div className="hint">Identificador único do funcionário.</div>}
              </div>
              <div className="field">
                <label htmlFor="cargo">Cargo *</label>
                <input id="cargo" className={`input ${erros.cargo ? 'invalid' : ''}`} value={form.cargo} onChange={alterar('cargo')} maxLength={80} placeholder="Ex.: Analista de RH" />
                {erros.cargo && <div className="error">{erros.cargo}</div>}
              </div>
              <div className="field">
                <label>Data de cadastro</label>
                <input className="input" value={editando ? 'Mantida' : 'Registrada automaticamente ao salvar'} disabled />
              </div>

              {trocarFoto && (
                <label className="alert alert-info" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} style={{ marginTop: 3 }} />
                  <span><ShieldCheck size={15} style={{ verticalAlign: -2 }} /> <strong>Consentimento (LGPD):</strong> o funcionário foi informado e autorizou, de forma específica, o uso da sua imagem facial exclusivamente para o registro de ponto.</span>
                </label>
              )}

              {erroApi && <div className="alert alert-danger"><Info size={18} /><div>{erroApi}</div></div>}

              <div className="row">
                <button type="submit" className="btn btn-primary btn-lg" disabled={salvando}>
                  {salvando ? <Spinner /> : <Save size={18} />} {salvando ? 'Processando rosto…' : editando ? 'Salvar alterações' : 'Cadastrar funcionário'}
                </button>
                <Link to="/funcionarios" className="btn btn-secondary btn-lg">Cancelar</Link>
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                Ao salvar, o backend valida a foto (iluminação, nitidez, um único rosto) e gera o vetor facial com o DeepFace.
                Se o mesmo rosto já estiver cadastrado em outra matrícula, o cadastro é recusado.
              </p>
            </div>
          </div>
        </div>
      </form>
    </>
  )
}
