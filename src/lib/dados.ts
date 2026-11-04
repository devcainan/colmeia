import { useEffect, useState } from 'react'
import type { Retrato } from './tipos'
import { definirCotacao } from './formato'

function lerChave() {
  const c = new URL(location.href).searchParams.get('chave')
  try {
    if (c) localStorage.setItem('painel-chave', c)
    return c || localStorage.getItem('painel-chave') || ''
  } catch {
    return c || ''
  }
}

const CHAVE = lerChave()

export const api = (p: string) => `${p}${p.includes('?') ? '&' : '?'}chave=${encodeURIComponent(CHAVE)}`

export const urlWs = (p: string) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${api(p)}`

/** Chamada que muda algo no servidor (terminais, canvas). Devolve o JSON ou lança o erro do servidor. */
export async function enviar<T = unknown>(metodo: string, rota: string, corpo?: unknown): Promise<T> {
  const r = await fetch(api(rota), {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`)
  return j as T
}

export function useAgentes() {
  const [dados, setDados] = useState<Retrato | null>(null)
  const [conectado, setConectado] = useState(false)
  const [semChave, setSemChave] = useState(false)

  useEffect(() => {
    const es = new EventSource(api('/api/eventos'))
    es.onmessage = (e) => {
      const r: Retrato = JSON.parse(e.data)
      definirCotacao(r.cotacao?.valor)
      setDados(r)
      setConectado(true)
      setSemChave(false)
    }
    es.onerror = () => {
      setConectado(false)
      fetch(api('/api/agentes')).then((r) => setSemChave(r.status === 401)).catch(() => {})
    }
    return () => es.close()
  }, [])

  return { dados, conectado, semChave }
}

export function useJson<T>(url: string | null, intervalo = 0) {
  const [dados, setDados] = useState<T | null>(null)
  useEffect(() => {
    if (!url) { setDados(null); return }
    let vivo = true
    const buscar = () => fetch(api(url)).then((r) => (r.ok ? r.json() : null)).then((j) => { if (vivo && j) setDados(j) }).catch(() => {})
    buscar()
    const id = intervalo ? setInterval(buscar, intervalo) : 0
    return () => { vivo = false; if (id) clearInterval(id) }
  }, [url, intervalo])
  return dados
}

export function useTique(ms = 1000) {
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return agora
}
