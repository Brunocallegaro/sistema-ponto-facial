import { useEffect, useState } from 'react'
import { AlertTriangle, ImageUp, Inbox, User, X } from 'lucide-react'
import { api, iniciais, TIPOS } from '../services/api'

export function Spinner({ size = 18 }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="Carregando" />
}

export function TipoBadge({ tipo }) {
  return <span className={`badge badge-${tipo}`}>{TIPOS[tipo] || tipo}</span>
}

/** Indica quando o registro veio de uma foto enviada (e não da câmera ao vivo). */
export function OrigemTag({ origem }) {
  if (origem !== 'arquivo') return null
  return <span className="origem arquivo" title="Reconhecido a partir de uma foto enviada (galeria/arquivo)"><ImageUp size={12} /> Foto enviada</span>
}

export function StatCard({ icon: Icon, label, value, tone = 'blue', hint }) {
  return (
    <div className="card stat">
      <div className={`stat-icon tone-${tone}`}><Icon size={22} /></div>
      <div>
        <div className="stat-value">{value ?? '—'}</div>
        <div className="stat-label">{label}</div>
        {hint && <div className="small muted">{hint}</div>}
      </div>
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title, children }) {
  return (
    <div className="empty">
      <Icon size={40} />
      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      {children && <div className="small" style={{ marginTop: 4 }}>{children}</div>}
    </div>
  )
}

export function Modal({ title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', onConfirm, onClose, loading }) {
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
      <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>{loading ? <Spinner /> : null}{confirmLabel}</button>
    </>}>
      <div className="alert alert-danger"><AlertTriangle size={18} /><div>{message}</div></div>
    </Modal>
  )
}

/** Foto do funcionário carregada pelo endpoint autenticado (não há URL pública). */
export function FotoFuncionario({ id, nome, size = 40, versao }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let ativo = true
    let criada
    setUrl(null)
    api.fotoFuncionario(id).then((u) => { criada = u; if (ativo) setUrl(u) }).catch(() => {})
    return () => { ativo = false; if (criada) URL.revokeObjectURL(criada) }
  }, [id, versao])
  return (
    <div className="photo" style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {url ? <img src={url} alt={`Foto de ${nome}`} /> : nome ? <strong>{iniciais(nome)}</strong> : <User size={size * 0.5} />}
    </div>
  )
}
