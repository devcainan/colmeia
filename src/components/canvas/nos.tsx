import { createContext, memo, useContext, useEffect, useRef, useState } from 'react'
import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react'
import { ArrowDown, ArrowUp, Circle, CircleCheck, CircleDot, ListChecks, Maximize2, Network, Plus, RotateCcw, Send, StickyNote, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { api, enviar } from '@/lib/dados'
import { AGENTES, STATUS, corContexto, fmtPct, mistura, statusDaTarefa, tarefa } from '@/lib/formato'
import type { Bloco, EstadoGit, EstadoItem, Forma, Posicao, Sessao, SubResumo, Terminal } from '@/lib/tipos'
import { ProgressoChecklist } from '@/components/painel/CartaoSessao'
import { Validar } from '@/components/painel/Validar'
import { TerminalXterm } from './TerminalXterm'
import { COR, ST, corDoTerminal, iconeDoTerminal, nomeDoTerminal } from './cores'
import { Encaixe, useAcoplamento } from './ligacao'

export type AcoesCanvas = {
  ampliar: (id: string) => void
  redimensionar: (no: string, p: Posicao) => void
  inicioRedimensionar: () => void
  abrirSessao: (id: string) => void
  editando: string | null
  setEditando: (no: string | null) => void
  migrar: (sessao: string) => Promise<void>
}
export const Acoes = createContext<AcoesCanvas>(null!)

/** Traz a sessão de fora para um terminal do canvas (fecha a de fora e continua a mesma conversa aqui). */
function BotaoMigrar({ s }: { s: Sessao }) {
  const { migrar } = useContext(Acoes)
  const [confirmar, setConfirmar] = useState(false)
  const [estado, setEstado] = useState<string | null>(null)
  useEffect(() => { if (!confirmar) return; const x = setTimeout(() => setConfirmar(false), 4000); return () => clearTimeout(x) }, [confirmar])
  if (s.agente !== 'claude') return null
  const ir = async () => {
    if (!confirmar) { setConfirmar(true); return }
    setConfirmar(false)
    setEstado('migrando…')
    try { await migrar(s.id); setEstado(null) } catch (e) { setEstado((e as Error).message) }
  }
  return (
    <div className="nodrag flex items-center gap-2">
      {estado && <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground" title={estado}>{estado}</span>}
      <button onClick={(e) => { e.stopPropagation(); void ir() }} onDoubleClick={(e) => e.stopPropagation()}
        className={cn('ml-auto flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
          confirmar ? 'border-transparent bg-[var(--espera)] text-black' : 'border-border hover:bg-accent')}
        title="Fecha a sessão de fora e continua a mesma conversa num terminal do canvas (se estava trabalhando, continua)">
        <ArrowDown className="size-3 -rotate-90" />{confirmar ? 'Fechar a de fora e migrar?' : 'Migrar para o canvas'}
      </button>
    </div>
  )
}

export type DadosTerminal = { t: Terminal; sessao: Sessao | null; git: EstadoGit | null; ligados: number }
export type DadosSessao = { s: Sessao }
export type DadosSub = { sub: SubResumo; agente: 'claude' | 'codex' }
export type DadosBloco = { b: Bloco; ligados: number }

const JANELA_CLAUDE = 1_000_000

export function Ponto({ cor, vivo }: { cor: string; vivo?: boolean }) {
  return <span className={cn('size-2 shrink-0 rounded-full', vivo && 'ponto-vivo')} style={{ background: cor, color: cor }} />
}

// Pontos de ligação dos dois lados: qualquer um liga a qualquer outro (o canvas usa o modo solto) e a
// linha sai do lado virado para o outro nó.
export function Lados({ cor }: { cor: string }) {
  return (
    <>
      <Handle id="esq" type="source" position={Position.Left} className="!size-3 !border-2 !border-background" style={{ background: cor }} />
      <Handle id="dir" type="source" position={Position.Right} className="!size-3 !border-2 !border-background" style={{ background: cor }} />
    </>
  )
}
// Hierarquia: o pai (líder, sessão) sai por baixo e o filho (trabalhador, subagente) entra por cima.
function Cima({ cor }: { cor: string }) {
  return <Handle id="cima" type="target" position={Position.Top} isConnectable={false} className="!size-2 !min-h-0 !min-w-0 !border-none" style={{ background: cor }} />
}
function Baixo({ cor }: { cor: string }) {
  return <Handle id="baixo" type="source" position={Position.Bottom} isConnectable={false} className="!size-2 !min-h-0 !min-w-0 !border-none" style={{ background: cor }} />
}

export function Redimensionar({ id, visivel, minW, minH, proporcao, alcas }: { id: string; visivel: boolean; minW: number; minH: number; proporcao?: boolean; alcas?: string }) {
  const { redimensionar, inicioRedimensionar } = useContext(Acoes)
  return (
    // selecionado: só uma borda fina; os cantos continuam puxando para redimensionar, mas sem bolinha à vista
    <NodeResizer isVisible={visivel} minWidth={minW} minHeight={minH} keepAspectRatio={proporcao} lineClassName="!border-ring/50"
      handleClassName={cn('!size-3 !rounded-none !border-none !bg-transparent', alcas)}
      onResizeStart={() => inicioRedimensionar()} onResizeEnd={(_, p) => redimensionar(id, { x: p.x, y: p.y, w: p.width, h: p.height })} />
  )
}

/** Título que vira campo de texto ao renomear (duplo clique ou menu do botão direito). */
export function Titulo({ no, valor, aoSalvar, className }: { no: string; valor: string; aoSalvar: (v: string) => void; className?: string }) {
  const { editando, setEditando } = useContext(Acoes)
  const [texto, setTexto] = useState(valor)
  useEffect(() => setTexto(valor), [valor])
  if (editando !== no) return <span className={cn('min-w-0 flex-1 truncate', className)} onDoubleClick={(e) => { e.stopPropagation(); setEditando(no) }}>{valor}</span>
  const salvar = () => { setEditando(null); if (texto.trim() !== valor) aoSalvar(texto.trim()) }
  return (
    <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={salvar}
      onKeyDown={(e) => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') { setTexto(valor); setEditando(null) } }}
      className={cn('nodrag min-w-0 flex-1 rounded bg-background px-1 outline-none ring-1 ring-ring', className)} />
  )
}

// ---------- terminal ----------

function ComandoRapido({ t }: { t: Terminal }) {
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const agente = t.tipo === 'claude' || t.tipo === 'codex'
  const mandar = async () => {
    const v = texto.trim()
    if (!v) return
    try {
      const r = await enviar<{ resultado: string }>('POST', `/api/terminais/${t.id}/entrada`, { texto: v })
      setTexto('')
      setAviso(r.resultado === 'entregue' ? null : r.resultado)
    } catch (e) { setAviso((e as Error).message) }
  }
  return (
    <form className="nodrag flex items-center gap-1.5 border-t border-border/60 px-2 py-1.5" onSubmit={(e) => { e.preventDefault(); void mandar() }}>
      <input value={texto} onChange={(e) => setTexto(e.target.value)} disabled={!t.vivo}
        placeholder={!t.vivo ? 'Terminal encerrado' : agente ? 'Mensagem para o agente…' : 'Comando…'}
        className="h-7 min-w-0 flex-1 rounded-md bg-muted/50 px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring" />
      {aviso && <span className="text-[10px] text-muted-foreground">{aviso}</span>}
      <Button type="submit" size="icon" variant="ghost" className="size-7" disabled={!t.vivo || !texto.trim()} title="Enviar"><Send className="size-3.5" /></Button>
    </form>
  )
}

const COMANDOS_GIT: [string, string][] = [['status', 'git status -sb'], ['diff', 'git diff --stat'], ['log', 'git log --oneline -15'], ['fetch', 'git fetch --prune'], ['branches', 'git branch -vv']]

function PainelGit({ t, g }: { t: Terminal; g: EstadoGit | null }) {
  const digitar = (c: string) => void enviar('POST', `/api/terminais/${t.id}/entrada`, { texto: c }).catch(() => {})
  if (!g) return <div className="border-b border-border/60 px-3 py-2 text-[11px] text-muted-foreground">Lendo o git…</div>
  if (g.erro) return <div className="border-b border-border/60 px-3 py-2 text-[11px] text-destructive">{g.erro}</div>
  return (
    <div className="nodrag nowheel grid gap-2 border-b border-border/60 px-3 py-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono font-medium" style={{ color: COR.git }}>{g.branch}</span>
        {g.remoto && <span className="font-mono text-muted-foreground">→ {g.remoto}</span>}
        <span className={cn('flex items-center gap-0.5', g.frente ? 'text-foreground' : 'text-muted-foreground')} title="Commits para enviar"><ArrowUp className="size-3" />{g.frente}</span>
        <span className={cn('flex items-center gap-0.5', g.atras ? 'text-[var(--espera)]' : 'text-muted-foreground')} title="Commits para baixar"><ArrowDown className="size-3" />{g.atras}</span>
        <span style={{ color: g.totalAlterados ? 'var(--espera)' : 'var(--ok)' }}>{g.totalAlterados ? `${g.totalAlterados} alterados` : 'árvore limpa'}</span>
      </div>
      {!!g.alterados?.length && (
        <ul className="grid max-h-20 overflow-y-auto font-mono">
          {g.alterados.slice(0, 40).map((a) => (
            <li key={a.arq} className="flex gap-2 truncate"><span className="w-5 shrink-0" style={{ color: a.st.includes('?') ? 'var(--ok)' : a.st.includes('D') ? 'var(--ev-erro)' : 'var(--espera)' }}>{a.st.trim()}</span><span className="truncate text-muted-foreground">{a.arq}</span></li>
          ))}
        </ul>
      )}
      <ul className="grid gap-0.5">
        {g.commits?.slice(0, 4).map((c) => (
          <li key={c.h} className="flex gap-2 truncate"><span className="font-mono" style={{ color: COR.git }}>{c.h}</span><span className="truncate">{c.msg}</span><span className="ml-auto shrink-0 text-muted-foreground">{c.quando}</span></li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1">
        {COMANDOS_GIT.map(([r, c]) => (
          <button key={r} disabled={!t.vivo} onClick={() => digitar(c)} className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] hover:bg-accent disabled:opacity-40" title={c}>{r}</button>
        ))}
      </div>
    </div>
  )
}

export const NoTerminal = memo(function NoTerminal({ id, data, selected }: NodeProps<Node<DadosTerminal>>) {
  const { t, sessao, git } = data
  const { ampliar } = useContext(Acoes)
  const cor = corDoTerminal(t)
  const Icone = iconeDoTerminal(t)
  const st = ST[t.status]
  const pct = t.contexto ? (t.contexto / JANELA_CLAUDE) * 100 : 0
  const lista = sessao?.checklist || []
  const validar = lista.filter((x) => statusDaTarefa(x) === 'validar')
  const acop = useAcoplamento(id)

  return (
    <div {...acop.props} className={cn('flex h-full w-full flex-col overflow-hidden rounded-xl border-2 bg-card shadow-lg', selected && 'shadow-2xl', t.status === 'trabalhando' && 'borda-viva')}
      style={{ borderColor: mistura(cor, selected ? 90 : 55) }}>
      <Encaixe ativo={acop.ativo} />
      <Redimensionar id={id} visivel={selected} minW={380} minH={280} />
      <Lados cor={cor} />
      <Cima cor={cor} />
      <Baixo cor={cor} />
      <header className="alca flex cursor-grab items-center gap-2 px-3 py-2 active:cursor-grabbing" style={{ background: mistura(cor, 14) }}>
        <span className="grid size-6 shrink-0 place-items-center rounded-md" style={{ background: mistura(cor, 25), color: cor }}><Icone className="size-3.5" /></span>
        <Titulo no={id} valor={nomeDoTerminal(t, sessao)} className="text-xs font-medium"
          aoSalvar={(v) => void enviar('PATCH', `/api/terminais/${t.id}`, { titulo: v }).catch(() => {})} />
        {t.handoff && <span className="rounded px-1.5 text-[10px]" style={{ background: mistura('var(--espera)', 20), color: 'var(--espera)' }}>passando contexto…</span>}
        {t.chat > 1 && <span className="font-mono text-[10px] text-muted-foreground">chat {t.chat}</span>}
        {t.avisos > 0 && <span className="text-[10px] text-muted-foreground">{t.avisos} na fila</span>}
        {t.tipo === 'claude' && t.contexto > 0 && (
          <span className="font-mono text-[10px]" style={{ color: corContexto(pct) }} title={`${Math.round(t.contexto / 1000)} mil tokens de contexto`}>ctx {fmtPct(pct)}</span>
        )}
        <span className="flex items-center gap-1 text-[10px]" style={{ color: st.cor }}><Ponto cor={st.cor} vivo={t.status === 'trabalhando'} />{st.rotulo}</span>
        <span className="nodrag flex items-center">
          {!t.vivo && (
            <Button variant="ghost" size="icon" className="size-6" title={t.tipo === 'claude' && t.sessao ? 'Retomar a conversa' : 'Abrir de novo'}
              onClick={() => void enviar('POST', `/api/terminais/${t.id}/reabrir`).catch(() => {})}><RotateCcw className="size-3.5" /></Button>
          )}
          <Button variant="ghost" size="icon" className="size-6" title="Ampliar" onClick={() => ampliar(t.id)}><Maximize2 className="size-3.5" /></Button>
        </span>
      </header>
      {t.tipo === 'git' && <PainelGit t={t} g={git} />}
      <TerminalXterm id={t.id} className="nodrag nowheel nopan min-h-0 flex-1 bg-[#0c0c10] px-1.5 pt-1" />
      {/* Claude e Codex: só o chat do próprio terminal; o campo extra fica para PowerShell e Git */}
      {(t.tipo === 'shell' || t.tipo === 'git') && <ComandoRapido t={t} />}
      {lista.length > 0 && (
        <footer className="nodrag nowheel grid max-h-36 gap-1.5 overflow-y-auto border-t border-border/60 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <ListChecks className="size-3" /><span className="flex-1">Checklist do agente</span>
            <span className="font-mono">{lista.filter((x) => x.status === 'completed').length}/{lista.length}</span>
          </div>
          <ProgressoChecklist fixa itens={lista} />
          {validar.map((x) => (
            <div key={x.id} className="grid gap-1.5 rounded-md p-2" style={{ background: mistura(tarefa('validar').cor, 12) }}>
              <p className="text-xs">{x.titulo}</p>
              <Validar terminal={t.id} titulo={x.titulo} />
            </div>
          ))}
        </footer>
      )}
    </div>
  )
})

// ---------- sessão de fora e subagente ----------

export const NoSessao = memo(function NoSessao({ id, data }: NodeProps<Node<DadosSessao>>) {
  const { s } = data
  const { abrirSessao } = useContext(Acoes)
  const cor = AGENTES[s.agente].cor
  const pct = s.janela ? (s.contexto / s.janela) * 100 : 0
  const st = STATUS[s.status]
  const ativos = s.subagentes.filter((x) => x.status === 'trabalhando').length
  const acop = useAcoplamento(id)
  return (
    <div {...acop.props} onDoubleClick={() => abrirSessao(s.id)}
      className={cn('grid h-full w-full content-start gap-2 rounded-xl border-2 border-dashed bg-card/85 p-3 shadow-sm backdrop-blur', s.status === 'trabalhando' && 'borda-viva')}
      style={{ borderColor: mistura(cor, 45) }}>
      <Encaixe ativo={acop.ativo} />
      <Lados cor={cor} />
      <Baixo cor={cor} />
      <div className="flex items-center gap-2">
        <Ponto cor={cor} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{s.nome || s.titulo || s.id.slice(0, 8)}</span>
        <span className="flex items-center gap-1 text-[10px]" style={{ color: st.cor }}><Ponto cor={st.cor} vivo={s.status === 'trabalhando'} />{st.rotulo}</span>
      </div>
      <p className="truncate text-[11px] text-muted-foreground">{s.projeto}{s.fazendo ? ` · ${s.fazendo.texto}` : ''}</p>
      <div className="h-1 overflow-hidden rounded-full bg-muted" title={`contexto ${fmtPct(pct)}`}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: corContexto(pct) }} />
      </div>
      {s.checklist.length > 0 && <ProgressoChecklist fixa itens={s.checklist} />}
      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {ativos > 0 && <><Network className="size-3" style={{ color: COR.subagente }} />{ativos} subagente{ativos > 1 ? 's' : ''} · </>}
        Aberta fora do canvas · duplo clique para detalhes
      </p>
      <BotaoMigrar s={s} />
    </div>
  )
})

export const NoSubagente = memo(function NoSubagente({ data }: NodeProps<Node<DadosSub>>) {
  const { sub } = data
  const st = STATUS[sub.status]
  return (
    <div className={cn('grid h-full w-full content-center gap-0.5 rounded-lg border bg-card px-2.5 py-1.5 shadow-sm', sub.status === 'trabalhando' && 'borda-viva')}
      style={{ borderColor: mistura(COR.subagente, 50) }}>
      <Cima cor={COR.subagente} />
      <div className="flex items-center gap-1.5">
        <Network className="size-3 shrink-0" style={{ color: COR.subagente }} />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{sub.titulo || sub.nome || 'subagente'}</span>
        <Ponto cor={st.cor} vivo={sub.status === 'trabalhando'} />
      </div>
      <p className="truncate text-[10px] text-muted-foreground">{sub.status === 'trabalhando' ? sub.fazendo || 'trabalhando' : 'terminou'}</p>
    </div>
  )
})

// ---------- blocos: nota e checklist ----------

function useRascunho(valor: string, gravar: (v: string) => void) {
  const [texto, setTexto] = useState(valor)
  const editando = useRef(false)
  const timer = useRef(0)
  useEffect(() => { if (!editando.current) setTexto(valor) }, [valor])
  const mudar = (v: string) => {
    editando.current = true
    setTexto(v)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { gravar(v); editando.current = false }, 600)
  }
  return [texto, mudar] as const
}

function BotaoEnviar({ b, ligados, rotulo }: { b: Bloco; ligados: number; rotulo: string }) {
  const [aviso, setAviso] = useState<string | null>(null)
  useEffect(() => { if (!aviso) return; const x = setTimeout(() => setAviso(null), 4000); return () => clearTimeout(x) }, [aviso])
  const ir = async () => {
    try {
      const r = await enviar<{ resultados: { resultado: string }[] }>('POST', `/api/blocos/${b.id}/enviar`)
      const fila = r.resultados.filter((x) => x.resultado === 'na-fila').length
      setAviso(fila ? `${r.resultados.length - fila} entregue, ${fila} na fila` : 'Entregue')
    } catch (e) { setAviso((e as Error).message) }
  }
  return (
    <div className="nodrag flex items-center gap-2 border-t border-border/60 px-3 py-1.5">
      <span className="flex-1 truncate text-[10px] text-muted-foreground">{aviso || (ligados ? `Ligado a ${ligados} terminal${ligados > 1 ? 'is' : ''}` : 'Arraste de um ponto do lado até um terminal')}</span>
      <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px]" disabled={!ligados} onClick={() => void ir()}><Send className="size-3" />{rotulo}</Button>
    </div>
  )
}

export const NoNota = memo(function NoNota({ id, data, selected }: NodeProps<Node<DadosBloco>>) {
  const { b, ligados } = data
  const [texto, mudar] = useRascunho(b.texto, (v) => void enviar('PATCH', `/api/blocos/${b.id}`, { texto: v }).catch(() => {}))
  const acop = useAcoplamento(id)
  return (
    <div {...acop.props} className="flex h-full w-full flex-col overflow-hidden rounded-xl border-2 bg-card shadow-md" style={{ borderColor: mistura(COR.nota, selected ? 90 : 50) }}>
      <Encaixe ativo={acop.ativo} />
      <Redimensionar id={id} visivel={selected} minW={220} minH={140} />
      <header className="alca flex cursor-grab items-center gap-2 px-3 py-2" style={{ background: mistura(COR.nota, 14) }}>
        <StickyNote className="size-3.5 shrink-0" style={{ color: COR.nota }} />
        <Titulo no={id} valor={b.titulo} className="text-xs font-medium" aoSalvar={(v) => void enviar('PATCH', `/api/blocos/${b.id}`, { titulo: v }).catch(() => {})} />
      </header>
      <textarea value={texto} onChange={(e) => mudar(e.target.value)} placeholder="Escreva a nota. Ligue a um terminal e use Enviar para o agente receber."
        className="nodrag nowheel min-h-0 flex-1 resize-none bg-transparent px-3 py-2 text-xs leading-relaxed outline-none placeholder:text-muted-foreground/70" />
      <BotaoEnviar b={b} ligados={ligados} rotulo="Enviar" />
      <Lados cor={COR.nota} />
    </div>
  )
})

const ICONE_ITEM: Record<EstadoItem, typeof Circle> = { andamento: CircleDot, pendente: Circle, feito: CircleCheck }
const COR_ITEM: Record<EstadoItem, string> = { andamento: 'var(--ev-pedido)', pendente: 'var(--muted-foreground)', feito: 'var(--ok)' }
const ORDEM_ITEM: Record<EstadoItem, number> = { andamento: 0, pendente: 1, feito: 2 }

export const NoChecklist = memo(function NoChecklist({ id, data, selected }: NodeProps<Node<DadosBloco>>) {
  const { b, ligados } = data
  const [novo, setNovo] = useState('')
  const itens = [...b.itens].sort((x, y) => ORDEM_ITEM[x.estado] - ORDEM_ITEM[y.estado] || x.id - y.id)
  const feitos = b.itens.filter((i) => i.estado === 'feito').length
  const gravar = (lista: Bloco['itens'] | { texto: string }[]) => void enviar('PATCH', `/api/blocos/${b.id}`, { itens: lista }).catch(() => {})
  const alternar = (i: Bloco['itens'][number]) =>
    void enviar('POST', `/api/blocos/${b.id}/marcar`, { item: i.id, estado: i.estado === 'feito' ? 'pendente' : 'feito', por: 'usuario' }).catch(() => {})
  const adicionar = () => { if (!novo.trim()) return; gravar([...b.itens, { texto: novo.trim() }]); setNovo('') }
  const acop = useAcoplamento(id)

  return (
    <div {...acop.props} className="flex h-full w-full flex-col overflow-hidden rounded-xl border-2 bg-card shadow-md" style={{ borderColor: mistura(COR.checklist, selected ? 90 : 50) }}>
      <Encaixe ativo={acop.ativo} />
      <Redimensionar id={id} visivel={selected} minW={240} minH={160} />
      <header className="alca flex cursor-grab items-center gap-2 px-3 py-2" style={{ background: mistura(COR.checklist, 14) }}>
        <ListChecks className="size-3.5 shrink-0" style={{ color: COR.checklist }} />
        <Titulo no={id} valor={b.titulo} className="text-xs font-medium" aoSalvar={(v) => void enviar('PATCH', `/api/blocos/${b.id}`, { titulo: v }).catch(() => {})} />
        <span className="font-mono text-[10px] text-muted-foreground">{feitos}/{b.itens.length}</span>
      </header>
      <div className="px-3 pt-2"><ProgressoChecklist fixa itens={b.itens.map((i) => ({ id: String(i.id), titulo: i.texto, status: i.estado === 'feito' ? 'completed' : i.estado === 'andamento' ? 'in_progress' : 'pending', mudou: i.mudou }))} /></div>
      <ul className="nodrag nowheel grid min-h-0 flex-1 content-start overflow-y-auto px-2 py-1">
        {itens.map((i) => {
          const Icone = ICONE_ITEM[i.estado]
          return (
            <li key={i.id} className="group flex items-start gap-2 rounded px-1 py-1 text-xs hover:bg-accent/50">
              <button onClick={() => alternar(i)} className="mt-px" title={i.estado === 'feito' ? 'Desmarcar' : 'Marcar como feito'}>
                <Icone className={cn('size-3.5', i.estado === 'andamento' && 'animate-pulse')} style={{ color: COR_ITEM[i.estado] }} />
              </button>
              <span className={cn('flex-1 leading-snug', i.estado === 'feito' && 'text-muted-foreground line-through decoration-muted-foreground/40')}>
                <span className="mr-1 font-mono text-[10px] text-muted-foreground">{i.id}</span>{i.texto}
                {i.por === 'agente' && i.estado !== 'pendente' && <span className="ml-1 text-[10px] text-muted-foreground">· agente</span>}
              </span>
              <button onClick={() => gravar(b.itens.filter((x) => x.id !== i.id))} className="opacity-0 group-hover:opacity-100" title="Remover"><X className="size-3 text-muted-foreground" /></button>
            </li>
          )
        })}
      </ul>
      <form className="nodrag flex items-center gap-1 px-2 pb-1.5" onSubmit={(e) => { e.preventDefault(); adicionar() }}>
        <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo item…" className="h-7 min-w-0 flex-1 rounded-md bg-muted/50 px-2 text-xs outline-none focus:ring-1 focus:ring-ring" />
        <Button type="submit" size="icon" variant="ghost" className="size-7" disabled={!novo.trim()}><Plus className="size-3.5" /></Button>
      </form>
      <BotaoEnviar b={b} ligados={ligados} rotulo="Executar" />
      <Lados cor={COR.checklist} />
    </div>
  )
})

// ---------- formas do quadro (como no Figma) ----------

export type DadosForma = { f: Forma }
const COR_PADRAO_FORMA = 'var(--muted-foreground)'
const editarForma = (f: Forma, dados: Partial<Forma>) => void enviar('PATCH', `/api/formas/${f.id}`, dados).catch(() => {})

/** O frame fica atrás de tudo e só pega o mouse pelo nome e pelas alças: dentro dele a seleção por arraste continua. */
export const NoFrame = memo(function NoFrame({ id, data, selected }: NodeProps<Node<DadosForma>>) {
  const { f } = data
  const cor = f.cor || COR_PADRAO_FORMA
  return (
    <div className="relative h-full w-full rounded-md border" style={{ borderColor: mistura(cor, selected ? 95 : 60), background: mistura(cor, 5) }}>
      <Redimensionar id={id} visivel={selected} minW={80} minH={60} alcas="!pointer-events-auto" />
      <div className="alca pointer-events-auto absolute -top-6 left-0 flex max-w-full cursor-grab items-center text-[12px] font-medium active:cursor-grabbing" style={{ color: cor }}>
        <Titulo no={id} valor={f.texto || 'Frame'} aoSalvar={(v) => editarForma(f, { texto: v || 'Frame' })} />
      </div>
    </div>
  )
})

export const NoRetangulo = memo(function NoRetangulo({ id, data, selected }: NodeProps<Node<DadosForma>>) {
  const { f } = data
  const cor = f.cor || COR_PADRAO_FORMA
  return (
    <div className="h-full w-full rounded-md border-2 shadow-sm" style={{ borderColor: cor, background: cor }}>
      <Redimensionar id={id} visivel={selected} minW={8} minH={8} />
    </div>
  )
})

const TAMANHO_TEXTO = 18

export const NoTexto = memo(function NoTexto({ id, data, selected }: NodeProps<Node<DadosForma>>) {
  const { f } = data
  const { editando, setEditando } = useContext(Acoes)
  const [texto, mudar] = useRascunho(f.texto, (v) => editarForma(f, { texto: v }))
  const estilo = { color: f.cor || 'var(--foreground)', fontSize: f.tamanho || TAMANHO_TEXTO, lineHeight: 1.3 }
  const aqui = editando === id
  return (
    <div className={cn('h-full w-full rounded-sm', selected && !aqui && 'outline outline-1 outline-ring/60')} onDoubleClick={() => setEditando(id)}>
      <Redimensionar id={id} visivel={selected && !aqui} minW={40} minH={20} />
      {aqui ? (
        <textarea autoFocus value={texto} onChange={(e) => mudar(e.target.value)} onBlur={() => setEditando(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur() }}
          onFocus={(e) => e.target.select()}
          className="nodrag nowheel h-full w-full resize-none overflow-hidden bg-transparent outline outline-1 outline-ring" style={estilo} />
      ) : (
        <div className="h-full w-full overflow-hidden whitespace-pre-wrap break-words" style={estilo}>
          {texto || <span className="text-muted-foreground">Texto</span>}
        </div>
      )}
    </div>
  )
})

export const NoImagem = memo(function NoImagem({ id, data, selected }: NodeProps<Node<DadosForma>>) {
  const { f } = data
  return (
    <div className={cn('h-full w-full', selected && 'outline outline-2 outline-ring')}>
      <Redimensionar id={id} visivel={selected} minW={30} minH={30} proporcao />
      {f.url && <img src={api(f.url)} alt="" draggable={false} className="h-full w-full select-none object-fill" />}
    </div>
  )
})

/** Traço do lápis: pontos em 0..1, então o desenho estica junto com a caixa. */
export function caminhoDoTraco(pontos: [number, number][], escala = 1000) {
  if (!pontos.length) return ''
  const p = pontos.map(([x, y]) => [x * escala, y * escala])
  if (p.length < 3) return `M${p[0][0]},${p[0][1]} ${p.map(([x, y]) => `L${x},${y}`).join(' ')}`
  let d = `M${p[0][0]},${p[0][1]}`
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i][0] + p[i + 1][0]) / 2
    const my = (p[i][1] + p[i + 1][1]) / 2
    d += ` Q${p[i][0]},${p[i][1]} ${mx},${my}`
  }
  const u = p[p.length - 1]
  return `${d} L${u[0]},${u[1]}`
}

export const NoDesenho = memo(function NoDesenho({ id, data, selected }: NodeProps<Node<DadosForma>>) {
  const { f } = data
  return (
    <div className={cn('h-full w-full', selected && 'outline outline-1 outline-dashed outline-ring')}>
      <Redimensionar id={id} visivel={selected} minW={4} minH={4} />
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <path d={caminhoDoTraco(f.pontos || [])} fill="none" stroke={f.cor || 'var(--foreground)'} strokeWidth={f.espessura || 3}
          strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
})

export const tiposDeNo = {
  terminal: NoTerminal, sessao: NoSessao, subagente: NoSubagente, nota: NoNota, checklist: NoChecklist,
  frame: NoFrame, retangulo: NoRetangulo, texto: NoTexto, imagem: NoImagem, desenho: NoDesenho,
}
