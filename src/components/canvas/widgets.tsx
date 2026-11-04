import { memo, useEffect, useState, type ReactNode } from 'react'
import type { Node, NodeProps } from '@xyflow/react'
import {
  Calculator, CircleAlert, CircleCheck, CircleDashed, CircleX, ExternalLink, Gauge as IconeProducao, Loader2, MousePointerClick, Pause, Play, Plus,
  RotateCcw, Rocket, Settings2, Timer, Trash2, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { enviar, useTique } from '@/lib/dados'
import { duracao, haQuanto, mistura } from '@/lib/formato'
import type { DadosWidget, ExecucaoDeploy, Sessao, TipoWidget, Widget } from '@/lib/tipos'
import { Validar } from '@/components/painel/Validar'
import { Lados, Ponto, Redimensionar, Titulo } from './nos'
import type { Icone } from './logos'

export const COR_WIDGET: Record<TipoWidget, string> = {
  validacoes: 'var(--espera)',
  deploy: 'var(--ev-comando)',
  producao: 'var(--ok)',
  botoes: 'var(--ev-pedido)',
  cronometro: 'var(--ev-aviso)',
  calculadora: 'var(--ev-web)',
}
export const ICONE_WIDGET: Record<TipoWidget, Icone> = {
  validacoes: CircleAlert, deploy: Rocket, producao: IconeProducao, botoes: MousePointerClick, cronometro: Timer, calculadora: Calculator,
}
export const NOME_WIDGET: Record<TipoWidget, string> = {
  validacoes: 'Validações', deploy: 'Deploy', producao: 'Produção no ar', botoes: 'Botões rápidos', cronometro: 'Cronômetro', calculadora: 'Calculadora',
}
export const TAM_WIDGET: Record<TipoWidget, { w: number; h: number }> = {
  validacoes: { w: 340, h: 320 }, deploy: { w: 380, h: 300 }, producao: { w: 300, h: 220 }, botoes: { w: 280, h: 220 }, cronometro: { w: 260, h: 190 },
  calculadora: { w: 260, h: 380 },
}

export type ItemValidacao = { sessao: Sessao; titulo: string; terminal: string | null; id: string }
export type DadosNoWidget = { w: Widget; dados: DadosWidget | null; ligados: number; validacoes: ItemValidacao[] }

const mudar = (id: string, corpo: Partial<Widget>) => enviar('PATCH', `/api/widgets/${id}`, corpo).catch(() => {})

const campo = 'h-7 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-ring'

/** Casca comum: cabeçalho com nome editável e engrenagem; corpo ou ajustes. */
function Casca({ id, w, selected, ajustes, children, direita }: {
  id: string; w: Widget; selected: boolean; ajustes?: (fechar: () => void) => ReactNode; children: ReactNode; direita?: ReactNode
}) {
  const [ajustando, setAjustando] = useState(false)
  const cor = COR_WIDGET[w.tipo]
  const IconeW = ICONE_WIDGET[w.tipo]
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border-2 bg-card shadow-md" style={{ borderColor: mistura(cor, selected ? 90 : 50) }}>
      <Redimensionar id={id} visivel={selected} minW={220} minH={140} />
      <header className="alca flex cursor-grab items-center gap-2 px-3 py-2" style={{ background: mistura(cor, 14) }}>
        <IconeW className="size-3.5 shrink-0" style={{ color: cor }} />
        <Titulo no={id} valor={w.titulo} className="text-xs font-medium" aoSalvar={(v) => void mudar(w.id, { titulo: v })} />
        {direita}
        {ajustes && (
          <button className={cn('nodrag rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground', ajustando && 'bg-accent text-foreground')}
            onClick={() => setAjustando((v) => !v)} title="Ajustar">
            <Settings2 className="size-3.5" />
          </button>
        )}
      </header>
      <div className="nodrag nowheel min-h-0 flex-1 overflow-y-auto">
        {ajustando && ajustes ? <div className="grid gap-2 p-3 text-xs">{ajustes(() => setAjustando(false))}</div> : children}
      </div>
      <Lados cor={cor} />
    </div>
  )
}

// ---------- 3. Validações ----------

