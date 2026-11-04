import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { urlWs } from '@/lib/dados'

const TEMA = {
  background: '#0c0c10', foreground: '#e6e6ea', cursor: '#e6e6ea', selectionBackground: '#3a3a4a',
  black: '#1c1c22', brightBlack: '#5c5c66', red: '#f0707a', brightRed: '#ff8f97', green: '#7ccf8a', brightGreen: '#98e3a4',
  yellow: '#e8c06a', brightYellow: '#f5d48a', blue: '#78a6f5', brightBlue: '#9bbdff', magenta: '#c49bf0', brightMagenta: '#d7b6ff',
  cyan: '#6fcfd6', brightCyan: '#8fe3e9', white: '#d6d6dc', brightWhite: '#ffffff',
}

/** Terminal de verdade: o que se digita vai para o processo no servidor; a tela chega pelo WebSocket. */
export function TerminalXterm({ id, className }: { id: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const term = new Terminal({
      fontFamily: '"Geist Mono Variable", ui-monospace, Consolas, monospace',
      fontSize: 12, lineHeight: 1.15, cursorBlink: true, scrollback: 5000, allowProposedApi: true, theme: TEMA,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)

    // Atalhos como num terminal comum: o xterm mandaria ^V e ^C ao programa e o navegador não colaria nem copiaria.
    // Devolver false deixa o navegador agir: o colar chega ao xterm pelo evento paste (com colagem entre colchetes
    // para o Claude) e o copiar leva a seleção. Ctrl+C sem seleção continua interrompendo.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown' || !(e.ctrlKey || e.metaKey) || e.altKey) return true
      const k = e.key.toLowerCase()
      if (k === 'v') return false
      if (k === 'c' && (e.shiftKey || term.hasSelection())) return false
      return true
    })

    // Calibra o mouse com o zoom do canvas: o xterm mede o clique pelo retângulo da tela em pixels de tela,
    // mas divide pelo tamanho da letra sem zoom, e a seleção escorregava (para cima com zoom menor que 100%).
    // A medida que ele usa passa a devolver o retângulo "sem zoom" ancorado no ponto do mouse.
    const tela = el.querySelector<HTMLElement>('.xterm-screen')
    let px = 0
    let py = 0
    const marcar = (e: MouseEvent) => { px = e.clientX; py = e.clientY }
    const eventos = ['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mousemove', 'mouseup', 'click', 'dblclick', 'contextmenu'] as const
    for (const ev of eventos) window.addEventListener(ev, marcar, true)
    if (tela) {
      const original = tela.getBoundingClientRect.bind(tela)
      tela.getBoundingClientRect = () => {
        const r = original()
        const s = tela.offsetWidth ? r.width / tela.offsetWidth : 1
        if (!s || Math.abs(s - 1) < 0.001) return r
        return new DOMRect(px - (px - r.left) / s, py - (py - r.top) / s, r.width / s, r.height / s)
      }
    }
    let ws: WebSocket | null = null
    let vivo = true
    let tentativa = 0
    let timer = 0
    // O processo tem um tamanho só. Esta aba só pede um tamanho novo quando é ela que está usando o terminal
    // (foco, digitação, nó redimensionado com o foco aqui); no resto ela desenha no tamanho que o servidor avisa.
    // Antes cada aba pedia o seu e a que olhava de outro tamanho via letras "presas" que não apagavam.
    let dona = false
    const pedirTamanho = () => {
      const d = fit.proposeDimensions()
      if (!d || !d.cols || !d.rows || ws?.readyState !== WebSocket.OPEN) return
      if (d.cols !== term.cols || d.rows !== term.rows) term.resize(d.cols, d.rows)
      ws.send(JSON.stringify({ t: 'r', c: d.cols, r: d.rows }))
    }
    const assumir = () => { dona = true; pedirTamanho() }
    const ligar = () => {
      ws = new WebSocket(urlWs(`/api/terminais/${id}/ws`))
      ws.onopen = () => { tentativa = 0 }
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string') return
        if (e.data.charCodeAt(0) === 0) { // aviso de controle do servidor
          try {
            const m = JSON.parse(e.data.slice(1))
            if (m.t === 'tam') {
              if (m.c !== term.cols || m.r !== term.rows) term.resize(m.c, m.r)
              if (m.sozinho) assumir() // ninguém mais olhando: esta aba ajusta ao tamanho do nó
            }
          } catch { /* aviso inválido */ }
          return
        }
        term.write(e.data)
      }
      ws.onclose = () => { if (vivo) timer = window.setTimeout(ligar, Math.min(1000 * 2 ** tentativa++, 10000)) }
    }
    ligar()
    const entrada = term.onData((d) => {
      if (!dona) assumir()
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'i', d }))
    })
    const ro = new ResizeObserver(() => { if (dona || document.activeElement === term.textarea) pedirTamanho() })
    ro.observe(el)
    const aoFocar = () => assumir()
    const aoSair = () => { dona = false }
    term.textarea?.addEventListener('focus', aoFocar)
    term.textarea?.addEventListener('blur', aoSair)
    return () => {
      for (const ev of eventos) window.removeEventListener(ev, marcar, true)
      term.textarea?.removeEventListener('focus', aoFocar)
      term.textarea?.removeEventListener('blur', aoSair)
      vivo = false
      clearTimeout(timer)
      ro.disconnect()
      entrada.dispose()
      ws?.close()
      term.dispose()
    }
  }, [id])

  // a roda fica com o terminal (rolar o histórico): o canvas não anda porque o nó tem a classe nowheel.
  // Nada de stopPropagation aqui: no React ele roda na raiz, antes do xterm, e o terminal parava de rolar.
  return <div ref={ref} className={className} />
}
