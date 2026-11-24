import { useEffect, useState } from 'react'
import { configServidor } from './api'

/** Lê /api/status uma vez: permitir_foto_arquivo, validade do reconhecimento etc. */
export default function useConfigServidor() {
  const [cfg, setCfg] = useState(null)
  useEffect(() => { configServidor().then(setCfg) }, [])
  return {
    permitirFotoArquivo: cfg?.permitir_foto_arquivo ?? true,
    validadeSegundos: cfg?.validade_reconhecimento_segundos ?? 90,
  }
}