const WValidacoes = ({ id, d, selected }: { id: string; d: DadosNoWidget; selected: boolean }) => (
  <Casca id={id} w={d.w} selected={selected}
    direita={d.validacoes.length > 0 && <span className="rounded-full px-1.5 text-[10px] font-medium text-black" style={{ background: 'var(--espera)' }}>{d.validacoes.length}</span>}>
    {d.validacoes.length === 0 ? (
      <p className="grid h-full place-items-center p-4 text-center text-xs text-muted-foreground">Nada esperando você. Quando um agente marcar um item com [validar], ele aparece aqui.</p>
    ) : (
      <ul className="grid gap-2 p-3">
        {d.validacoes.map((v) => (
          <li key={v.id} className="grid gap-1.5 rounded-md p-2" style={{ background: mistura('var(--espera)', 12) }}>
            <p className="truncate text-[10px] text-muted-foreground">{v.sessao.titulo || v.sessao.nome || v.sessao.id.slice(0, 8)}</p>
            <p className="text-xs">{v.titulo.replace(/^\[validar\]\s*/i, '')}</p>
            {v.terminal ? <Validar terminal={v.terminal} titulo={v.titulo} /> : <p className="text-[10px] text-muted-foreground">Sessão fora do canvas: responda no terminal dela.</p>}
          </li>
        ))}
      </ul>
    )}
  </Casca>
)

// ---------- 5. Deploy ----------

function EstadoExecucao({ r }: { r: ExecucaoDeploy }) {
  if (r.status !== 'completed') return <Loader2 className="size-3.5 shrink-0 animate-spin" style={{ color: 'var(--ev-pedido)' }} />
  if (r.conclusao === 'success') return <CircleCheck className="size-3.5 shrink-0" style={{ color: 'var(--ok)' }} />
  if (r.conclusao === 'failure' || r.conclusao === 'timed_out') return <CircleX className="size-3.5 shrink-0" style={{ color: 'var(--ev-erro)' }} />
  return <CircleDashed className="size-3.5 shrink-0 text-muted-foreground" />
}

function AjustesDeploy({ w, fechar }: { w: Widget; fechar: () => void }) {
  const [repo, setRepo] = useState(w.config.repo || '')
  const [workflow, setWorkflow] = useState(w.config.workflow || '')
  const [quantos, setQuantos] = useState(String(w.config.quantos || 5))
  return (
    <>
      <label className="grid gap-1">Repositório (dono/nome)<input className={campo} value={repo} onChange={(e) => setRepo(e.target.value)} /></label>
      <label className="grid gap-1">Workflow (vazio = todos)<input className={campo} value={workflow} onChange={(e) => setWorkflow(e.target.value)} /></label>
      <label className="grid gap-1">Quantas execuções<input type="number" min={1} max={15} className={campo} value={quantos} onChange={(e) => setQuantos(e.target.value)} /></label>
      <Button size="sm" className="h-7 text-xs" onClick={() => { void mudar(w.id, { config: { repo, workflow, quantos: Number(quantos) } }); fechar() }}>Salvar</Button>
    </>
  )
}

function WDeploy({ id, d, selected }: { id: string; d: DadosNoWidget; selected: boolean }) {
  useTique(15000)
  const runs = d.dados?.runs || []
  return (
    <Casca id={id} w={d.w} selected={selected} ajustes={(fechar) => <AjustesDeploy w={d.w} fechar={fechar} />}
      direita={d.dados?.em ? <span className="text-[10px] text-muted-foreground">{haQuanto(d.dados.em)}</span> : null}>
      <div className="grid gap-1 p-2">
        <p className="truncate px-1 font-mono text-[10px] text-muted-foreground">{d.w.config.repo}{d.w.config.workflow ? ` · ${d.w.config.workflow}` : ''}</p>
        {d.dados?.erro && <p className="px-1 text-xs text-destructive">{d.dados.erro}</p>}
        {!d.dados && <p className="px-1 text-xs text-muted-foreground">Lendo o GitHub…</p>}
        {d.dados && !d.dados.erro && runs.length === 0 && <p className="px-1 text-xs text-muted-foreground">Nenhuma execução encontrada.</p>}
        {runs.map((r) => (
          <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="group grid gap-0.5 rounded-md px-1.5 py-1 hover:bg-accent">
            <span className="flex items-center gap-1.5 text-xs">
              <EstadoExecucao r={r} />
              <span className="min-w-0 flex-1 truncate">{r.titulo}</span>
              <ExternalLink className="size-3 shrink-0 opacity-0 group-hover:opacity-60" />
            </span>
            <span className="flex gap-2 pl-5 text-[10px] text-muted-foreground">
              <span>#{r.numero}</span><span className="font-mono">{r.branch}</span>
              <span className="ml-auto">{r.status === 'completed' ? `${duracao(new Date(r.fim).getTime() - new Date(r.inicio).getTime())} · ${haQuanto(new Date(r.fim).getTime())}` : `rodando há ${duracao(Date.now() - new Date(r.inicio).getTime())}`}</span>
            </span>
          </a>
        ))}
      </div>
    </Casca>
  )
}

