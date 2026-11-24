import { CheckCircle2, XCircle } from 'lucide-react'
import { FotoFuncionario } from './ui'

/** Exibe o resultado devolvido pelo endpoint POST /api/reconhecimento. */
export default function ResultadoReconhecimento({ resultado, detalhado = false }) {
  if (!resultado) return null
  const { reconhecido, mensagem, funcionario, distancia, limite, confianca } = resultado
  // similaridade visual: 100% quando a distância é 0, 0% quando atinge 2x o limite
  const similaridade = distancia != null ? Math.max(0, Math.min(100, (1 - distancia / (2 * limite)) * 100)) : null

  return (
    <div className={`result ${reconhecido ? 'ok' : 'fail'}`}>
      <div className="result-title">
        {reconhecido ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
        {reconhecido ? 'Funcionário identificado' : 'Reconhecimento não foi possível'}
      </div>

      {reconhecido ? (
        <div className="identity">
          <FotoFuncionario id={funcionario.id} nome={funcionario.nome} size={72} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{funcionario.nome}</div>
            <div className="muted">Matrícula <span className="mono">{funcionario.matricula}</span> · {funcionario.cargo}</div>
          </div>
        </div>
      ) : (
        <p style={{ margin: '8px 0 0' }}>{mensagem} Nenhum registro de ponto será permitido.</p>
      )}

      {detalhado && distancia != null && (
        <div style={{ marginTop: 16 }}>
          <dl className="kv">
            <dt>Distância (cosseno)</dt><dd className="mono">{distancia.toFixed(4)}</dd>
            <dt>Limite aceito</dt><dd className="mono">≤ {limite.toFixed(2)}</dd>
            {confianca != null && <><dt>Confiança (DeepFace)</dt><dd className="mono">{confianca.toFixed(1)}%</dd></>}
          </dl>
          <div className="small muted" style={{ margin: '12px 0 6px' }}>Similaridade com o cadastro mais próximo</div>
          <div className="meter"><div style={{ width: `${similaridade}%`, background: reconhecido ? 'var(--success)' : 'var(--danger)' }} /></div>
        </div>
      )}
    </div>
  )
}
