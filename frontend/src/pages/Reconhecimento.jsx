import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Cpu, ScanFace } from 'lucide-react'
import Webcam from '../components/Webcam'
import ResultadoReconhecimento from '../components/ResultadoReconhecimento'
import { api } from '../services/api'
import useConfigServidor from '../services/useConfigServidor'

/**
 * Tela de reconhecimento facial: captura a imagem, envia ao backend e mostra
 * o resultado detalhado do DeepFace (distância, limite e confiança).
 */
export default function Reconhecimento() {
  const [foto, setFoto] = useState(null)
  const [analisando, setAnalisando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)
  const navigate = useNavigate()
  const { permitirFotoArquivo } = useConfigServidor()
  const resultadoRef = useRef(null)

  // no celular a coluna de resultado fica abaixo da câmera: rola até ela
  useEffect(() => {
    if ((resultado || erro) && window.innerWidth < 1100) resultadoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [resultado, erro])

  const reconhecer = async (dataUrl, origem) => {
    setFoto(dataUrl)
    setResultado(null)
    setErro(null)
    setAnalisando(true)
    try {
      setResultado(await api.reconhecer(dataUrl, origem))
    } catch (e) {
      setErro(e)
    } finally {
      setAnalisando(false)
    }
  }

  const reiniciar = () => { setFoto(null); setResultado(null); setErro(null) }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Reconhecimento facial</h1>
          <p>Identifique um funcionário pela câmera e veja os detalhes da comparação feita pelo DeepFace.</p>
        </div>
      </div>

      <div className="grid grid-cam">
        <div className="card card-body">
          <Webcam foto={foto} onCapture={reconhecer} onReset={reiniciar} busy={analisando} captureLabel="Reconhecer rosto" permitirArquivo={permitirFotoArquivo} />
        </div>

        <div className="card" ref={resultadoRef}>
          <div className="card-header"><h2><Cpu size={18} /> Resultado</h2></div>
          <div className="card-body">
            {!resultado && !erro && !analisando && (
              <div className="empty" style={{ padding: '30px 10px' }}>
                <ScanFace size={44} />
                <div>Posicione o rosto no contorno e clique em <strong>Reconhecer rosto</strong>.</div>
              </div>
            )}
            {analisando && <div className="empty"><span className="spinner" /><p>Detectando rosto e comparando com os cadastros…</p></div>}

            {erro && (
              <div className="result fail">
                <div className="result-title"><AlertTriangle size={22} /> Imagem recusada</div>
                <p style={{ margin: '8px 0 0' }}>{erro.message}</p>
                {erro.codigo && <p className="small muted mono" style={{ margin: '6px 0 0' }}>Código: {erro.codigo}</p>}
              </div>
            )}

            {resultado && (
              <>
                <ResultadoReconhecimento resultado={resultado} detalhado />
                {resultado.reconhecido && resultado.origem === 'arquivo' && (
                  <p className="small muted" style={{ margin: '10px 0 0' }}>Reconhecido a partir de uma foto enviada; o registro ficará marcado como "Foto enviada" no histórico.</p>
                )}
                {resultado.reconhecido && (
                  <button className="btn btn-primary btn-lg btn-block mt"
                    onClick={() => navigate('/ponto', { state: { resultado, foto, recebidoEm: Date.now() } })}>
                    Registrar ponto para {resultado.funcionario.nome.split(' ')[0]} <ArrowRight size={18} />
                  </button>
                )}
              </>
            )}

            <div className="alert alert-info mt">
              <ScanFace size={18} />
              <div className="small">
                <strong>Como funciona:</strong> o DeepFace detecta o rosto, alinha pelos olhos e gera um vetor de 512 números (Facenet512).
                Esse vetor é comparado com o de cada funcionário pela distância do cosseno. Só há identificação se a menor distância
                ficar abaixo do limite e não houver outro cadastro quase tão parecido.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