// ---------- 6. Produção no ar ----------

function AjustesProducao({ w, fechar }: { w: Widget; fechar: () => void }) {
  const [url, setUrl] = useState(w.config.url || '')
  const [intervalo, setIntervalo] = useState(String(w.config.intervalo || 60))
  return (
    <>
      <label className="grid gap-1">Endereço<input className={campo} value={url} onChange={(e) => setUrl(e.target.value)} /></label>
      <label className="grid gap-1">Conferir a cada (segundos)<input type="number" min={15} max={3600} className={campo} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} /></label>
      <Button size="sm" className="h-7 text-xs" onClick={() => { void mudar(w.id, { config: { url, intervalo: Number(intervalo) } }); fechar() }}>Salvar</Button>
    </>
  )
}

function WProducao({ id, d, selected }: { id: string; d: DadosNoWidget; selected: boolean }) {
  useTique(15000)
  const p = d.dados
  const cor = !p ? 'var(--muted-foreground)' : p.ok ? 'var(--ok)' : 'var(--ev-erro)'
  const hist = p?.historico || []
  const maior = Math.max(...hist.map((h) => h.ms), 1)
  return (
    <Casca id={id} w={d.w} selected={selected} ajustes={(fechar) => <AjustesProducao w={d.w} fechar={fechar} />}>
      <div className="grid gap-2 p-3">
        <div className="flex items-center gap-2">
          <Ponto cor={cor} vivo={!!p?.ok} />
          <span className="text-sm font-medium" style={{ color: cor }}>{!p ? 'Conferindo…' : p.ok ? 'No ar' : 'Fora do ar'}</span>
          {p?.desde && <span className="text-[10px] text-muted-foreground">desde {haQuanto(p.desde)}</span>}
          <a href={d.w.config.url} target="_blank" rel="noreferrer" className="ml-auto text-muted-foreground hover:text-foreground" title="Abrir"><ExternalLink className="size-3.5" /></a>
        </div>
        <p className="truncate font-mono text-[10px] text-muted-foreground">{d.w.config.url}</p>
        {p && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-muted/50 p-1.5"><p className="text-[10px] text-muted-foreground">resposta</p><p className="font-mono text-xs">{p.erro || p.status}</p></div>
            <div className="rounded-md bg-muted/50 p-1.5"><p className="text-[10px] text-muted-foreground">tempo</p><p className="font-mono text-xs">{p.ms} ms</p></div>
            <div className="rounded-md bg-muted/50 p-1.5"><p className="text-[10px] text-muted-foreground">versão</p><p className="truncate font-mono text-xs" title={p.versao || ''}>{p.versao ? p.versao.slice(0, 8) : '—'}</p></div>
          </div>
        )}
        {hist.length > 1 && (
          <div className="flex h-8 items-end gap-px" title="Tempo de resposta das últimas conferências">
            {hist.map((h, i) => (
              <span key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(12, (h.ms / maior) * 100)}%`, background: h.ok ? mistura('var(--ok)', 70) : 'var(--ev-erro)' }} />
            ))}
          </div>
        )}
      </div>
    </Casca>
  )
}

// ---------- 9. Botões rápidos ----------

function AjustesBotoes({ w, fechar }: { w: Widget; fechar: () => void }) {
  const [botoes, setBotoes] = useState(w.config.botoes || [])
  const trocar = (i: number, k: 'rotulo' | 'texto', v: string) => setBotoes((bs) => bs.map((b, j) => (j === i ? { ...b, [k]: v } : b)))
  return (
    <>
      {botoes.map((b, i) => (
        <div key={i} className="grid gap-1 rounded-md border border-border p-2">
          <div className="flex gap-1">
            <input className={campo} placeholder="Nome do botão" value={b.rotulo} onChange={(e) => trocar(i, 'rotulo', e.target.value)} />
            <button onClick={() => setBotoes((bs) => bs.filter((_, j) => j !== i))} className="rounded px-1 text-muted-foreground hover:text-destructive" title="Remover"><Trash2 className="size-3.5" /></button>
          </div>
          <textarea className={cn(campo, 'h-14 resize-none py-1')} placeholder="O que ele manda ao terminal" value={b.texto} onChange={(e) => trocar(i, 'texto', e.target.value)} />
        </div>
      ))}
      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setBotoes((bs) => [...bs, { rotulo: '', texto: '' }])}><Plus className="size-3" />Botão</Button>
      <Button size="sm" className="h-7 text-xs" onClick={() => { void mudar(w.id, { config: { botoes } }); fechar() }}>Salvar</Button>
    </>
  )
}

function WBotoes({ id, d, selected }: { id: string; d: DadosNoWidget; selected: boolean }) {
  const [aviso, setAviso] = useState<string | null>(null)
  useEffect(() => { if (!aviso) return; const x = setTimeout(() => setAviso(null), 4000); return () => clearTimeout(x) }, [aviso])
  const apertar = async (i: number) => {
    try {
      const r = await enviar<{ resultados: { resultado: string }[] }>('POST', `/api/widgets/${d.w.id}/apertar`, { indice: i })
      setAviso(r.resultados.every((x) => x.resultado === 'entregue') ? 'Enviado' : r.resultados.map((x) => x.resultado).join(', '))
    } catch (e) { setAviso((e as Error).message) }
  }
  const botoes = d.w.config.botoes || []
  return (
    <Casca id={id} w={d.w} selected={selected} ajustes={(fechar) => <AjustesBotoes w={d.w} fechar={fechar} />}>
      <div className="grid gap-1.5 p-3">
        {botoes.map((b, i) => (
          <Button key={i} size="sm" variant="outline" disabled={!d.ligados} className="h-8 justify-start text-xs" title={b.texto} onClick={() => void apertar(i)}>{b.rotulo}</Button>
        ))}
        {botoes.length === 0 && <p className="text-xs text-muted-foreground">Sem botões. Use a engrenagem para criar.</p>}
        <p className="pt-1 text-[10px] text-muted-foreground">{aviso || (d.ligados ? `Ligado a ${d.ligados} terminal${d.ligados > 1 ? 'is' : ''}` : 'Ligue a um terminal arrastando do ponto do lado')}</p>
      </div>
    </Casca>
  )
}

// ---------- 10. Cronômetro ----------

const relogio = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':')
}

function WCronometro({ id, d, selected }: { id: string; d: DadosNoWidget; selected: boolean }) {
  const agora = useTique(1000)
  const c = d.w.config
  const total = (c.acumulado || 0) + (c.inicio ? Math.max(0, agora - c.inicio) : 0)
  const acao = (a: string) => void enviar('POST', `/api/widgets/${d.w.id}/cronometro`, { acao: a }).catch(() => {})
  return (
    <Casca id={id} w={d.w} selected={selected}
      ajustes={(fechar) => (
        <>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!c.auto} onChange={(e) => { void mudar(d.w.id, { config: { auto: e.target.checked } }); fechar() }} />
            Contar sozinho enquanto o terminal ligado trabalha</label>
          <p className="text-[10px] text-muted-foreground">Ligue o cronômetro a um terminal arrastando do ponto do lado.</p>
        </>
      )}>
      <div className="grid h-full content-center justify-items-center gap-2 p-3">
        <p className={cn('font-mono text-3xl tabular-nums', c.inicio && 'text-foreground', !c.inicio && 'text-muted-foreground')}>{relogio(total)}</p>
        {c.auto
          ? <p className="text-[10px] text-muted-foreground">{c.inicio ? 'terminal trabalhando' : d.ligados ? 'esperando o terminal trabalhar' : 'ligue a um terminal'}</p>
          : null}
        <div className="flex gap-1.5">
          {!c.auto && (c.inicio
            ? <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => acao('pausar')}><Pause className="size-3" />Pausar</Button>
            : <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => acao('iniciar')}><Play className="size-3" />Iniciar</Button>)}
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => acao('zerar')}><RotateCcw className="size-3" />Zerar</Button>
        </div>
      </div>
    </Casca>
  )
}

// ---------- Calculadora ----------

const OPS = ['+', '−', '×', '÷']
const ehOp = (t?: string) => !!t && OPS.includes(t)
const valor = (t: string) => (t.endsWith('%') ? Number(t.slice(0, -1).replace(',', '.')) / 100 : Number(t.replace(',', '.')))

/** × e ÷ antes de + e −; operador solto no fim é ignorado. null quando não há conta. */
function calcular(toks: string[]): number | null {
  const t = [...toks]
  while (ehOp(t[t.length - 1])) t.pop()
  if (!t.length) return null
  const termos: number[] = []
  const sinais: string[] = []
  let acc = valor(t[0])
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i]
    const n = valor(t[i + 1])
    if (op === '×') acc *= n
    else if (op === '÷') acc = n === 0 ? NaN : acc / n
    else { termos.push(acc); sinais.push(op); acc = n }
  }
  termos.push(acc)
  const r = sinais.reduce((s, op, i) => (op === '+' ? s + termos[i + 1] : s - termos[i + 1]), termos[0])
  return Number.isFinite(r) ? Number(r.toPrecision(12)) : NaN
}

// número com ponto de milhar e vírgula decimal, como no Brasil
const exibirNumero = (t: string) => {
  const neg = t.startsWith('-')
  const pct = t.endsWith('%')
  const [int, dec] = t.replace(/^-/, '').replace(/%$/, '').split(',')
  return `${neg ? '−' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${dec !== undefined ? `,${dec}` : ''}${pct ? '%' : ''}`
}
const paraTexto = (n: number) => String(n).replace('.', ',')
const exibirResultado = (n: number | null) => (n === null ? '0' : Number.isNaN(n) ? 'Erro' : n.toLocaleString('pt-BR', { maximumFractionDigits: 10 }))

const TECLAS = [
  ['C', '⌫', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['±', '0', ',', '='],
]

function WCalculadora({ id, d, selected }: { id: string; d: DadosNoWidget; selected: boolean }) {
  const chave = `calc-${d.w.id}`
  const [toks, setToks] = useState<string[]>([])
  const [feito, setFeito] = useState(false) // acabou de apertar =: um número novo começa outra conta
  const [historico, setHistorico] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(chave) || '[]') } catch { return [] } })
  const guardar = (h: string[]) => { setHistorico(h); try { localStorage.setItem(chave, JSON.stringify(h)) } catch { /* sem armazenamento */ } }

  const apertar = (k: string) => {
    const t = [...toks]
    const ult = t[t.length - 1]
    const numero = ult !== undefined && !ehOp(ult)
    if (/^\d$/.test(k)) {
      if (feito || !numero) { if (feito) t.length = 0; t.push(k) }
      else if (ult.endsWith('%')) return
      else t[t.length - 1] = ult === '0' ? k : ult === '-0' ? `-${k}` : ult + k
    } else if (k === ',') {
      if (feito || !numero) { if (feito) t.length = 0; t.push('0,') }
      else if (!ult.includes(',') && !ult.endsWith('%')) t[t.length - 1] = `${ult},`
    } else if (ehOp(k)) {
      if (!t.length) t.push('0')
      if (ehOp(t[t.length - 1])) t[t.length - 1] = k
      else t.push(k)
    } else if (k === '%') {
      if (numero && !ult.endsWith('%')) t[t.length - 1] = `${ult.replace(/,$/, '')}%`
    } else if (k === '±') {
      if (numero) t[t.length - 1] = ult.startsWith('-') ? ult.slice(1) : `-${ult}`
    } else if (k === '⌫') {
      if (feito) { t.length = 0 } else if (ult !== undefined) {
        const r = ehOp(ult) ? '' : ult.slice(0, -1)
        if (!r || r === '-') t.pop()
        else t[t.length - 1] = r
      }
    } else if (k === 'C') t.length = 0
    else if (k === '=') {
      const r = calcular(t)
      if (r === null || t.length < 3) return
      guardar([`${t.map((x) => (ehOp(x) ? ` ${x} ` : exibirNumero(x))).join('')} = ${exibirResultado(r)}`, ...historico].slice(0, 4))
      setToks(Number.isNaN(r) ? [] : [paraTexto(r)])
      setFeito(true)
      return
    }
    setFeito(false)
    setToks(t)
  }

  // teclado quando a calculadora está em foco; .nokey impede o Backspace de apagar o nó
  const tecla = (e: React.KeyboardEvent) => {
    const mapa: Record<string, string> = { '+': '+', '-': '−', '*': '×', x: '×', X: '×', '/': '÷', '%': '%', ',': ',', '.': ',', Enter: '=', '=': '=', Backspace: '⌫', Escape: 'C', Delete: 'C' }
    const k = /^\d$/.test(e.key) ? e.key : mapa[e.key]
    if (!k || e.ctrlKey || e.metaKey || e.altKey) return
    e.preventDefault()
    e.stopPropagation()
    apertar(k)
  }

  const conta = toks.map((x) => (ehOp(x) ? ` ${x} ` : exibirNumero(x))).join('')
  const previa = toks.some(ehOp) ? calcular(toks) : null
  // no visor fica o número que está sendo digitado (ou o último, logo depois de um operador)
  const visor = exibirNumero((ehOp(toks.at(-1)) ? toks.at(-2) : toks.at(-1)) ?? '0')
  return (
    <Casca id={id} w={d.w} selected={selected}>
      <div tabIndex={0} onKeyDown={tecla} onPointerDown={(e) => e.currentTarget.focus()}
        className="nokey grid h-full grid-rows-[auto_1fr] gap-2 p-2.5 outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <div className="grid min-w-0 gap-0.5 rounded-lg bg-muted/60 px-3 py-2 text-right">
          {historico.length > 0 && <p className="truncate font-mono text-[10px] text-muted-foreground/70" title={historico.join('\n')}>{historico[0]}</p>}
          <p className="truncate font-mono text-[11px] text-muted-foreground">{feito ? '' : conta || ' '}</p>
          <p className="truncate font-mono text-2xl font-medium tabular-nums">{visor}</p>
          <p className="h-4 truncate font-mono text-[11px] text-muted-foreground">{previa !== null && !feito ? `= ${exibirResultado(previa)}` : ''}</p>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {TECLAS.flat().map((k) => (
            <button key={k} onClick={() => apertar(k)}
              className={cn('rounded-md text-sm font-medium transition-colors active:scale-95',
                ehOp(k) || k === '%' ? 'bg-accent/70 hover:bg-accent' : k === 'C' || k === '⌫' || k === '±' ? 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground' : 'bg-muted/60 hover:bg-accent',
                k === '=' && 'text-black hover:opacity-90')}
              style={k === '=' ? { background: COR_WIDGET.calculadora } : undefined}>
              {k}
            </button>
          ))}
        </div>
      </div>
    </Casca>
  )
}

export const NoWidget = memo(function NoWidget({ id, data, selected }: NodeProps<Node<DadosNoWidget>>) {
  const props = { id, d: data, selected: !!selected }
  switch (data.w.tipo) {
    case 'validacoes': return <WValidacoes {...props} />
    case 'deploy': return <WDeploy {...props} />
    case 'producao': return <WProducao {...props} />
    case 'botoes': return <WBotoes {...props} />
    case 'cronometro': return <WCronometro {...props} />
    case 'calculadora': return <WCalculadora {...props} />
    default: return <div className="rounded-xl border bg-card p-3 text-xs"><X className="size-3" /> widget desconhecido</div>
  }
})
