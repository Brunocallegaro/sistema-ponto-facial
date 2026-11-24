import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, ImageUp, RefreshCw, ScanFace, SwitchCamera } from 'lucide-react'

const LADO_MAXIMO = 1280 // px: suficiente para o DeepFace e mantém o envio leve

/** Desenha uma imagem/vídeo num canvas reduzido e devolve um JPEG em base64. */
function paraJpeg(fonte, largura, altura) {
  const escala = Math.min(1, LADO_MAXIMO / Math.max(largura, altura))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(largura * escala)
  canvas.height = Math.round(altura * escala)
  canvas.getContext('2d').drawImage(fonte, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.92)
}

/** Lê uma foto escolhida (galeria, arquivo ou câmera do celular) já com a rotação correta. */
async function lerArquivo(arquivo) {
  if (!arquivo.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem (JPG ou PNG).')
  if (arquivo.size > 25 * 1024 * 1024) throw new Error('A foto é grande demais (máximo 25 MB).')
  try {
    // imageOrientation aplica a rotação do EXIF (fotos de celular "deitadas")
    const bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
    const url = paraJpeg(bmp, bmp.width, bmp.height)
    bmp.close?.()
    return url
  } catch {
    // alternativa para navegadores sem createImageBitmap com opções
    const src = URL.createObjectURL(arquivo)
    try {
      const img = await new Promise((ok, falha) => {
        const i = new Image()
        i.onload = () => ok(i)
        i.onerror = () => falha(new Error('Não foi possível abrir esta imagem. Use uma foto JPG ou PNG.'))
        i.src = src
      })
      return paraJpeg(img, img.naturalWidth, img.naturalHeight)
    } finally {
      URL.revokeObjectURL(src)
    }
  }
}

/**
 * Câmera exibida diretamente na interface (navigator.mediaDevices.getUserMedia)
 * + envio de foto (arquivo/galeria) + "Tirar foto" pela câmera nativa do celular.
 * A imagem é sempre convertida em JPEG base64 (data URL) antes de ir para o backend.
 *
 * Props:
 *  - foto: data URL capturada (quando existe, mostra a foto congelada)
 *  - onCapture(dataUrl, origem): origem = "camera" (ao vivo) ou "arquivo" (foto enviada)
 *  - onReset(): volta para a câmera ao vivo
 *  - busy: mostra animação de análise e desativa os botões
 *  - permitirArquivo: mostra os botões "Tirar foto"/"Enviar foto"
 */
export default function Webcam({ foto, onCapture, onReset, busy = false, captureLabel = 'Capturar foto',
  extraActions = null, permitirArquivo = true }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const galeriaRef = useRef(null)
  const cameraNativaRef = useRef(null)
  const [estado, setEstado] = useState('iniciando') // iniciando | ativa | erro
  const [erro, setErro] = useState('')
  const [frontal, setFrontal] = useState(true)
  const [variasCameras, setVariasCameras] = useState(false)
  const [espelhar, setEspelhar] = useState(true)
  const [lendo, setLendo] = useState(false)
  const [aviso, setAviso] = useState('')
  const alertaTemporario = (m) => { setAviso(m); setTimeout(() => setAviso(''), 6000) }
  const toque = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

  const parar = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const iniciar = useCallback(async () => {
    parar()
    setEstado('iniciando')
    setErro('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setEstado('erro')
      setErro(window.isSecureContext
        ? 'Este navegador não permite acesso à câmera. Use Chrome, Edge ou Safari atualizados.'
        : 'No celular, a câmera ao vivo só funciona com HTTPS (modo celular). Por enquanto, use o botão "Tirar foto" ou "Enviar foto".')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: frontal ? 'user' : 'environment' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setEstado('ativa')
      const dispositivos = await navigator.mediaDevices.enumerateDevices().catch(() => [])
      setVariasCameras(dispositivos.filter((d) => d.kind === 'videoinput').length > 1)
    } catch (e) {
      setEstado('erro')
      const msgs = {
        NotAllowedError: 'Permissão da câmera negada. Toque no ícone de câmera/cadeado na barra de endereço e permita o acesso.',
        NotFoundError: 'Nenhuma câmera foi encontrada neste aparelho.',
        NotReadableError: 'A câmera está sendo usada por outro programa (Teams, Zoom, etc.). Feche-o e tente novamente.',
        OverconstrainedError: 'A câmera não suporta a resolução solicitada.',
      }
      setErro(msgs[e.name] || `Não foi possível acessar a câmera (${e.name || e.message}).`)
    }
  }, [frontal])

  useEffect(() => {
    iniciar()
    return parar
  }, [iniciar])

  const capturar = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    setEspelhar(frontal)
    onCapture(paraJpeg(video, video.videoWidth, video.videoHeight), 'camera')
  }

  const escolherArquivo = async (e) => {
    const arquivo = e.target.files?.[0]
    e.target.value = '' // permite escolher a mesma foto de novo
    if (!arquivo) return
    setLendo(true)
    try {
      const url = await lerArquivo(arquivo)
      setEspelhar(false)
      onCapture(url, 'arquivo')
    } catch (err) {
      alertaTemporario(err.message)
    } finally {
      setLendo(false)
    }
  }

  const ocupado = busy || lendo

  return (
    <div>
      <div className="camera">
        <video ref={videoRef} className={frontal ? 'mirror' : ''} playsInline muted style={{ display: foto ? 'none' : 'block' }} />
        {foto && <img src={foto} alt="Foto capturada" className={espelhar ? 'mirror' : ''} />}

        {estado === 'ativa' && !foto && (
          <>
            <div className="camera-guide"><div className="oval" /></div>
            <div className="camera-badge"><span className="rec" /> Câmera ao vivo</div>
            {variasCameras && (
              <button type="button" className="camera-switch" onClick={() => setFrontal((f) => !f)} disabled={ocupado}
                title="Trocar entre câmera frontal e traseira" aria-label="Trocar câmera"><SwitchCamera size={20} /></button>
            )}
          </>
        )}
        {foto && !busy && <div className="camera-badge">{espelhar ? 'Foto capturada' : 'Foto enviada'}</div>}
        {busy && (<><div className="scan-line" /><div className="camera-badge"><span className="spinner" style={{ width: 12, height: 12 }} /> Analisando com DeepFace…</div></>)}

        {!foto && estado === 'iniciando' && (
          <div className="camera-msg"><div><span className="spinner" /><p>Iniciando a câmera…</p></div></div>
        )}
        {!foto && estado === 'erro' && (
          <div className="camera-msg"><div><CameraOff size={36} /><p>{erro}</p></div></div>
        )}
      </div>

      {aviso && <div className="alert alert-danger mt-sm">{aviso}</div>}

      <div className="camera-actions">
        {foto ? (
          <button type="button" className="btn btn-secondary" onClick={onReset} disabled={ocupado}><RefreshCw size={16} /> Nova captura</button>
        ) : estado === 'erro' ? (
          <button type="button" className="btn btn-secondary" onClick={iniciar}><RefreshCw size={16} /> Tentar câmera novamente</button>
        ) : (
          <button type="button" className="btn btn-primary btn-lg" onClick={capturar} disabled={estado !== 'ativa' || ocupado}>
            {captureLabel.includes('Reconhecer') ? <ScanFace size={18} /> : <Camera size={18} />} {captureLabel}
          </button>
        )}

        {permitirArquivo && !foto && (
          <>
            {/* capture="user": no celular abre direto a câmera frontal nativa (funciona mesmo sem HTTPS) */}
            {(toque || estado === 'erro') && (
              <button type="button" className={`btn ${estado === 'erro' ? 'btn-primary btn-lg' : 'btn-secondary'}`}
                onClick={() => cameraNativaRef.current?.click()} disabled={ocupado}>
                <Camera size={17} /> Tirar foto
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => galeriaRef.current?.click()} disabled={ocupado}>
              {lendo ? <span className="spinner" /> : <ImageUp size={17} />} Enviar foto
            </button>
            <input ref={cameraNativaRef} type="file" accept="image/*" capture="user" hidden onChange={escolherArquivo} />
            <input ref={galeriaRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" hidden onChange={escolherArquivo} data-testid="upload-foto" />
          </>
        )}
        {extraActions}
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>
        Dica: rosto de frente e centralizado, boa iluminação, sem boné ou óculos escuros e apenas uma pessoa na imagem.
        {permitirArquivo && ' Também é possível enviar uma foto (JPG/PNG) da galeria ou do computador.'}
      </p>
    </div>
  )
}
