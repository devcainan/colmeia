import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as EventoArraste, type MouseEvent as EventoMouse, type PointerEvent as EventoPonteiro } from 'react'
import {
  Background, BackgroundVariant, ConnectionMode, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider, SelectionMode, applyNodeChanges, useReactFlow, useStore,
  type Connection, type Edge, type FinalConnectionState, type Node, type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  CircleStop, Crown, Eye, EyeOff, Frame as IconeFrame, Gauge, GitBranch, ImagePlus, Info, LayoutDashboard, LayoutGrid, ListChecks, Maximize, Maximize2, MousePointer2, Pencil,
  Link2, LocateFixed, Play, Plus, RotateCcw, Send, Square, StickyNote, Terminal as IconeTerminal, Trash2, Type, Unlink, type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { api, enviar, useTique } from '@/lib/dados'
import { AGENTES, statusDaTarefa } from '@/lib/formato'
import type { Bloco, EstadoCanvas, Forma, Ligacao, Posicao, Sessao, Terminal, TipoForma, TipoTerminal, TipoWidget, Widget } from '@/lib/tipos'
import {
  desfazer, juntar, ligarHistorico, passoBlocoApagado, passoBlocoCriado, passoFormaApagada, passoFormaCriada,
  passoLigacaoCriada, passoMovimento, refazer, registrar, type Passo,
} from './historico'
import { Confirmar, type Pergunta } from './Confirmar'
import { TerminalXterm } from './TerminalXterm'
import { MenuContexto, type ItemMenu, type Menu } from './MenuContexto'
import { cortar, tiposDeAresta, type DadosAresta } from './arestas'
import { LinhaDeLigacao } from './ligacao'
import { LogoClaude, LogoCodex, type Icone } from './logos'
import { Acoes, caminhoDoTraco, tiposDeNo, type AcoesCanvas, type DadosBloco, type DadosForma, type DadosSessao, type DadosSub, type DadosTerminal } from './nos'
import { COR, LEGENDA, ROTULO_TIPO, ST, corDoTerminal, iconeDoTerminal, nomeDoTerminal } from './cores'
import { COR_WIDGET, ICONE_WIDGET, NOME_WIDGET, NoWidget, TAM_WIDGET, type DadosNoWidget, type ItemValidacao } from './widgets'

const TIPOS_DE_NO = { ...tiposDeNo, widget: NoWidget }

const TAM: Record<string, { w: number; h: number }> = {
  terminal: { w: 680, h: 500 }, git: { w: 700, h: 600 }, sessao: { w: 300, h: 150 },
  subagente: { w: 200, h: 40 }, nota: { w: 280, h: 220 }, checklist: { w: 300, h: 300 },
  frame: { w: 480, h: 320 }, retangulo: { w: 200, h: 120 }, texto: { w: 240, h: 40 }, imagem: { w: 320, h: 240 }, desenho: { w: 100, h: 100 },
  video: { w: 360, h: 400 }, pagina: { w: 1024, h: 720 },
}

// ---------- ferramentas do quadro (como no Figma) ----------

type Ferramenta = 'mover' | 'frame' | 'retangulo' | 'texto' | 'lapis'
const FERRAMENTAS: { id: Ferramenta; rotulo: string; tecla: string; Icone: LucideIcon }[] = [
  { id: 'mover', rotulo: 'Mover', tecla: 'V', Icone: MousePointer2 },
  { id: 'frame', rotulo: 'Frame', tecla: 'F', Icone: IconeFrame },
  { id: 'retangulo', rotulo: 'Retângulo', tecla: 'R', Icone: Square },
  { id: 'texto', rotulo: 'Texto', tecla: 'T', Icone: Type },
  { id: 'lapis', rotulo: 'Lápis', tecla: 'P', Icone: Pencil },
]
const CORES = ['#a1a1aa', '#f87171', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#38bdf8', '#818cf8', '#e879f9', '#f5f5f5', '#18181b']
const NOMES_COR = ['Cinza', 'Vermelho', 'Laranja', 'Amarelo', 'Verde', 'Turquesa', 'Azul', 'Anil', 'Rosa', 'Branco', 'Preto']

/** Terminais de agente (Claude e Codex) na ordem do canvas: da esquerda para a direita, de cima para baixo. */
const agentesDoCanvas = (nos: Node[]) => nos
  .filter((n) => n.type === 'terminal' && ((n.data as DadosTerminal).t.tipo === 'claude' || (n.data as DadosTerminal).t.tipo === 'codex'))
  .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)

/** No dock: lista os agentes do canvas; clicar leva a visão até o frame dele, sem rolar o canvas. */
function IrAteAgente({ nos, aoIr }: { nos: Node[]; aoIr: (id: string) => void }) {
  const [aberto, setAberto] = useState(false)
  const agentes = agentesDoCanvas(nos)
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="size-8 rounded-lg" title="Ir até um agente · Tab: próximo · Shift+Tab: anterior · segurando Tab, as setas andam só entre os que estão trabalhando" disabled={!agentes.length}>
          <LocateFixed className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" sideOffset={14} className="flex max-h-80 w-72 flex-col gap-0.5 overflow-x-hidden overflow-y-auto p-1">
        <p className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">Ir até o agente</p>
        {agentes.map((n) => {
          const { t, sessao } = n.data as DadosTerminal
          const Icone = iconeDoTerminal(t)
          const st = ST[t.status]
          return (
            <button key={n.id} onClick={() => { setAberto(false); aoIr(n.id) }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent">
              <Icone className="size-3.5 shrink-0" style={{ color: corDoTerminal(t) }} />
              <span className="min-w-0 flex-1 truncate" title={nomeDoTerminal(t, sessao)}>{nomeDoTerminal(t, sessao)}</span>
              <span className="size-2 shrink-0 rounded-full" style={{ background: st.cor }} title={st.rotulo} />
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
const TAMANHOS_TEXTO: [string, number][] = [['Pequeno', 14], ['Médio', 18], ['Grande', 32], ['Título', 56]]

/** Foco num campo, no terminal ou num texto em edição: as teclas e o colar são dele, não do quadro. */
const digitando = () => {
  const el = document.activeElement as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || !!el.closest('.xterm, .nokey'))
}

async function subirImagem(arq: Blob) {
  const r = await fetch(api('/api/formas/imagem'), { method: 'POST', headers: { 'Content-Type': arq.type }, body: arq })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`)
  return j.url as string
}

const medidaDaImagem = (arq: Blob) => createImageBitmap(arq).then((b) => { const m = { w: b.width, h: b.height }; b.close(); return m }).catch(() => ({ w: 320, h: 240 }))
// subagente concluído sai do canvas em 30 s; o parado sem ter concluído (comando longo, interrompido) fica 15 min
const SUB_RECENTE = 15 * 60 * 1000
const SUB_FIM = 30 * 1000

const salvar = (posicoes: Record<string, Posicao>) => { void enviar('PUT', '/api/canvas', { posicoes }).catch(() => {}) }

/** Grupo da versão pelo começo do título: "A2: Antes e agora" -> "A", "Versão 3" -> "Versão". Sem número, não tem grupo. */
const grupoDoVideo = (titulo: string) => /^\s*([A-Za-zÀ-ÿ]+)\s*\d+\b/.exec(titulo || '')?.[1]?.toLowerCase() || null

/** Subagente fica sempre em fila logo embaixo do nó pai (terminal ou sessão), inclusive enquanto o pai é arrastado.
 *  Antes ele só se posicionava ao aparecer: se o terminal ou o frame andasse, o subagente ficava longe, fora da vista. */
function prenderSubagentes(ns: Node[]): Node[] {
  const porId = new Map(ns.map((n) => [n.id, n]))
  const fila = new Map<string, number>()
  let mudou = false
  const out = ns.map((n) => {
    if (n.type !== 'subagente') return n
    const pai = porId.get((n.data as { pai?: string }).pai || '')
    if (!pai) return n
    const k = fila.get(pai.id) || 0
    fila.set(pai.id, k + 1)
    const w = (n.width as number) || TAM.subagente.w
    const alturaPai = (pai.height as number) || pai.measured?.height || 150
    const x = pai.position.x + k * (w + 14)
    const y = pai.position.y + alturaPai + 28
    if (n.position.x === x && n.position.y === y) return n
    mudou = true
    return { ...n, position: { x, y } }
  })
  return mudou ? out : ns
}
const lerLocal = (k: string, padrao: string) => { try { return localStorage.getItem(k) ?? padrao } catch { return padrao } }
const gravarLocal = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sem armazenamento */ } }

type NovoTerminal = { tipo: TipoTerminal; cwd: string; titulo?: string; prompt?: string; modo?: string; pai?: string; paiSessao?: string }

// ---------- formulários da barra ----------

function CampoPasta({ valor, aoMudar, pastas }: { valor: string; aoMudar: (v: string) => void; pastas: string[] }) {
  return (
    <>
      <Input list="pastas-canvas" value={valor} onChange={(e) => aoMudar(e.target.value)} placeholder="C:\Users\TI\Downloads\projeto" className="h-8 font-mono text-xs" />
      <datalist id="pastas-canvas">{pastas.map((p) => <option key={p} value={p} />)}</datalist>
    </>
  )
}

function FormTerminal({ pastas, pastaPadrao, aoCriar }: { pastas: string[]; pastaPadrao: string; aoCriar: (n: NovoTerminal) => Promise<void> }) {
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState<TipoTerminal>('claude')
  const [cwd, setCwd] = useState(pastaPadrao)
  const [titulo, setTitulo] = useState('')
  const [prompt, setPrompt] = useState('')
  const [modo, setModo] = useState('default')
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => { if (aberto) setCwd(pastaPadrao) }, [aberto, pastaPadrao])
  const abrir = async () => {
    setErro(null)
    try { await aoCriar({ tipo, cwd, titulo, prompt: prompt.trim() || undefined, modo }); setAberto(false); setTitulo(''); setPrompt('') }
    catch (e) { setErro((e as Error).message) }
  }
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild><Button size="sm" className="h-8 gap-1.5 rounded-lg"><Plus className="size-3.5" />Terminal</Button></PopoverTrigger>
      <PopoverContent side="top" sideOffset={14} className="grid w-80 gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1"><Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoTerminal)}>
              <SelectTrigger size="sm" className="h-8 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(ROTULO_TIPO) as TipoTerminal[]).map((k) => <SelectItem key={k} value={k}>{ROTULO_TIPO[k]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {tipo === 'claude' && (
            <div className="grid gap-1"><Label className="text-xs">Permissões</Label>
              <Select value={modo} onValueChange={setModo}>
                <SelectTrigger size="sm" className="h-8 w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="default">Padrão</SelectItem><SelectItem value="acceptEdits">Aceitar edições</SelectItem></SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="grid gap-1"><Label className="text-xs">Pasta</Label><CampoPasta valor={cwd} aoMudar={setCwd} pastas={pastas} /></div>
        <div className="grid gap-1"><Label className="text-xs">Nome</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="opcional" className="h-8 text-xs" /></div>
        {(tipo === 'claude' || tipo === 'codex') && (
          <div className="grid gap-1"><Label className="text-xs">Tarefa inicial</Label><Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="opcional: já começa com este pedido" className="min-h-16 text-xs" /></div>
        )}
        {erro && <p className="text-xs text-destructive">{erro}</p>}
        <Button size="sm" onClick={() => void abrir()} className="gap-1.5"><Play className="size-3.5" />Abrir</Button>
      </PopoverContent>
    </Popover>
  )
}

function FormLider({ pastas, pastaPadrao, aberto, setAberto }: { pastas: string[]; pastaPadrao: string; aberto: boolean; setAberto: (v: boolean) => void }) {
  const [objetivo, setObjetivo] = useState('')
  const [cwd, setCwd] = useState(pastaPadrao)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => { if (aberto) setCwd(pastaPadrao) }, [aberto, pastaPadrao])
  const criar = async () => {
    setErro(null)
    try { await enviar('POST', '/api/lider', { objetivo, cwd }); gravarLocal('canvas-pasta', cwd); setAberto(false); setObjetivo('') }
    catch (e) { setErro((e as Error).message) }
  }
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild><Button size="sm" variant="ghost" className="h-8 gap-1.5 rounded-lg text-xs"><Crown className="size-3.5" style={{ color: COR.lider }} />Líder</Button></PopoverTrigger>
      <PopoverContent side="top" sideOffset={14} className="grid w-96 gap-3">
        <div className="grid gap-1">
          <p className="text-sm font-medium">Orquestrar uma demanda</p>
          <p className="text-xs text-muted-foreground">O líder abre como terminal aqui no canvas, separa a demanda em checklist, abre um trabalhador por área (ligados a ele), acompanha e junta no fim. Itens com [validar] esperam sua resposta.</p>
        </div>
        <div className="grid gap-1"><Label className="text-xs">Objetivo</Label><Textarea value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="Ex.: revisar e corrigir os testes que falham no backend" className="min-h-20 text-xs" /></div>
        <div className="grid gap-1"><Label className="text-xs">Pasta do projeto</Label><CampoPasta valor={cwd} aoMudar={setCwd} pastas={pastas} /></div>
        {erro && <p className="text-xs text-destructive">{erro}</p>}
        <Button size="sm" disabled={!objetivo.trim()} onClick={() => void criar()} className="gap-1.5"><Crown className="size-3.5" />Começar</Button>
      </PopoverContent>
    </Popover>
  )
}

function Contexto({ handoff }: { handoff: EstadoCanvas['handoff'] }) {
  const [limite, setLimite] = useState(String(Math.round(handoff.limite / 1000)))
  useEffect(() => setLimite(String(Math.round(handoff.limite / 1000))), [handoff.limite])
  const gravar = (h: Partial<EstadoCanvas['handoff']>) => void enviar('PUT', '/api/canvas', { handoff: { ...handoff, ...h } }).catch(() => {})
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-8 gap-1 rounded-lg px-2 text-[11px] text-muted-foreground" title="Passagem automática de contexto">
          <Gauge className="size-3.5" />{handoff.ligado ? `${Math.round(handoff.limite / 1000)} mil` : 'desligada'}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" sideOffset={14} className="grid w-72 gap-3">
        <div className="grid gap-1">
          <p className="text-sm font-medium">Passagem automática de contexto</p>
          <p className="text-xs text-muted-foreground">Quando um Claude do canvas passa do limite e para, ele escreve um resumo .md e continua num chat novo, no mesmo nó. Vale para o líder e para os trabalhadores.</p>
        </div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={handoff.ligado} onChange={(e) => gravar({ ligado: e.target.checked })} />Ligada</label>
        <div className="grid gap-1"><Label className="text-xs">Limite (mil tokens)</Label>
          <Input type="number" min={50} max={950} step={50} value={limite} onChange={(e) => setLimite(e.target.value)} onBlur={() => gravar({ limite: Number(limite) * 1000 })} className="h-8 text-xs" />
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ---------- camada de desenho (frame, retângulo, texto, lápis) ----------

type Caixa = { x: number; y: number; w: number; h: number }

/** Por cima do quadro enquanto uma ferramenta de desenho está ativa. A roda continua andando e dando zoom. */
function Desenhar({ ferramenta, cor, aoCriar }: {
  ferramenta: Exclude<Ferramenta, 'mover'>; cor: string
  aoCriar: (tipo: TipoForma, caixa: Caixa, dados?: Partial<Forma>) => void
}) {
  const { screenToFlowPosition, getViewport, setViewport } = useReactFlow()
  const ref = useRef<HTMLDivElement>(null)
  const [tela, setTela] = useState<{ a: { x: number; y: number }; b: { x: number; y: number }; traco: [number, number][] } | null>(null)
  const traco = useRef<[number, number][]>([]) // pontos do lápis no quadro

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const roda = (e: WheelEvent) => {
      e.preventDefault()
      const v = getViewport()
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        const zoom = Math.min(2, Math.max(0.08, v.zoom * Math.exp(-e.deltaY * 0.002)))
        const px = e.clientX - r.left
        const py = e.clientY - r.top
        void setViewport({ zoom, x: px - ((px - v.x) / v.zoom) * zoom, y: py - ((py - v.y) / v.zoom) * zoom })
      } else void setViewport({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY })
    }
    el.addEventListener('wheel', roda, { passive: false })
    return () => el.removeEventListener('wheel', roda)
  }, [getViewport, setViewport])

  const local = (e: EventoPonteiro) => { const r = ref.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const noQuadro = (e: EventoPonteiro) => screenToFlowPosition({ x: e.clientX, y: e.clientY })

  // o arraste vive na ref, em coordenadas do quadro: se a tela andar ou der zoom no meio do traço, a prévia vai junto
  const arraste = useRef<{ a: { x: number; y: number }; b: { x: number; y: number }; telaA: { x: number; y: number }; longe: number } | null>(null)
  // botão do meio arrasta o quadro mesmo com a ferramenta ligada, como no modo normal
  const andando = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const descer = (e: EventoPonteiro) => {
    if (e.button === 1) {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      const v = getViewport()
      andando.current = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y }
      return
    }
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const q = noQuadro(e)
    traco.current = [[q.x, q.y]]
    arraste.current = { a: q, b: q, telaA: local(e), longe: 0 }
    setTela({ a: q, b: q, traco: [[q.x, q.y]] })
  }
  const mover = (e: EventoPonteiro) => {
    const anda = andando.current
    if (anda) { void setViewport({ ...getViewport(), x: anda.vx + e.clientX - anda.x, y: anda.vy + e.clientY - anda.y }); return }
    const d = arraste.current
    if (!d) return
    const p = local(e)
    d.longe = Math.max(d.longe, Math.hypot(p.x - d.telaA.x, p.y - d.telaA.y))
    d.b = noQuadro(e)
    if (ferramenta === 'lapis') traco.current.push([d.b.x, d.b.y])
    setTela({ a: d.a, b: d.b, traco: ferramenta === 'lapis' ? [...traco.current] : [] })
  }
  const subir = (e: EventoPonteiro) => {
    if (andando.current) { andando.current = null; return }
    const d = arraste.current
    if (!d) return
    arraste.current = null
    const fim = noQuadro(e)
    if (ferramenta === 'lapis') traco.current.push([fim.x, fim.y])
    const [ix, iy] = traco.current[0]
    const inicio = { x: ix, y: iy }
    const p = local(e)
    const longe = Math.max(d.longe, Math.hypot(p.x - d.telaA.x, p.y - d.telaA.y))
    const pequeno = longe < 6
    setTela(null)
    if (ferramenta === 'lapis') {
      const pts = traco.current
      // clique sem arrastar não vira traço: era o que deixava pontinhos soltos pelo quadro
      if (pts.length < 2 || longe < 4) return
      const xs = pts.map((p) => p[0])
      const ys = pts.map((p) => p[1])
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      const w = Math.max(Math.max(...xs) - x, 1)
      const h = Math.max(Math.max(...ys) - y, 1)
      aoCriar('desenho', { x, y, w, h }, { cor, espessura: 3, pontos: pts.map(([px, py]) => [(px - x) / w, (py - y) / h]) })
      return
    }
    const base = TAM[ferramenta === 'texto' ? 'texto' : ferramenta]
    const caixa = pequeno || ferramenta === 'texto'
      ? { x: fim.x, y: fim.y, w: base.w, h: base.h }
      : { x: Math.min(inicio.x, fim.x), y: Math.min(inicio.y, fim.y), w: Math.abs(fim.x - inicio.x), h: Math.abs(fim.y - inicio.y) }
    aoCriar(ferramenta === 'texto' ? 'texto' : ferramenta, caixa, { cor: ferramenta === 'texto' ? (cor === CORES[0] ? 'var(--foreground)' : cor) : cor })
  }

  // prévia: pontos do quadro levados para a tela com o zoom e a posição de agora
  const [vx, vy, zoom] = useStore((s) => s.transform)
  const naTela = (p: { x: number; y: number }) => ({ x: p.x * zoom + vx, y: p.y * zoom + vy })
  const ret = tela && ferramenta !== 'lapis' && ferramenta !== 'texto'
    ? (() => { const a = naTela(tela.a), b = naTela(tela.b); return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) } })()
    : null
  return (
    <div ref={ref} className={cn('absolute inset-0 z-[5]', ferramenta === 'texto' ? 'cursor-text' : 'cursor-crosshair')}
      onPointerDown={descer} onPointerMove={mover} onPointerUp={subir} onPointerCancel={() => { arraste.current = null; andando.current = null; setTela(null) }}
      onContextMenu={(e) => e.preventDefault()}>
      {ret && <div className="pointer-events-none absolute rounded-md border-2" style={{ ...ret, borderColor: cor, background: ferramenta === 'frame' ? 'transparent' : `color-mix(in oklch, ${cor} 22%, transparent)` }} />}
      {tela && ferramenta === 'lapis' && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          <path d={caminhoDoTraco(tela.traco.map(([x, y]) => { const q = naTela({ x, y }); return [q.x, q.y] as [number, number] }), 1)}
            fill="none" stroke={cor} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )
}

// ---------- canvas ----------

type Props = { canvas: EstadoCanvas; sessoes: Sessao[]; visiveis: Sessao[]; tema: string; aoAbrir: (id: string) => void }

function Quadro({ canvas, sessoes, visiveis, tema, aoAbrir }: Props) {
  const [nos, setNos] = useState<Node[]>([])
  const [mostrarFora, setMostrarFora] = useState(() => lerLocal('canvas-fora', '1') !== '0')
  const [ampliado, setAmpliado] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  // "tem certeza?" do Delete: o onBeforeDelete espera a resposta por esta promessa
  const [pergunta, setPergunta] = useState<Pergunta | null>(null)
  const perguntar = (p: Omit<Pergunta, 'responder'>) =>
    new Promise<boolean>((ok) => setPergunta({ ...p, responder: (sim) => { setPergunta(null); ok(sim) } }))
  const [liderAberto, setLiderAberto] = useState(false)
  const [ferramenta, setFerramenta] = useState<Ferramenta>('mover')
  const [cor, setCor] = useState(() => lerLocal('canvas-cor', CORES[0]))
  // formas recém-criadas: aparecem na hora, antes de o servidor mandar o canvas de volta
  const [extras, setExtras] = useState<Forma[]>([])
  const { fitView, screenToFlowPosition, setCenter, getViewport, setViewport } = useReactFlow()
  // Ctrl + scroll em qualquer ponto do canvas dá zoom só no canvas, até em cima de terminal e nota
  // (eles ignoram a roda para rolar o próprio conteúdo, e o navegador acabava dando zoom na página)
  const quadroRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // escuta na janela, em captura: o terminal para a roda no nível do React (antes do canvas), então
    // um ouvinte no próprio canvas nunca recebia o Ctrl + scroll e o navegador dava zoom na página
    const roda = (e: WheelEvent) => {
      const el = quadroRef.current
      if ((!e.ctrlKey && !e.metaKey) || !el || !el.contains(e.target as globalThis.Node)) return
      e.preventDefault()
      e.stopPropagation()
      const v = getViewport()
      const r = el.getBoundingClientRect()
      const zoom = Math.min(2, Math.max(0.08, v.zoom * Math.exp(-e.deltaY * 0.0025)))
      const px = e.clientX - r.left
      const py = e.clientY - r.top
      void setViewport({ zoom, x: px - ((px - v.x) / v.zoom) * zoom, y: py - ((py - v.y) / v.zoom) * zoom })
    }
    window.addEventListener('wheel', roda, { capture: true, passive: false })
    return () => window.removeEventListener('wheel', roda, { capture: true })
  }, [getViewport, setViewport])
  const primeiraVez = useRef(true)
  const pendentes = useRef(new Map<string, { x: number; y: number; w?: number; h?: number }>()) // onde o nó criado pelo menu deve nascer
  const ultimoPonto = useRef<{ x: number; y: number } | null>(null) // onde o mouse está no quadro, para o colar
  const formas = useMemo(() => {
    const doServidor = canvas.formas ?? []
    const ids = new Set(doServidor.map((f) => f.id))
    return [...doServidor, ...extras.filter((f) => !ids.has(f.id))]
  }, [canvas.formas, extras])
  // forma recém-criada aparece na hora (extras) até o servidor mandá-la. Se ela for apagada ou desfeita antes
  // disso, nunca chega: depois de 3 s sem aparecer no servidor, sai da lista (antes ela voltava sozinha)
  const nascidas = useRef(new Map<string, number>())
  const podarExtras = useCallback(() => {
    const ids = new Set((canvasRef.current.formas ?? []).map((f) => f.id))
    const agora = Date.now()
    setExtras((xs) => {
      const ficam = xs.filter((f) => !ids.has(f.id) && agora - (nascidas.current.get(f.id) ?? 0) < 3000)
      return ficam.length === xs.length ? xs : ficam
    })
  }, []) // canvasRef é declarado mais abaixo (desfazer/refazer); só é lido quando a poda roda, depois do render
  useEffect(() => { podarExtras() }, [canvas.formas, podarExtras])

  const porSessao = useMemo(() => new Map(sessoes.map((s) => [s.id, s])), [sessoes])
  const terminalDaSessao = useMemo(() => new Map(canvas.terminais.filter((t) => t.sessao).map((t) => [t.sessao!, t])), [canvas.terminais])
  // sessão de fora aberta por um agente do canvas (marca do MCP ou presa à mão): fica embaixo dele, não na fila de fora
  const donoDaSessao = useMemo(() => {
    const vivos = new Set(canvas.terminais.map((t) => t.id))
    return new Map(Object.entries(canvas.donos ?? {}).filter((e): e is [string, string] => !!e[1] && vivos.has(e[1])))
  }, [canvas.donos, canvas.terminais])
  const fora = useMemo(() => (mostrarFora ? visiveis.filter((s) => s.papel === 'principal' && s.status !== 'fechada' && !terminalDaSessao.has(s.id) && !donoDaSessao.has(s.id)) : []), [visiveis, terminalDaSessao, donoDaSessao, mostrarFora])
  const pastas = useMemo(() => [...new Set([...canvas.terminais.map((t) => t.cwd), ...sessoes.map((s) => s.pasta).filter((p): p is string => !!p)])], [canvas.terminais, sessoes])
  const pastaPadrao = lerLocal('canvas-pasta', pastas[0] || '')

  // nó de origem de cada sessão: o terminal dela no canvas ou o nó da sessão de fora
  const noDaSessao = useCallback((id: string) => {
    const t = terminalDaSessao.get(id)
    if (t) return `t:${t.id}`
    const dono = donoDaSessao.get(id)
    if (dono) return `t:${dono}`
    return fora.some((s) => s.id === id) ? `s:${id}` : null
  }, [terminalDaSessao, donoDaSessao, fora])

  const ligadosA = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of canvas.ligacoes) {
      for (const [a, b] of [[l.de, l.para], [l.para, l.de]]) if ((a.startsWith('b:') || a.startsWith('w:')) && b.startsWith('t:')) m.set(a, (m.get(a) || 0) + 1)
    }
    return m
  }, [canvas.ligacoes])

  // itens [validar] de todas as sessões abertas, para o widget de validações
  const validacoes = useMemo<ItemValidacao[]>(() => sessoes
    .filter((s) => s.status !== 'fechada')
    .flatMap((s) => s.checklist.filter((x) => statusDaTarefa(x) === 'validar').map((x) => ({
      sessao: s, titulo: x.titulo, id: `${s.id}:${x.id}`, terminal: terminalDaSessao.get(s.id)?.id ?? null,
    }))), [sessoes, terminalDaSessao])

  // subagentes ativos ou recentes de cada sessão visível
  // o servidor só manda novidade a cada 30 s quando está tudo quieto: o relógio tira o concluído na hora certa
  const tique = useTique(5000)
  const subs = useMemo(() => {
    const agora = tique
    const out: { id: string; pai: string; d: DadosSub }[] = []
    for (const s of sessoes) {
      const pai = noDaSessao(s.id)
      if (!pai) continue
      for (const sub of s.subagentes) {
        const janela = sub.status === 'fechada' ? SUB_FIM : SUB_RECENTE
        if (sub.status === 'trabalhando' || (sub.ultima && agora - sub.ultima < janela)) out.push({ id: `sub:${sub.id}`, pai, d: { sub, agente: s.agente } })
      }
    }
    // sessões de fora que um agente abriu: em fila embaixo dele, como os subagentes
    for (const s of sessoes) {
      const dono = donoDaSessao.get(s.id)
      if (!dono || s.papel !== 'principal' || s.status === 'fechada' || terminalDaSessao.has(s.id)) continue
      const sub = { id: s.id, titulo: s.titulo, nome: s.nome, status: s.status, total: s.total, custo: s.custo, modelo: s.modelo, inicio: s.inicio, ultima: s.ultima, fazendo: s.fazendo?.texto ?? null, esperando: s.esperando ?? null }
      out.push({ id: `sub:${s.id}`, pai: `t:${dono}`, d: { sub, agente: s.agente, sessao: true } })
    }
    return out
  }, [sessoes, noDaSessao, donoDaSessao, terminalDaSessao, tique])

  useEffect(() => {
    setNos((antes) => {
      const atual = new Map(antes.map((n) => [n.id, n]))
      const prontos: Node[] = []
      const novos: Record<string, Posicao> = {}
      const filhos = new Map<string, number>()
      const ocupados = () => [...antes, ...prontos]
      const lugar = (id: string, base: { w: number; h: number }, pai?: string, lado = false) => {
        const a = atual.get(id)
        // o ponto do clique só sai da lista quando o nó já existe: o React roda esta função duas vezes em
        // desenvolvimento, e apagar na primeira fazia a segunda cair na colocação automática (fora do lugar)
        if (a) { pendentes.current.delete(id); return { position: a.position, width: a.width ?? base.w, height: a.height ?? base.h } }
        const pendente = pendentes.current.get(id)
        const salvo = canvas.posicoes[id]
        if (salvo && !pendente) return { position: { x: salvo.x, y: salvo.y }, width: salvo.w ?? base.w, height: salvo.h ?? base.h }
        if (pendente) base = { w: pendente.w ?? base.w, h: pendente.h ?? base.h }
        let p = pendente ? { x: pendente.x, y: pendente.y } : undefined
        if (!p) {
          const noPai = pai ? ocupados().find((n) => n.id === pai) : undefined
          const k = pai ? (filhos.get(pai) || 0) : 0
          if (pai) filhos.set(pai, k + 1)
          // subagente: em fila logo embaixo do pai, ligado por cima; trabalhador: mais abaixo, deixando a fila livre
          if (noPai && lado) p = { x: noPai.position.x + k * (base.w + 14), y: noPai.position.y + ((noPai.height as number) || 300) + 28 }
          else if (noPai) p = { x: noPai.position.x + k * (base.w + 50), y: noPai.position.y + ((noPai.height as number) || 300) + 130 }
          else {
            const direita = ocupados().reduce((m, n) => Math.max(m, n.position.x + ((n.width as number) || 300)), -60)
            p = { x: direita + 60, y: 0 }
          }
        }
        if (!lado) novos[id] = { ...p, w: base.w, h: base.h }
        return { position: p, width: base.w, height: base.h }
      }
      const marcado = (id: string) => atual.get(id)?.selected
      // mantém o estado interno do nó (arrastando, medido) quando os dados chegam no meio de um arraste
      const por = (n: Node) => { const a = atual.get(n.id); prontos.push(a ? { ...a, ...n } : n) }

      // formas: o frame fica atrás de tudo e só pega o mouse pelo nome; as outras arrastam pelo corpo inteiro
      const forma = (f: Forma) => {
        const id = `f:${f.id}`
        const frame = f.tipo === 'frame'
        por({
          id, type: f.tipo, dragHandle: frame ? '.alca' : undefined, zIndex: frame ? -1 : 0, style: frame ? { pointerEvents: 'none' } : undefined,
          ...lugar(id, TAM[f.tipo]), selected: marcado(id), data: { f } satisfies DadosForma,
        })
      }
      for (const f of formas) if (f.tipo === 'frame') forma(f)
      // sessão de fora e subagente não têm campo para digitar: arrastam pelo cartão inteiro
      // altura livre: o cartão cresce com o botão de migrar e a checklist
      for (const s of fora) por({ id: `s:${s.id}`, type: 'sessao', dragHandle: undefined, ...lugar(`s:${s.id}`, TAM.sessao), height: undefined, selected: marcado(`s:${s.id}`), data: { s } satisfies DadosSessao })
      // líderes antes dos trabalhadores, para eles nascerem embaixo
      const ordem = [...canvas.terminais].sort((a, b) => Number(!!(a.pai || a.paiSessao)) - Number(!!(b.pai || b.paiSessao)) || a.criadoEm - b.criadoEm)
      for (const t of ordem) {
        const id = `t:${t.id}`
        const pai = t.pai ? `t:${t.pai}` : t.paiSessao ? noDaSessao(t.paiSessao) || undefined : undefined
        por({
          id, type: 'terminal', dragHandle: '.alca', ...lugar(id, t.tipo === 'git' ? TAM.git : TAM.terminal, pai), selected: marcado(id),
          data: { t, sessao: t.sessao ? porSessao.get(t.sessao) || null : null, git: canvas.git[t.cwd] || null, ligados: 0 } satisfies DadosTerminal,
        })
      }
      for (const w of canvas.widgets ?? []) {
        const id = `w:${w.id}`
        por({
          id, type: 'widget', dragHandle: '.alca', ...lugar(id, TAM_WIDGET[w.tipo]), selected: marcado(id),
          data: { w, dados: canvas.widgetsDados?.[w.id] ?? null, ligados: ligadosA.get(id) || 0, validacoes } satisfies DadosNoWidget,
        })
      }
      for (const b of canvas.blocos) {
        const id = `b:${b.id}`
        por({ id, type: b.tipo, dragHandle: '.alca', ...lugar(id, TAM[b.tipo]), selected: marcado(id), data: { b, ligados: ligadosA.get(id) || 0 } satisfies DadosBloco })
      }
      // subagente não arrasta sozinho: fica preso embaixo do pai (prenderSubagentes)
      for (const x of subs) por({ id: x.id, type: 'subagente', dragHandle: undefined, draggable: false, ...lugar(x.id, TAM.subagente, x.pai, true), selected: marcado(x.id), data: { ...x.d, pai: x.pai } })
      for (const f of formas) if (f.tipo !== 'frame') forma(f)
      if (Object.keys(novos).length) salvar(novos)
      return prenderSubagentes(prontos)
    })
  }, [canvas, formas, fora, porSessao, noDaSessao, ligadosA, subs, validacoes])

  useEffect(() => {
    if (primeiraVez.current && nos.length) { primeiraVez.current = false; requestAnimationFrame(() => void fitView({ maxZoom: 0.9, padding: 0.12 })) }
  }, [nos.length, fitView])

  // centro de cada nó: a ligação sai do lado virado para o outro
  const centros = useMemo(() => new Map(nos.map((n) => [n.id, n.position.x + (((n.width as number) || n.measured?.width || 300) / 2)])), [nos])
  const arestas = useMemo<Edge[]>(() => {
    const out: Edge[] = []
    // hierarquia: o pai sai por baixo, o trabalhador e o subagente entram por cima
    for (const t of canvas.terminais) {
      const origem = t.pai ? `t:${t.pai}` : t.paiSessao ? noDaSessao(t.paiSessao) : null
      if (origem) out.push({ id: `e:${origem}-${t.id}`, type: 'corte', source: origem, sourceHandle: 'baixo', target: `t:${t.id}`, targetHandle: 'cima', animated: t.status === 'trabalhando', data: { soltar: t.id }, style: { stroke: t.papel === 'trabalhador' ? COR.trabalhador : corDoTerminal(t), strokeWidth: 2 } })
    }
    for (const x of subs) {
      // fio na cor do estado, como o anel da pílula: verde trabalhando, âmbar esperando, tracejado cinza quando para
      const { status, esperando } = x.d.sub
      const cor = esperando ? 'var(--espera)' : status === 'trabalhando' ? 'var(--ok)' : 'var(--fechada)'
      out.push({ id: `e:${x.id}`, source: x.pai, sourceHandle: 'baixo', target: x.id, targetHandle: 'cima', animated: status === 'trabalhando', deletable: false, style: { stroke: cor, strokeWidth: 1.5, strokeDasharray: status === 'trabalhando' || esperando ? undefined : '4 4' } })
    }
    for (const l of canvas.ligacoes) {
      const bloco = [l.de, l.para].find((n) => n.startsWith('b:'))
      const tipo = canvas.blocos.find((b) => `b:${b.id}` === bloco)?.tipo
      const widget = (canvas.widgets ?? []).find((w) => l.de === `w:${w.id}` || l.para === `w:${w.id}`)
      const deEsquerda = (centros.get(l.de) ?? 0) <= (centros.get(l.para) ?? 0)
      out.push({
        id: `l:${l.id}`, type: 'corte', source: l.de, target: l.para, sourceHandle: deEsquerda ? 'dir' : 'esq', targetHandle: deEsquerda ? 'esq' : 'dir',
        data: { ligacao: l.id }, style: { stroke: tipo ? COR[tipo] : widget ? COR_WIDGET[widget.tipo] : 'var(--muted-foreground)', strokeWidth: 2 },
      })
    }
    return out
  }, [canvas.terminais, canvas.ligacoes, canvas.blocos, canvas.widgets, subs, noDaSessao, centros])

  // Espaço com vários nós selecionados: alinha por igual (coluna se estão mais na vertical, linha se mais na horizontal; Shift inverte)
  const nosRef = useRef(nos)
  nosRef.current = nos
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || el.closest('.xterm'))) return
      const sel = nosRef.current.filter((n) => n.selected)
      if (sel.length < 2) return
      e.preventDefault()
      const w = (n: Node) => (n.width as number) || n.measured?.width || 300
      const h = (n: Node) => (n.height as number) || n.measured?.height || 200
      const x0 = Math.min(...sel.map((n) => n.position.x))
      const y0 = Math.min(...sel.map((n) => n.position.y))
      const largura = Math.max(...sel.map((n) => n.position.x + w(n))) - x0
      const altura = Math.max(...sel.map((n) => n.position.y + h(n))) - y0
      const coluna = (altura >= largura) !== e.shiftKey
      const ESPACO = 40
      const novas: Record<string, { x: number; y: number }> = {}
      let cursor = coluna ? y0 : x0
      for (const n of [...sel].sort((a, b) => (coluna ? a.position.y - b.position.y : a.position.x - b.position.x))) {
        novas[n.id] = coluna ? { x: x0, y: cursor } : { x: cursor, y: y0 }
        cursor += (coluna ? h(n) : w(n)) + ESPACO
      }
      const antes = foto()
      setNos((ns) => ns.map((n) => (novas[n.id] ? { ...n, position: novas[n.id] } : n)))
      salvar(Object.fromEntries(sel.map((n) => [n.id, { ...novas[n.id], w: w(n), h: h(n) }])))
      registrar(passoMovimento(antes, { ...antes, ...Object.fromEntries(sel.map((n) => [n.id, { ...antes[n.id], ...novas[n.id] }])) }))
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  // ---------- desfazer / refazer ----------
  const canvasRef = useRef(canvas)
  canvasRef.current = canvas
  // posição e tamanho de todos os nós agora (para o histórico comparar antes e depois)
  const foto = () => Object.fromEntries(nosRef.current.map((n) => [n.id, { x: n.position.x, y: n.position.y, w: n.width as number | undefined, h: n.height as number | undefined }]))
  useEffect(() => {
    ligarHistorico({
      aplicarPosicoes: (m) => {
        setNos((ns) => ns.map((n) => {
          const p = m[n.id]
          return p ? { ...n, position: { x: p.x, y: p.y }, ...(p.w ? { width: p.w } : {}), ...(p.h ? { height: p.h } : {}) } : n
        }))
        salvar(m)
      },
      bloco: (id) => canvasRef.current.blocos.find((b) => b.id === id),
      posicao: (no) => {
        const n = nosRef.current.find((x) => x.id === no)
        return n ? { x: n.position.x, y: n.position.y, w: n.width as number | undefined, h: n.height as number | undefined } : canvasRef.current.posicoes[no]
      },
      ligacoesDe: (no) => canvasRef.current.ligacoes.filter((l) => l.de === no || l.para === no),
    })
    // Ctrl+Z desfaz, Ctrl+Shift+Z ou Ctrl+Y refaz; dentro de terminal ou campo de texto fica com o próprio campo
    const tecla = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.code !== 'KeyZ' && e.code !== 'KeyY')) return
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || el.closest('.xterm'))) return
      e.preventDefault()
      if (e.code === 'KeyY' || e.shiftKey) void refazer()
      else void desfazer()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])
  const fotoArraste = useRef<Record<string, Posicao>>({})
  const fotoRedimensionar = useRef<Record<string, Posicao>>({})

  const aoMudar = useCallback((ch: NodeChange[]) => setNos((ns) => prenderSubagentes(applyNodeChanges(ch, ns))), [])

  // Frame como no Figma: o que está inteiro dentro dele anda junto quando ele é arrastado
  const dentroDoFrame = useRef<{ frame: string; inicio: { x: number; y: number }; filhos: Map<string, { x: number; y: number }> } | null>(null)
  const aoComecarArraste = useCallback((_: unknown, no: Node) => {
    dentroDoFrame.current = null
    if (no.type !== 'frame') return
    const w = (n: Node) => (n.width as number) || n.measured?.width || 0
    const h = (n: Node) => (n.height as number) || n.measured?.height || 0
    const [x0, y0, x1, y1] = [no.position.x, no.position.y, no.position.x + w(no), no.position.y + h(no)]
    const filhos = new Map<string, { x: number; y: number }>()
    for (const n of nosRef.current) {
      if (n.id === no.id || n.selected) continue // os selecionados já andam juntos
      if (n.position.x >= x0 && n.position.y >= y0 && n.position.x + w(n) <= x1 && n.position.y + h(n) <= y1) filhos.set(n.id, { ...n.position })
    }
    if (filhos.size) dentroDoFrame.current = { frame: no.id, inicio: { ...no.position }, filhos }
  }, [])
  const aoArrastar = useCallback((_: unknown, no: Node) => {
    const d = dentroDoFrame.current
    if (!d || d.frame !== no.id) return
    const dx = no.position.x - d.inicio.x
    const dy = no.position.y - d.inicio.y
    setNos((ns) => ns.map((n) => { const p = d.filhos.get(n.id); return p ? { ...n, position: { x: p.x + dx, y: p.y + dy } } : n }))
  }, [])
  const aoSoltar = useCallback((_: unknown, __: Node, soltos: Node[]) => {
    const d = dentroDoFrame.current
    dentroDoFrame.current = null
    const filhos = d ? nosRef.current.filter((n) => d.filhos.has(n.id) && !n.id.startsWith('sub:')) : []
    salvar(Object.fromEntries([...soltos, ...filhos].map((n) => [n.id, { x: n.position.x, y: n.position.y, w: n.width as number, h: n.height as number }])))
  }, [])
  const ligarNos = (de: string, para: string) =>
    void enviar<Ligacao>('POST', '/api/ligacoes', { de, para }).then((l) => registrar(passoLigacaoCriada(l))).catch(() => {})
  const aoLigar = useCallback((c: Connection) => { if (c.source && c.target) ligarNos(c.source, c.target) }, [])
  // soltou o elástico em cima do corpo de um nó (não num ponto): liga do mesmo jeito
  const aoSoltarLigacao = useCallback((e: MouseEvent | TouchEvent, estado: FinalConnectionState) => {
    if (estado.isValid || !estado.fromNode) return
    const p = 'changedTouches' in e ? e.changedTouches[0] : e
    const alvo = (document.elementFromPoint(p.clientX, p.clientY) as HTMLElement | null)?.closest<HTMLElement>('.react-flow__node')
    const para = alvo?.dataset.id
    if (para && para !== estado.fromNode.id && !para.startsWith('sub:') && !para.startsWith('f:')) ligarNos(estado.fromNode.id, para)
  }, [])
  const aoApagarArestas = useCallback((es: Edge[]) => { for (const e of es) cortar(e.data as DadosAresta, e.source, e.target) }, [])

  const migrarRef = useRef<(sessao: string) => Promise<void>>(async () => {})
  const acoes = useMemo<AcoesCanvas>(() => ({
    ampliar: setAmpliado, abrirSessao: aoAbrir, editando, setEditando,
    inicioRedimensionar: () => { fotoRedimensionar.current = foto() },
    redimensionar: (no, p) => {
      salvar({ [no]: p })
      registrar(passoMovimento(fotoRedimensionar.current, { ...fotoRedimensionar.current, [no]: p }))
    },
    migrar: (sessao) => migrarRef.current(sessao),
    escolherVideo: async (f) => {
      const r = await enviar<{ resultados: { resultado: string }[] }>('POST', `/api/formas/${f.id}/escolher`)
      // versões são temporárias: saem do canvas todas as do mesmo grupo, ligadas ao mesmo agente
      const { formas: todas = [], ligacoes } = canvasRef.current
      const vizinhos = (fid: string) => new Set(ligacoes.flatMap((l) => (l.de === `f:${fid}` ? [l.para] : l.para === `f:${fid}` ? [l.de] : [])).filter((x) => x.startsWith('t:')))
      const agentes = vizinhos(f.id)
      const grupo = grupoDoVideo(f.texto)
      const saem = todas.filter((x) => x.tipo === 'video' && (x.id === f.id || (grupo && grupoDoVideo(x.texto) === grupo && [...vizinhos(x.id)].some((t) => agentes.has(t)))))
      for (const x of saem) await enviar('DELETE', `/api/formas/${x.id}`).catch(() => {})
      return { ...r, saiu: saem.length }
    },
  }), [aoAbrir, editando])

  // ---------- criar coisas (barra e menu) ----------

  const nascerEm = (id: string, p?: { x: number; y: number }) => {
    if (!p) return
    pendentes.current.set(id, p)
    setNos((ns) => ns.map((n) => (n.id === id ? { ...n, position: p } : n)))
    salvar({ [id]: p })
  }
  // sessão de fora vira terminal do canvas no mesmo lugar do nó dela (o servidor fecha a de fora e retoma a conversa)
  migrarRef.current = async (sessao: string) => {
    const no = nosRef.current.find((n) => n.id === `s:${sessao}`)
    const t = await enviar<Terminal>('POST', '/api/migrar', { sessao })
    if (no) nascerEm(`t:${t.id}`, { ...no.position })
  }
  const migrarTodas = async () => {
    for (const s of fora.filter((x) => x.agente === 'claude')) await migrarRef.current(s.id).catch(() => {})
  }
  const criarTerminal = async (n: NovoTerminal, p?: { x: number; y: number }) => {
    const t = await enviar<Terminal>('POST', '/api/terminais', n)
    gravarLocal('canvas-pasta', n.cwd)
    nascerEm(`t:${t.id}`, p)
    return t
  }
  // ligarEm: o bloco já nasce ligado a esse nó (o servidor põe à esquerda dele)
  const criarBloco = async (tipo: Bloco['tipo'], p?: { x: number; y: number }, ligarEm?: string) => {
    const b = await enviar<Bloco>('POST', '/api/blocos', { tipo, ligarEm })
    nascerEm(`b:${b.id}`, p)
    setEditando(`b:${b.id}`)
    registrar(passoBlocoCriado(b))
  }
  // widget opcional: nasce no ponto do clique; ajustes pela engrenagem dele
  const criarWidget = async (tipo: TipoWidget, p?: { x: number; y: number }) => {
    const w = await enviar<Widget>('POST', '/api/widgets', { tipo })
    nascerEm(`w:${w.id}`, p)
  }
  // forma nova: nasce na hora no quadro e o servidor guarda
  const criarForma = async (tipo: TipoForma, caixa: { x: number; y: number; w: number; h: number }, dados: Partial<Forma> = {}) => {
    const f = await enviar<Forma>('POST', '/api/formas', { tipo, ...caixa, ...dados })
    registrar(passoFormaCriada(f, caixa))
    pendentes.current.set(`f:${f.id}`, caixa)
    nascidas.current.set(f.id, Date.now())
    setExtras((xs) => [...xs, f])
    setTimeout(podarExtras, 3100)
    setNos((ns) => ns.map((n) => ({ ...n, selected: false })))
    if (tipo === 'texto' && !dados.texto) setEditando(`f:${f.id}`)
    return f
  }
  const ondeColar = () => {
    if (ultimoPonto.current) return ultimoPonto.current
    const el = document.querySelector('.react-flow')?.getBoundingClientRect()
    return screenToFlowPosition({ x: (el?.left ?? 0) + (el?.width ?? 800) / 2, y: (el?.top ?? 0) + (el?.height ?? 600) / 2 })
  }
  const colocarImagem = async (arq: Blob, p = ondeColar()) => {
    const [url, m] = await Promise.all([subirImagem(arq), medidaDaImagem(arq)])
    const escala = Math.min(1, 640 / m.w, 480 / m.h) // tamanho real, até 640 x 480 no quadro
    await criarForma('imagem', { x: p.x, y: p.y, w: Math.round(m.w * escala), h: Math.round(m.h * escala) }, { url })
  }
  const colocarTexto = (texto: string, p = ondeColar()) => {
    const linhas = texto.split('\n')
    const largura = Math.min(640, Math.max(120, Math.max(...linhas.map((l) => l.length)) * 10))
    void criarForma('texto', { x: p.x, y: p.y, w: largura, h: Math.min(800, linhas.length * 24 + 8) }, { texto, cor: 'var(--foreground)' }).catch(() => {})
  }
  const formasSelecionadas = () => nos.filter((n) => n.selected && n.id.startsWith('f:')).map((n) => (n.data as DadosForma).f)
  const escolherCor = (c: string) => {
    setCor(c)
    gravarLocal('canvas-cor', c)
    for (const f of formasSelecionadas()) {
      if (f.tipo !== 'imagem') void enviar('PATCH', `/api/formas/${f.id}`, { cor: c }).catch(() => {})
    }
  }
  // atalhos do Figma (V, F, R, T, P, Esc) e o Ctrl+V de imagem ou texto direto no quadro
  const seletorDeImagem = useRef<HTMLInputElement>(null)
  const ultimas = useRef({ colocarImagem, colocarTexto })
  ultimas.current = { colocarImagem, colocarTexto }
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || digitando()) return
      if (e.key === 'Escape') { setFerramenta('mover'); return }
      const f = FERRAMENTAS.find((x) => x.tecla === e.key.toUpperCase())
      if (f) { e.preventDefault(); setFerramenta(f.id) }
      else if (e.key.toUpperCase() === 'I') { e.preventDefault(); seletorDeImagem.current?.click() }
    }
    const colar = (e: ClipboardEvent) => {
      if (digitando() || !e.clipboardData) return
      const img = [...e.clipboardData.items].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile()
      if (img) { e.preventDefault(); void ultimas.current.colocarImagem(img).catch(() => {}); return }
      const texto = e.clipboardData.getData('text/plain')
      if (texto.trim()) { e.preventDefault(); ultimas.current.colocarTexto(texto) }
    }
    window.addEventListener('keydown', tecla)
    window.addEventListener('paste', colar)
    return () => { window.removeEventListener('keydown', tecla); window.removeEventListener('paste', colar) }
  }, [])
  const soltarArquivos = (e: EventoArraste) => {
    const arqs = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/') || f.type === 'video/mp4' || f.type === 'video/webm')
    if (!arqs.length) return
    e.preventDefault()
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    arqs.forEach((arq, i) => {
      const q = { x: p.x + i * 40, y: p.y + i * 40 }
      if (arq.type.startsWith('image/')) void colocarImagem(arq, q).catch(() => {})
      else void subirImagem(arq).then((url) => criarForma('video', { ...q, ...TAM.video }, { url, texto: arq.name.replace(/\.\w+$/, '') })).catch(() => {})
    })
  }
  const terminalSelecionado = () => nos.find((n) => n.selected && (n.type === 'terminal' || n.type === 'sessao'))?.id
  const alternarFora = () => setMostrarFora((v) => { gravarLocal('canvas-fora', v ? '0' : '1'); return !v })
  const tecla = (id: string, texto: string) => void enviar('POST', `/api/terminais/${id}/entrada`, { texto, cru: true }).catch(() => {})

  // ---------- botão direito ----------

  const tituloNovo = () => (pastaPadrao ? `Novo aqui · ${pastaPadrao.split(/[\\/]/).pop()}` : 'Novo aqui')
  const menuDoFundo = (e: EventoMouse | globalThis.MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, titulo: tituloNovo(), itens: itensDoFundo(screenToFlowPosition({ x: e.clientX, y: e.clientY })) })
  }
  // opções padrão do canvas (criar no ponto p): no fundo e também dentro de frames e retângulos
  const itensDoFundo = (p: { x: number; y: number }): ItemMenu[] => {
    const cwd = pastaPadrao
    const item = (rotulo: string, Icone: Icone, cor: string, acao: () => void): ItemMenu => ({ rotulo, Icone, cor, acao })
    return [
        item('Claude', LogoClaude, COR.claude, () => void criarTerminal({ tipo: 'claude', cwd }, p).catch(() => {})),
        item('Codex', LogoCodex, COR.codex, () => void criarTerminal({ tipo: 'codex', cwd }, p).catch(() => {})),
        item('PowerShell', IconeTerminal, COR.shell, () => void criarTerminal({ tipo: 'shell', cwd }, p).catch(() => {})),
        item('Janela do Git', GitBranch, COR.git, () => void criarTerminal({ tipo: 'git', cwd, titulo: 'Git' }, p).catch(() => {})),
        'separador',
        item('Nota', StickyNote, COR.nota, () => void criarBloco('nota', p).catch(() => {})),
        item('Checklist', ListChecks, COR.checklist, () => void criarBloco('checklist', p).catch(() => {})),
        item('Líder para uma demanda…', Crown, COR.lider, () => setLiderAberto(true)),
        'separador',
        item('Frame', IconeFrame, cor, () => void criarForma('frame', { ...p, ...TAM.frame }, { cor }).catch(() => {})),
        item('Retângulo', Square, cor, () => void criarForma('retangulo', { ...p, ...TAM.retangulo }, { cor }).catch(() => {})),
        item('Texto', Type, cor, () => void criarForma('texto', { ...p, ...TAM.texto }, { cor: cor === CORES[0] ? 'var(--foreground)' : cor }).catch(() => {})),
        item('Imagem do computador…', ImagePlus, cor, () => { ultimoPonto.current = p; seletorDeImagem.current?.click() }),
        'separador',
        { rotulo: 'Widgets', Icone: LayoutGrid, sub: (Object.keys(NOME_WIDGET) as TipoWidget[]).map((tipo) => item(NOME_WIDGET[tipo], ICONE_WIDGET[tipo], COR_WIDGET[tipo], () => void criarWidget(tipo, p).catch(() => {}))) },
        'separador',
        { rotulo: mostrarFora ? 'Esconder sessões de fora' : 'Mostrar sessões de fora', Icone: mostrarFora ? EyeOff : Eye, acao: alternarFora },
        ...(fora.some((s) => s.agente === 'claude') ? [{ rotulo: `Migrar todas as sessões de fora (${fora.filter((s) => s.agente === 'claude').length})`, Icone: IconeTerminal, cor: COR.claude, acao: () => void migrarTodas() } as ItemMenu] : []),
        { rotulo: 'Organizar em frames por agente', Icone: LayoutDashboard, acao: () => void organizar() },
        { rotulo: 'Ajustar à tela', Icone: Maximize, acao: () => void fitView({ maxZoom: 0.9, padding: 0.12, duration: 300 }) },
    ]
  }

  const menuDoNo = (e: EventoMouse, n: Node) => {
    e.preventDefault()
    const perto = { x: n.position.x + ((n.width as number) || 300) + 80, y: n.position.y }
    const ir = () => void setCenter(n.position.x + ((n.width as number) || 300) / 2, n.position.y + ((n.height as number) || 200) / 2, { zoom: 1, duration: 300 })
    let itens: ItemMenu[] = []
    let titulo = ''
    if (n.type === 'terminal') {
      const t = (n.data as DadosTerminal).t
      titulo = nomeDoTerminal(t, (n.data as DadosTerminal).sessao)
      const agente = t.tipo === 'claude' || t.tipo === 'codex'
      itens = [
        { rotulo: 'Ampliar', Icone: Maximize2, acao: () => setAmpliado(t.id) },
        { rotulo: 'Centralizar aqui', Icone: Maximize, acao: ir },
        { rotulo: 'Renomear', Icone: Pencil, acao: () => setEditando(n.id) },
        ...(t.vivo
          ? [{ rotulo: agente ? 'Interromper (Esc)' : 'Interromper (Ctrl+C)', Icone: CircleStop, acao: () => tecla(t.id, agente ? '\x1b' : '\x03') } as ItemMenu]
          : [{ rotulo: t.tipo === 'claude' && t.sessao ? 'Retomar a conversa' : 'Abrir de novo', Icone: RotateCcw, acao: () => void enviar('POST', `/api/terminais/${t.id}/reabrir`).catch(() => {}) } as ItemMenu]),
        'separador',
        { rotulo: 'Nota ligada', Icone: StickyNote, cor: COR.nota, acao: () => void criarBloco('nota', undefined, n.id).catch(() => {}) },
        { rotulo: 'Checklist ligada', Icone: ListChecks, cor: COR.checklist, acao: () => void criarBloco('checklist', undefined, n.id).catch(() => {}) },
        { rotulo: 'Trabalhador Claude ligado', Icone: LogoClaude, cor: COR.trabalhador, acao: () => void criarTerminal({ tipo: 'claude', cwd: t.cwd, pai: t.id }, { x: perto.x, y: n.position.y + ((n.height as number) || 500) + 90 }).catch(() => {}) },
        { rotulo: 'Janela do Git desta pasta', Icone: GitBranch, cor: COR.git, acao: () => void criarTerminal({ tipo: 'git', cwd: t.cwd, titulo: 'Git' }, perto).catch(() => {}) },
        'separador',
        { rotulo: 'Fechar terminal', Icone: Trash2, perigo: true, acao: () => void enviar('DELETE', `/api/terminais/${t.id}`).catch(() => {}) },
      ]
    } else if (n.type === 'sessao') {
      const s = (n.data as DadosSessao).s
      const possiveisDonos = canvas.terminais.filter((x) => x.tipo === 'claude' || x.tipo === 'codex')
      titulo = s.nome || s.titulo || s.id.slice(0, 8)
      itens = [
        { rotulo: 'Ver detalhes', Icone: Maximize2, acao: () => aoAbrir(s.id) },
        ...(s.agente === 'claude' ? [{ rotulo: 'Migrar para o canvas (fecha a de fora)', Icone: IconeTerminal, cor: COR.claude, acao: () => void migrarRef.current(s.id).catch(() => {}) } as ItemMenu] : []),
        { rotulo: 'Trabalhador Claude ligado', Icone: LogoClaude, cor: COR.trabalhador, acao: () => void criarTerminal({ tipo: 'claude', cwd: s.pasta || pastaPadrao, paiSessao: s.id }, perto).catch(() => {}) },
        { rotulo: 'Janela do Git desta pasta', Icone: GitBranch, cor: COR.git, acao: () => void criarTerminal({ tipo: 'git', cwd: s.pasta || pastaPadrao, titulo: 'Git' }, perto).catch(() => {}) },
        { rotulo: 'Nota ligada', Icone: StickyNote, cor: COR.nota, acao: () => void criarBloco('nota', undefined, n.id).catch(() => {}) },
        { rotulo: 'Checklist ligada', Icone: ListChecks, cor: COR.checklist, acao: () => void criarBloco('checklist', undefined, n.id).catch(() => {}) },
        ...(possiveisDonos.length ? [{ rotulo: 'Prender ao agente que a abriu', Icone: Link2, sub: possiveisDonos.map((t) => ({
          rotulo: nomeDoTerminal(t, t.sessao ? porSessao.get(t.sessao) || null : null), Icone: t.tipo === 'codex' ? LogoCodex : LogoClaude,
          acao: () => void enviar('PUT', `/api/donos/${s.id}`, { terminal: t.id }).catch(() => {}),
        })) } as ItemMenu] : []),
        'separador',
        { rotulo: 'Esconder sessões de fora', Icone: EyeOff, acao: alternarFora },
      ]
    } else if (n.type === 'nota' || n.type === 'checklist') {
      const b = (n.data as DadosBloco).b
      const tipo = n.type
      const corBloco = (c: string) => void enviar('PATCH', `/api/blocos/${b.id}`, { cor: c }).catch(() => {})
      titulo = b.titulo
      itens = [
        { rotulo: n.type === 'nota' ? 'Enviar aos terminais ligados' : 'Executar nos terminais ligados', Icone: Send, acao: () => void enviar('POST', `/api/blocos/${b.id}/enviar`).catch(() => {}) },
        { rotulo: 'Renomear', Icone: Pencil, acao: () => setEditando(n.id) },
        { rotulo: 'Cor', Icone: Square, cor: b.cor || COR[tipo], sub: [
          { rotulo: `Padrão${b.cor ? '' : ' ✓'}`, Icone: tipo === 'nota' ? StickyNote : ListChecks, cor: COR[tipo], acao: () => corBloco('') },
          ...CORES.map((c, i) => ({ rotulo: `${NOMES_COR[i]}${b.cor === c ? ' ✓' : ''}`, Icone: Square, cor: c, acao: () => corBloco(c) })),
        ] },
        'separador',
        { rotulo: n.type === 'nota' ? 'Apagar nota' : 'Apagar checklist', Icone: Trash2, perigo: true, acao: () => {
          const passo = passoBlocoApagado(n.id) // copia o conteúdo antes de apagar, para o Ctrl+Z trazer de volta
          void enviar('DELETE', `/api/blocos/${b.id}`).then(() => registrar(passo)).catch(() => {})
        } },
      ]
    } else if (n.id.startsWith('f:')) {
      const f = (n.data as DadosForma).f
      const NOME: Record<TipoForma, string> = { frame: 'Frame', retangulo: 'Retângulo', texto: 'Texto', imagem: 'Imagem', desenho: 'Desenho', video: 'Vídeo', pagina: 'Página' }
      titulo = f.tipo === 'frame' || f.tipo === 'video' || f.tipo === 'pagina' ? f.texto || NOME[f.tipo] : NOME[f.tipo]
      const mudar = (dados: Partial<Forma>) => void enviar('PATCH', `/api/formas/${f.id}`, dados).catch(() => {})
      itens = [
        ...(f.tipo === 'frame' ? [
          { rotulo: 'Renomear', Icone: Pencil, acao: () => setEditando(n.id) } as ItemMenu,
          { rotulo: 'Cor', Icone: Square, cor: f.cor || CORES[0], sub: CORES.map((c, i) => ({ rotulo: `${NOMES_COR[i]}${f.cor === c ? ' ✓' : ''}`, Icone: Square, cor: c, acao: () => mudar({ cor: c }) })) } as ItemMenu,
          { rotulo: 'Tom do fundo', Icone: Square, sub: [0, 5, 12, 20, 35, 50, 75].map((o) => ({ rotulo: `${o === 0 ? 'Sem fundo' : `${o}%`}${(f.opacidade ?? 12) === o ? ' ✓' : ''}`, acao: () => mudar({ opacidade: o }) })) } as ItemMenu,
        ] : []),
        ...(f.tipo === 'texto' ? [
          { rotulo: 'Editar texto', Icone: Pencil, acao: () => setEditando(n.id) } as ItemMenu,
          ...TAMANHOS_TEXTO.map(([r, t]) => ({ rotulo: `${r}${(f.tamanho || 18) === t ? ' ✓' : ''}`, Icone: Type, acao: () => mudar({ tamanho: t }) }) as ItemMenu),
        ] : []),
        ...(f.tipo === 'desenho' ? [1, 3, 6, 12].map((e) => ({ rotulo: `Traço ${e}${(f.espessura || 3) === e ? ' ✓' : ''}`, Icone: Pencil, acao: () => mudar({ espessura: e }) }) as ItemMenu) : []),
        ...(f.tipo !== 'imagem' && f.tipo !== 'video' && f.tipo !== 'pagina' && f.tipo !== 'frame' ? [{ rotulo: 'Usar a cor escolhida na barra', Icone: Square, cor, acao: () => mudar({ cor }) } as ItemMenu] : []),
        { rotulo: 'Apagar', Icone: Trash2, perigo: true, acao: () => void enviar('DELETE', `/api/formas/${f.id}`).then(() => registrar(passoFormaApagada(f, { x: n.position.x, y: n.position.y, w: n.width as number, h: n.height as number }))).catch(() => {}) },
        'separador',
        ...itensDoFundo(screenToFlowPosition({ x: e.clientX, y: e.clientY })),
      ]
    } else if (n.type === 'widget') {
      const w = (n.data as DadosNoWidget).w
      titulo = w.titulo
      const crono = (acao: string) => void enviar('POST', `/api/widgets/${w.id}/cronometro`, { acao }).catch(() => {})
      itens = [
        { rotulo: 'Renomear', Icone: Pencil, acao: () => setEditando(n.id) },
        ...(w.tipo === 'cronometro' && !w.config.auto ? [
          w.config.inicio ? { rotulo: 'Pausar', Icone: CircleStop, acao: () => crono('pausar') } as ItemMenu : { rotulo: 'Iniciar', Icone: Play, acao: () => crono('iniciar') } as ItemMenu,
        ] : []),
        ...(w.tipo === 'cronometro' ? [{ rotulo: 'Zerar', Icone: RotateCcw, acao: () => crono('zerar') } as ItemMenu] : []),
        'separador',
        { rotulo: 'Apagar widget', Icone: Trash2, perigo: true, acao: () => void enviar('DELETE', `/api/widgets/${w.id}`).catch(() => {}) },
      ]
    } else if (n.type === 'subagente') {
      const d = n.data as DadosSub
      titulo = d.sub.titulo || d.sub.nome || 'subagente'
      itens = d.sessao
        ? [
            { rotulo: 'Ver detalhes da sessão', Icone: Maximize2, acao: () => aoAbrir(d.sub.id) },
            { rotulo: 'Soltar do agente (volta para as sessões de fora)', Icone: Unlink, acao: () => void enviar('PUT', `/api/donos/${d.sub.id}`, { terminal: null }).catch(() => {}) },
          ]
        : [{ rotulo: 'Ver detalhes do subagente', Icone: Maximize2, acao: () => aoAbrir(d.sub.id) }]
    }
    setMenu({ x: e.clientX, y: e.clientY, titulo, itens })
  }

  const menuDaAresta = (e: EventoMouse, ed: Edge) => {
    e.preventDefault()
    const d = ed.data as DadosAresta | undefined
    if (!d?.ligacao && !d?.soltar) return
    setMenu({ x: e.clientX, y: e.clientY, itens: [{ rotulo: d.soltar ? 'Soltar este terminal' : 'Cortar ligação', Icone: Unlink, perigo: true, acao: () => cortar(d, ed.source, ed.target) }] })
  }

  // ---------- Ir até um agente (dock): a visão vai até o frame em que ele está; fora de frame, até o terminal ----------
  const irAte = (id: string) => {
    const lista = nosRef.current
    const n = lista.find((x) => x.id === id)
    if (!n) return
    const larg = (x: Node) => (x.width as number) || x.measured?.width || 0
    const alt = (x: Node) => (x.height as number) || x.measured?.height || 0
    const cx = n.position.x + larg(n) / 2
    const cy = n.position.y + alt(n) / 2
    const frame = lista
      .filter((f) => f.type === 'frame' && cx >= f.position.x && cx <= f.position.x + larg(f) && cy >= f.position.y && cy <= f.position.y + alt(f))
      .sort((a, b) => larg(a) * alt(a) - larg(b) * alt(b))[0]
    void fitView({ nodes: [{ id: frame?.id ?? id }], padding: 0.06, maxZoom: 1, duration: 400 })
  }

  // Tab vai ao próximo agente (Shift+Tab, ao anterior); segurando Tab, as setas andam só entre os que estão trabalhando.
  // Com um terminal selecionado ou com foco, ou num campo, o Tab continua sendo dele.
  const ultimoAgente = useRef<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const irAteRef = useRef(irAte)
  irAteRef.current = irAte
  useEffect(() => {
    let segurando = false
    let usouSeta = false
    let timer = 0
    const avisar = (texto: string) => { setAviso(texto); clearTimeout(timer); timer = window.setTimeout(() => setAviso(null), 1800) }
    const andar = (passo: number, soTrabalhando: boolean) => {
      const lista = agentesDoCanvas(nosRef.current).filter((n) => !soTrabalhando || (n.data as DadosTerminal).t.status === 'trabalhando')
      if (!lista.length) { avisar(soTrabalhando ? 'Nenhum agente trabalhando agora' : 'Nenhum agente no canvas'); return }
      const i = lista.findIndex((n) => n.id === ultimoAgente.current)
      const j = ((i < 0 ? (passo > 0 ? -1 : 0) : i) + passo + lista.length) % lista.length
      const { t, sessao } = lista[j].data as DadosTerminal
      ultimoAgente.current = lista[j].id
      irAteRef.current(lista[j].id)
      avisar(`${nomeDoTerminal(t, sessao)} · ${j + 1}/${lista.length}${soTrabalhando ? ' trabalhando' : ''}`)
    }
    const SETAS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']
    const desce = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        // terminal com foco ou selecionado: o Tab é dele (completar, trocar de modo no Claude)
        if (e.ctrlKey || e.metaKey || e.altKey || digitando() || nosRef.current.some((n) => n.selected && n.type === 'terminal')) return
        e.preventDefault()
        if (!e.repeat) { segurando = true; usouSeta = false }
        return
      }
      if (segurando && SETAS.includes(e.key)) {
        // na captura, antes do React Flow, que moveria o nó selecionado com as setas
        e.preventDefault()
        e.stopPropagation()
        usouSeta = true
        andar(e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1, true)
      }
    }
    const sobe = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !segurando) return
      segurando = false
      if (!usouSeta) andar(e.shiftKey ? -1 : 1, false)
    }
    const solta = () => { segurando = false }
    window.addEventListener('keydown', desce, true)
    window.addEventListener('keyup', sobe, true)
    window.addEventListener('blur', solta)
    return () => {
      window.removeEventListener('keydown', desce, true)
      window.removeEventListener('keyup', sobe, true)
      window.removeEventListener('blur', solta)
      clearTimeout(timer)
    }
  }, [])

  // ---------- Organizar: um frame por frente (cada agente e o que é dele), em fileiras do formato da tela ----------
  // dentro do frame: o terminal no meio com subagentes, trabalhadores, vídeos e páginas embaixo; notas, checklists,
  // Git e widgets em volta dele. O resto vai numa fila embaixo, e as sessões de fora numa fila no fim.
  const organizar = async () => {
    const lista = nosRef.current
    const porId = new Map(lista.map((n) => [n.id, n]))
    const tam = (id: string) => { const n = porId.get(id)!; return { w: (n.width as number) || n.measured?.width || 300, h: (n.height as number) || n.measured?.height || 200 } }
    const ligadosA = (no: string) => canvas.ligacoes.flatMap((l) => (l.de === no ? [l.para] : l.para === no ? [l.de] : []))
    const conteudo = lista.filter((n) => !n.id.startsWith('f:'))
    if (!conteudo.length) return
    const antes = foto()
    const novas: Record<string, Posicao> = {}
    const usados = new Set<string>()
    const por = (id: string, x: number, y: number, t = tam(id)) => { novas[id] = { x: Math.round(x), y: Math.round(y), w: t.w, h: t.h }; usados.add(id) }
    const PAD = 40, VAO = 40, ENTRE = 220
    const CORES_FRENTE = ['#fb923c', '#38bdf8', '#e879f9', '#4ade80', '#facc15', '#818cf8', '#2dd4bf', '#f87171']
    const x0 = Math.min(...conteudo.map((n) => n.position.x))
    const y0 = Math.min(...conteudo.map((n) => n.position.y))
    // formato da tela: frame e conjunto tentam caber nela, sem faixa comprida nem torre
    const A = Math.min(2.4, Math.max(1.2, window.innerWidth / Math.max(1, window.innerHeight)))
    const G = VAO * 2
    type Coluna = { ids: string[]; w: number; h: number }
    type Lado = 'L' | 'R' | 'T' | 'B'
    const largDe = (cols: Coluna[]) => (cols.length ? cols.reduce((s, c) => s + c.w, 0) + VAO * (cols.length - 1) : 0)
    const altDe = (cols: Coluna[]) => Math.max(0, ...cols.map((c) => c.h))
    // o agente (cw x ch, canto em 0,0) no meio e os itens em volta: cada um vai para o lado que deixa o frame mais
    // perto do formato da tela; a conta é simétrica (o lado maior vale pelos dois), então os lados se equilibram
    const emVolta = (cw: number, ch: number, ids: string[]) => {
      const lados: Record<Lado, Coluna[]> = { L: [], R: [], T: [], B: [] }
      const ocupado: Record<Lado, number> = { L: 0, R: 0, T: 0, B: 0 }
      const meio = () => Math.max(cw, largDe(lados.T), largDe(lados.B))
      const custo = () => {
        const wl = largDe(lados.L), wr = largDe(lados.R), ht = altDe(lados.T), hb = altDe(lados.B)
        const w = meio() + 2 * Math.max(wl && wl + G, wr && wr + G)
        const h = Math.max(ch + 2 * Math.max(ht && ht + G, hb && hb + G), altDe(lados.L), altDe(lados.R))
        return [Math.max(w, h * A), w * h]
      }
      for (const id of ids) {
        const t = tam(id)
        const tentativas: { lado: Lado; fazer: () => () => void }[] = []
        // empate fica com o lado mais vazio
        for (const k of (['L', 'R', 'B', 'T'] as Lado[]).sort((a, b) => ocupado[a] - ocupado[b])) {
          const cols = lados[k]
          if (cols.length) tentativas.push({ lado: k, fazer: () => {
            const c = cols.reduce((a, b) => (b.h < a.h ? b : a))
            const { w, h } = c
            c.ids.push(id); c.w = Math.max(w, t.w); c.h = h + VAO + t.h
            return () => { c.ids.pop(); c.w = w; c.h = h }
          } })
          // coluna nova; em cima e embaixo, só enquanto couber na largura do meio
          if (k === 'L' || k === 'R' || !cols.length || largDe(cols) + VAO + t.w <= meio()) tentativas.push({ lado: k, fazer: () => {
            cols.push({ ids: [id], w: t.w, h: t.h })
            return () => { cols.pop() }
          } })
        }
        let escolha = tentativas[0]
        let menor = [Infinity, Infinity]
        for (const o of tentativas) {
          const desfazer = o.fazer()
          const c = custo()
          desfazer()
          if (c[0] < menor[0] || (c[0] === menor[0] && c[1] < menor[1])) { menor = c; escolha = o }
        }
        escolha.fazer()
        ocupado[escolha.lado] += t.w * t.h
      }
      // posições: a primeira coluna de cada lado encosta no agente; as laterais ficam centradas na altura dele
      const itens: [string, number, number][] = []
      const m = meio()
      let x = (cw - m) / 2 - G
      for (const c of lados.L) {
        let y = ch / 2 - c.h / 2
        for (const id of c.ids) { itens.push([id, x - tam(id).w, y]); y += tam(id).h + VAO }
        x -= c.w + VAO
      }
      x = (cw + m) / 2 + G
      for (const c of lados.R) {
        let y = ch / 2 - c.h / 2
        for (const id of c.ids) { itens.push([id, x, y]); y += tam(id).h + VAO }
        x += c.w + VAO
      }
      for (const [cols, acima] of [[lados.T, true], [lados.B, false]] as const) {
        let x = cw / 2 - largDe(cols) / 2
        for (const c of cols) {
          let y = acima ? -G - c.h : ch + G
          for (const id of c.ids) { itens.push([id, x, y]); y += tam(id).h + VAO }
          x += c.w + VAO
        }
      }
      return itens
    }
    const feita = (id: string) => { const b = (porId.get(id)!.data as DadosBloco).b; return b.itens.length > 0 && b.itens.every((i) => i.estado === 'feito') }
    const raizes = canvas.terminais
      .filter((t) => !t.pai && !t.paiSessao && (t.tipo === 'claude' || t.tipo === 'codex') && porId.has(`t:${t.id}`))
      .sort((a, b) => porId.get(`t:${a.id}`)!.position.x - porId.get(`t:${b.id}`)!.position.x)
    const frames = lista.filter((n) => n.type === 'frame')
    const novosFrames: { caixa: { x: number; y: number; w: number; h: number }; texto: string; cor: string }[] = []
    const frentes: { itens: [string, number, number][]; w: number; h: number; fr?: string; texto: string; cor: string }[] = []

    raizes.forEach((r, i) => {
      const rid = `t:${r.id}`
      const desc: Terminal[] = []
      const fila = [r.id]
      while (fila.length) { const p = fila.shift()!; for (const t of canvas.terminais) if (t.pai === p && porId.has(`t:${t.id}`)) { desc.push(t); fila.push(t.id) } }
      const membros = [rid, ...desc.map((t) => `t:${t.id}`)]
      const ligados = [...new Set(membros.flatMap(ligadosA))].filter((x) => porId.has(x) && !usados.has(x) && !membros.includes(x))
      // em volta do agente, dos mais perto aos mais longe: notas, checklists pendentes, Git, widgets e checklists feitas
      const listas = ligados.filter((x) => porId.get(x)!.type === 'checklist')
      const volta = [
        ...ligados.filter((x) => porId.get(x)!.type === 'nota'), ...listas.filter((x) => !feita(x)),
        ...desc.filter((t) => t.tipo === 'git').map((t) => `t:${t.id}`), ...ligados.filter((x) => x.startsWith('w:')), ...listas.filter(feita),
      ]
      const trabs = desc.filter((t) => t.tipo !== 'git').map((t) => `t:${t.id}`)
      const midias = ligados.filter((x) => porId.get(x)!.type === 'video' || porId.get(x)!.type === 'imagem')
      const paginas = ligados.filter((x) => porId.get(x)!.type === 'pagina')
      const seusSubs = subs.filter((s) => membros.includes(s.pai) && porId.has(s.id)).map((s) => s.id)

      // o centro (terminal com subagentes, trabalhadores, vídeos e páginas embaixo), com (0, 0) no canto do terminal
      const centro: [string, number, number][] = []
      const rt = tam(rid)
      const rn = porId.get(rid)!
      const centroAntes = { x: rn.position.x + rt.w / 2, y: rn.position.y + rt.h / 2 }
      centro.push([rid, 0, 0])
      let cy = rt.h
      let largura = rt.w
      const linha = (ids: string[], y: number, gap: number) => {
        let x = 0
        let alto = 0
        for (const id of ids) { const t = tam(id); centro.push([id, x, y]); x += t.w + gap; alto = Math.max(alto, t.h) }
        largura = Math.max(largura, x - gap)
        return alto
      }
      if (seusSubs.length) cy += 28 + linha(seusSubs, cy + 28, 14)
      if (trabs.length) cy += 90 + linha(trabs, cy + 90, 50)
      if (midias.length) {
        const mw = Math.max(...midias.map((x) => tam(x).w))
        const mh = Math.max(...midias.map((x) => tam(x).h))
        const porLinha = Math.max(1, Math.floor((largura + 24) / (mw + 24)))
        const y1 = cy + 60
        midias.forEach((id, k) => centro.push([id, (k % porLinha) * (mw + 24), y1 + Math.floor(k / porLinha) * (mh + 24)]))
        cy = y1 + Math.ceil(midias.length / porLinha) * (mh + 24) - 24
        largura = Math.max(largura, Math.min(midias.length, porLinha) * (mw + 24) - 24)
      }
      // páginas embutidas (abrir_pagina) são grandes: uma fileira só delas, embaixo dos vídeos
      if (paginas.length) cy += 60 + linha(paginas, cy + 60, 40)

      // frame justo em volta de tudo, com o agente no meio do que é dele
      const todos = [...centro, ...emVolta(largura, cy, volta)]
      for (const [id] of todos) usados.add(id)
      const minX = Math.min(...todos.map(([, x]) => x)), minY = Math.min(...todos.map(([, , y]) => y))
      const maxX = Math.max(...todos.map(([id, x]) => x + tam(id).w)), maxY = Math.max(...todos.map(([id, , y]) => y + tam(id).h))
      // frame que já envolvia o agente é reaproveitado (mantém nome e cor); se não houver, nasce um
      const fr = frames.find((f) => {
        if (usados.has(f.id)) return false
        const t = tam(f.id)
        return centroAntes.x >= f.position.x && centroAntes.x <= f.position.x + t.w && centroAntes.y >= f.position.y && centroAntes.y <= f.position.y + t.h
      })
      if (fr) usados.add(fr.id)
      frentes.push({
        itens: todos.map(([id, x, y]) => [id, x - minX + PAD, y - minY + PAD]), w: maxX - minX + PAD * 2, h: maxY - minY + PAD * 2,
        fr: fr?.id, texto: nomeDoTerminal(r, r.sessao ? porSessao.get(r.sessao) || null : null), cor: CORES_FRENTE[i % CORES_FRENTE.length],
      })
    })

    // frentes em fileiras, na ordem: quantas por fileira deixam o conjunto mais perto do formato da tela
    let porFila = frentes.length
    let menorTela = Infinity
    for (let n = frentes.length; n >= 1; n--) {
      let w = 0, h = 0
      for (let k = 0; k < frentes.length; k += n) {
        const fila = frentes.slice(k, k + n)
        w = Math.max(w, fila.reduce((s, f) => s + f.w, 0) + ENTRE * (fila.length - 1))
        h += Math.max(...fila.map((f) => f.h)) + (k ? ENTRE : 0)
      }
      if (Math.max(w, h * A) < menorTela) { menorTela = Math.max(w, h * A); porFila = n }
    }
    let fundo = y0
    let direita = x0
    for (let k = 0; k < frentes.length; k += porFila) {
      const fila = frentes.slice(k, k + porFila)
      const fy = k ? fundo + ENTRE : y0
      let fx = x0
      for (const f of fila) {
        for (const [id, x, y] of f.itens) por(id, fx + x, fy + y)
        if (f.fr) por(f.fr, fx, fy, { w: f.w, h: f.h })
        else novosFrames.push({ caixa: { x: fx, y: fy, w: f.w, h: f.h }, texto: f.texto, cor: f.cor })
        fx += f.w + ENTRE
      }
      direita = Math.max(direita, fx - ENTRE)
      fundo = fy + Math.max(...fila.map((f) => f.h))
    }

    // o que não é de nenhuma frente: fila embaixo, quebrando na largura das frentes
    const larguraTotal = Math.max(direita - x0, 2400)
    const soltos = lista.filter((n) => !usados.has(n.id) && !n.id.startsWith('f:') && !n.id.startsWith('s:') && !n.id.startsWith('sub:')
      && !(n.type === 'terminal' && (n.data as DadosTerminal).t.paiSessao))
    if (soltos.length) {
      let sx = x0
      let sy = fundo + ENTRE
      let alto = 0
      for (const n of soltos) {
        const t = tam(n.id)
        if (sx > x0 && sx + t.w > x0 + larguraTotal) { sx = x0; sy += alto + VAO * 2; alto = 0 }
        por(n.id, sx, sy, t)
        sx += t.w + VAO * 2
        alto = Math.max(alto, t.h)
      }
      fundo = sy + alto
    }

    // sessões de fora: fila no fim, cada uma com seus subagentes e trabalhadores embaixo
    let qx = x0
    const qy = fundo + ENTRE
    for (const s of lista.filter((n) => n.id.startsWith('s:'))) {
      const t = tam(s.id)
      por(s.id, qx, qy, t)
      let largura = t.w
      let y = qy + t.h + 28
      const fileira = (ids: string[], gap: number) => {
        let x = qx
        let alto = 0
        for (const id of ids) { const u = tam(id); por(id, x, y, u); x += u.w + gap; alto = Math.max(alto, u.h) }
        largura = Math.max(largura, x - gap - qx)
        return alto
      }
      const seus = subs.filter((x) => x.pai === s.id && porId.has(x.id)).map((x) => x.id)
      if (seus.length) y += fileira(seus, 14) + 90
      fileira(canvas.terminais.filter((tt) => tt.paiSessao === s.id.slice(2) && porId.has(`t:${tt.id}`)).map((tt) => `t:${tt.id}`), 50)
      qx += largura + VAO * 3
    }

    if (!Object.keys(novas).length && !novosFrames.length) return
    // a sessão de fora cresce com o conteúdo: não fixa a altura dela
    setNos((ns) => ns.map((n) => {
      const p = novas[n.id]
      if (!p) return n
      return n.type === 'sessao' ? { ...n, position: { x: p.x, y: p.y } } : { ...n, position: { x: p.x, y: p.y }, width: p.w, height: p.h }
    }))
    const guardadas = Object.fromEntries(Object.entries(novas).filter(([k]) => !k.startsWith('sub:')))
    salvar(guardadas)
    registrar(passoMovimento(antes, { ...antes, ...guardadas }))
    for (const f of novosFrames) await criarForma('frame', f.caixa, { texto: f.texto, cor: f.cor }).catch(() => {})
    setTimeout(() => void fitView({ padding: 0.08, duration: 400 }), 150)
  }

  const antesDeApagar = async ({ nodes: ns, edges }: { nodes: Node[]; edges: Edge[] }) => {
    const nos = ns.filter((n) => n.id.startsWith('f:') || n.type === 'terminal' || n.type === 'nota' || n.type === 'checklist' || n.type === 'widget')
    const ids = new Set(nos.map((n) => n.id))
    // a ligação de quem vai ser apagado some junto no servidor (e o Ctrl+Z da nota ou checklist a recria)
    const cortes = edges.filter((x) => (x.data?.ligacao || x.data?.soltar) && !ids.has(x.source) && !ids.has(x.target))
    if (!nos.length && !cortes.length) return false
    const terms = nos.filter((n) => n.type === 'terminal').map((n) => n.data as DadosTerminal)
    const cronos = nos.map((n) => (n.type === 'widget' ? (n.data as DadosNoWidget).w : null)).filter((w): w is Widget => w?.tipo === 'cronometro' && !!w.config.inicio)
    if (terms.length || cronos.length) {
      const linhas: string[] = []
      if (terms.length) {
        const nomes = terms.map(({ t, sessao }) => `"${nomeDoTerminal(t, sessao)}"${t.status === 'trabalhando' ? ' (trabalhando agora)' : !t.vivo ? ' (já encerrado)' : ''}`).join(', ')
        linhas.push(terms.length === 1
          ? `O terminal ${nomes} vai ser fechado. O que estiver rodando nele para na hora, e o Ctrl+Z não traz de volta.`
          : `Os terminais ${nomes} vão ser fechados. O que estiver rodando neles para na hora, e o Ctrl+Z não traz de volta.`)
      }
      for (const w of cronos) linhas.push(`O cronômetro "${w.titulo}" está contando e vai ser apagado.`)
      const outros = nos.length - terms.length - cronos.length
      if (outros) linhas.push(`Mais ${outros} ${outros === 1 ? 'item selecionado vai' : 'itens selecionados vão'} junto.`)
      const sim = await perguntar({
        titulo: nos.length === 1 ? (terms.length ? 'Fechar este terminal?' : 'Apagar este cronômetro?') : `Apagar ${nos.length} itens?`,
        linhas, botao: terms.length ? 'Fechar e apagar' : 'Apagar',
      })
      if (!sim) return false
    }
    return { nodes: nos, edges: cortes }
  }

  const aoApagarNos = (ns: Node[]) => {
    const passos: Passo[] = []
    for (const n of ns) {
      if (n.id.startsWith('f:')) {
        void enviar('DELETE', `/api/formas/${n.id.slice(2)}`).catch(() => {})
        passos.push(passoFormaApagada((n.data as DadosForma).f, { x: n.position.x, y: n.position.y, w: n.width as number, h: n.height as number }))
      } else if (n.type === 'nota' || n.type === 'checklist') {
        const passo = passoBlocoApagado(n.id) // copia antes de apagar, para o Ctrl+Z trazer de volta com as ligações
        if (passo) passos.push(passo)
        void enviar('DELETE', `/api/blocos/${(n.data as DadosBloco).b.id}`).catch(() => {})
      } else if (n.type === 'widget') void enviar('DELETE', `/api/widgets/${(n.data as DadosNoWidget).w.id}`).catch(() => {})
      else if (n.type === 'terminal') void enviar('DELETE', `/api/terminais/${(n.data as DadosTerminal).t.id}`).catch(() => {})
    }
    registrar(juntar(passos))
  }

  const tAmpliado = canvas.terminais.find((t) => t.id === ampliado)
  const fecharMenu = useCallback(() => setMenu(null), [])

  return (
    <Acoes.Provider value={acoes}>
      <ReactFlow
        ref={quadroRef} nodes={nos} edges={arestas} nodeTypes={TIPOS_DE_NO} onNodesChange={aoMudar}
        onNodeDragStart={(e, n) => { fotoArraste.current = foto(); aoComecarArraste(e, n) }} onNodeDrag={aoArrastar}
        onNodeDragStop={(e, n, ns) => {
          aoSoltar(e, n, ns)
          const antes = fotoArraste.current
          setTimeout(() => registrar(passoMovimento(antes, foto())), 30) // depois de os filhos do frame se acomodarem
        }}
        edgeTypes={tiposDeAresta} onConnect={aoLigar} onEdgesDelete={aoApagarArestas} connectionMode={ConnectionMode.Loose}
        connectionRadius={45} connectionLineComponent={LinhaDeLigacao} onConnectEnd={aoSoltarLigacao}
        // Delete apaga o que estiver selecionado (sessões de fora e subagentes não); terminal e cronômetro contando pedem confirmação
        onBeforeDelete={antesDeApagar}
        onNodesDelete={aoApagarNos}
        onPaneContextMenu={menuDoFundo} onNodeContextMenu={menuDoNo} onEdgeContextMenu={menuDaAresta}
        onPointerMove={(e) => { ultimoPonto.current = screenToFlowPosition({ x: e.clientX, y: e.clientY }) }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }} onDrop={soltarArquivos}
        colorMode={tema === 'dark' ? 'dark' : 'light'} minZoom={0.08} maxZoom={2}
        // como no n8n: arrastar no fundo seleciona; a tela anda com scroll ou botão do meio; Ctrl + scroll dá zoom; Espaço alinha os selecionados
        selectionOnDrag panOnDrag={[1]} panActivationKeyCode={null} panOnScroll selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={['Shift', 'Control', 'Meta']}
        deleteKeyCode={['Delete', 'Backspace']} proOptions={{ hideAttribution: true }} defaultEdgeOptions={{ type: 'default' }} connectionLineStyle={{ strokeWidth: 2 }}
      >
        {ferramenta !== 'mover' && (
          <Desenhar ferramenta={ferramenta} cor={cor}
            aoCriar={(tipo, caixa, dados) => { void criarForma(tipo, caixa, dados).catch(() => {}); if (tipo !== 'desenho') setFerramenta('mover') }} />
        )}
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap pannable zoomable position="bottom-right" className="!bg-card" nodeColor={(n) => {
          if (n.type === 'terminal') return corDoTerminal((n.data as DadosTerminal).t)
          if (n.type === 'sessao') return AGENTES[(n.data as DadosSessao).s.agente].cor
          if (n.type === 'widget') return COR_WIDGET[(n.data as DadosNoWidget).w.tipo]
          if (n.id.startsWith('f:')) return (n.data as DadosForma).f.cor || 'var(--muted-foreground)'
          if (n.type === 'nota' || n.type === 'checklist') return (n.data as DadosBloco).b.cor || COR[n.type]
          return COR[n.type as keyof typeof COR] || COR.sessao
        }} />
        {/* ilha embaixo, como no Figma: ferramentas de desenho, cor e o que abre no canvas */}
        <Panel position="bottom-center" className="!mb-4 flex max-w-[calc(100%-2rem)] flex-wrap items-center justify-center gap-0.5 rounded-2xl border border-border/60 bg-card/95 p-1.5 shadow-xl backdrop-blur dark:border-white/15 dark:bg-[oklch(0.235_0.008_275/0.95)]">
          {FERRAMENTAS.map(({ id, rotulo, tecla, Icone }) => (
            <Button key={id} size="icon" variant="ghost" title={`${rotulo} (${tecla})`} aria-pressed={ferramenta === id} onClick={() => setFerramenta(id)}
              className={cn('size-8 rounded-lg', ferramenta === id && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}>
              <Icone className="size-4" />
            </Button>
          ))}
          <Button size="icon" variant="ghost" className="size-8 rounded-lg" title="Imagem (I) · ou cole com Ctrl+V, ou arraste o arquivo para o quadro" onClick={() => seletorDeImagem.current?.click()}>
            <ImagePlus className="size-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" className="size-8 rounded-lg" title="Cor (vale para o que você desenhar e para as formas selecionadas)">
                <span className="size-4 rounded-full border border-border" style={{ background: cor }} />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" sideOffset={14} className="grid w-auto grid-cols-6 gap-1.5 p-2">
              {CORES.map((c) => (
                <button key={c} title={c} onClick={() => escolherCor(c)}
                  className={cn('size-6 rounded-full border border-border transition-transform hover:scale-110', c === cor && 'ring-2 ring-ring ring-offset-2 ring-offset-popover')} style={{ background: c }} />
              ))}
            </PopoverContent>
          </Popover>
          <span className="mx-1 h-5 w-px bg-border" />
          <FormTerminal pastas={pastas} pastaPadrao={pastaPadrao} aoCriar={async (n) => { await criarTerminal(n) }} />
          <FormLider pastas={pastas} pastaPadrao={pastaPadrao} aberto={liderAberto} setAberto={setLiderAberto} />
          <Button size="icon" variant="ghost" className="size-8 rounded-lg" title="Nota (com um terminal selecionado, já nasce ligada a ele)" onClick={() => void criarBloco('nota', undefined, terminalSelecionado()).catch(() => {})}><StickyNote className="size-4" style={{ color: COR.nota }} /></Button>
          <Button size="icon" variant="ghost" className="size-8 rounded-lg" title="Checklist (com um terminal selecionado, já nasce ligada a ele)" onClick={() => void criarBloco('checklist', undefined, terminalSelecionado()).catch(() => {})}><ListChecks className="size-4" style={{ color: COR.checklist }} /></Button>
          <Button size="icon" variant="ghost" className="size-8 rounded-lg" title="Janela do Git" onClick={() => void criarTerminal({ tipo: 'git', cwd: pastaPadrao, titulo: 'Git' }).catch(() => {})}><GitBranch className="size-4" style={{ color: COR.git }} /></Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 rounded-lg px-2.5" title="Organizar: um frame por agente, com ele no meio e as notas, checklists, Git, widgets, vídeos e páginas dele em volta; o resto numa fila embaixo (Ctrl+Z desfaz)" onClick={() => void organizar()}>
            <LayoutDashboard className="size-4" />Organizar
          </Button>
          <IrAteAgente nos={nos} aoIr={(id) => { ultimoAgente.current = id; irAte(id) }} />
          <Contexto handoff={canvas.handoff} />
          <Button size="icon" variant="ghost" className="size-8 rounded-lg text-muted-foreground" onClick={alternarFora} title={mostrarFora ? 'Esconder as sessões abertas fora do canvas' : 'Mostrar as sessões abertas fora do canvas (só leitura)'}>
            {mostrarFora ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </Button>
          <input ref={seletorDeImagem} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden
            onChange={(e) => { const p = ondeColar(); [...(e.target.files ?? [])].forEach((arq, i) => void colocarImagem(arq, { x: p.x + i * 40, y: p.y + i * 40 }).catch(() => {})); e.target.value = '' }} />
        </Panel>
        {aviso && <Panel position="top-center" className="!mt-3 rounded-lg border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-lg">{aviso}</Panel>}
        <Panel position="top-right">
          <div className="group relative">
            <span className="grid size-8 cursor-help place-items-center rounded-lg border border-border/60 bg-card/90 text-muted-foreground backdrop-blur hover:text-foreground" aria-label="Legenda das cores">
              <Info className="size-4" />
            </span>
            <div className="pointer-events-none absolute top-10 right-0 hidden w-44 gap-1.5 rounded-lg border border-border bg-popover p-3 text-xs shadow-xl group-hover:grid">
              <p className="text-[11px] text-muted-foreground">Cores do canvas</p>
              {LEGENDA.map(([r, cor, Icone]) => <span key={r} className="flex items-center gap-2"><Icone className="size-3.5" style={{ color: cor }} />{r}</span>)}
              <p className="pt-1 text-[10px] text-muted-foreground">Botão direito no canvas, nos nós e nas ligações mostra as opções.</p>
            </div>
          </div>
        </Panel>
        {nos.length === 0 && (
          <Panel position="top-center" className="mt-24 max-w-sm rounded-xl border border-dashed border-border bg-card/80 p-5 text-center text-sm text-muted-foreground backdrop-blur">
            Use a barra embaixo ou o botão direito no canvas para abrir um terminal (Claude, Codex, PowerShell ou Git), uma nota, uma checklist ou desenhar. Ctrl+V cola imagem ou texto.
          </Panel>
        )}
      </ReactFlow>
      {menu && <MenuContexto menu={menu} aoFechar={fecharMenu} />}
      {pergunta && <Confirmar pergunta={pergunta} />}
      <Sheet open={!!tAmpliado} onOpenChange={(v) => !v && setAmpliado(null)}>
        <SheetContent side="right" className="w-[94vw] gap-0 p-0 data-[side=right]:sm:max-w-[min(1400px,94vw)]">
          <SheetHeader className="border-b border-border/60 px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-sm">
              {tAmpliado && <>
                <span className="size-2 rounded-full" style={{ background: corDoTerminal(tAmpliado) }} />
                {nomeDoTerminal(tAmpliado, tAmpliado.sessao ? sessoes.find((s) => s.id === tAmpliado.sessao) : null)}
                <span className="text-xs font-normal" style={{ color: ST[tAmpliado.status].cor }}>{ST[tAmpliado.status].rotulo}</span>
                <span className="font-mono text-xs font-normal text-muted-foreground">{tAmpliado.cwd}</span>
              </>}
            </SheetTitle>
          </SheetHeader>
          {tAmpliado && <TerminalXterm key={tAmpliado.id} id={tAmpliado.id} className="min-h-0 flex-1 bg-[#0c0c10] p-2" />}
        </SheetContent>
      </Sheet>
    </Acoes.Provider>
  )
}

export function Canvas(props: Props) {
  return (
    <div className="h-full w-full">
      <ReactFlowProvider><Quadro {...props} /></ReactFlowProvider>
    </div>
  )
}
