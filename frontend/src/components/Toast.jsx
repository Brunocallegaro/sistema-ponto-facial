import { createContext, useCallback, useContext, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

const ToastContext = createContext(null)
const ICONES = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remover = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const mostrar = useCallback((mensagem, tipo = 'info', duracao = 4500) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-3), { id, mensagem, tipo }])
    setTimeout(() => remover(id), duracao)
  }, [remover])

  const toast = {
    success: (m) => mostrar(m, 'success'),
    error: (m) => mostrar(m, 'error', 6500),
    warning: (m) => mostrar(m, 'warning', 6000),
    info: (m) => mostrar(m, 'info'),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icone = ICONES[t.tipo]
          return (
            <div key={t.id} className={`toast ${t.tipo}`}>
              <Icone size={18} />
              <p>{t.mensagem}</p>
              <button className="btn btn-ghost btn-icon" style={{ width: 22, height: 22 }} onClick={() => remover(t.id)} aria-label="Fechar">
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
