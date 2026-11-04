import {
  Bot, CircleAlert, CircleCheck, FilePen, FileText, Globe, ListTodo, MessageSquare,
  Network, Play, Plug, Search, Sparkles, SquareTerminal, TriangleAlert, Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { Agente, Status, Tokens } from './tipos'

export const AGENTES: Record<Agente, { rotulo: string; cor: string }> = {
  claude: { rotulo: 'Claude', cor: 'var(--claude)' },
  codex: { rotulo: 'Codex', cor: 'var(--codex)' },
}

export const STATUS: Record<Status, { rotulo: string; cor: string }> = {
  trabalhando: { rotulo: 'Trabalhando', cor: 'var(--ok)' },
  parada: { rotulo: 'Parada', cor: 'var(--espera)' },
  fechada: { rotulo: 'Fechada', cor: 'var(--fechada)' },
}

export const TIPOS_TOKEN: { chave: keyof Tokens; rotulo: string; cor: string }[] = [
  { chave: 'entrada', rotulo: 'Entrada', cor: 'var(--tk-entrada)' },
  { chave: 'saida', rotulo: 'Saída', cor: 'var(--tk-saida)' },
  { chave: 'cacheEscrita', rotulo: 'Cache gravado', cor: 'var(--tk-escrita)' },
  { chave: 'cacheLeitura', rotulo: 'Cache lido', cor: 'var(--tk-leitura)' },
]

export const EVENTOS: Record<string, { rotulo: string; cor: string; Icone: LucideIcon }> = {
  pedido: { rotulo: 'Pedido', cor: 'var(--ev-pedido)', Icone: MessageSquare },
  resposta: { rotulo: 'Resposta', cor: 'var(--ev-resposta)', Icone: Bot },
  edicao: { rotulo: 'Edição', cor: 'var(--ev-edicao)', Icone: FilePen },
  comando: { rotulo: 'Comando', cor: 'var(--ev-comando)', Icone: SquareTerminal },
  leitura: { rotulo: 'Leitura', cor: 'var(--ev-leitura)', Icone: FileText },
  busca: { rotulo: 'Busca', cor: 'var(--ev-leitura)', Icone: Search },
  subagente: { rotulo: 'Subagente', cor: 'var(--ev-subagente)', Icone: Network },
  web: { rotulo: 'Web', cor: 'var(--ev-web)', Icone: Globe },
  mcp: { rotulo: 'MCP', cor: 'var(--ev-web)', Icone: Plug },
  skill: { rotulo: 'Skill', cor: 'var(--ev-web)', Icone: Sparkles },
  plano: { rotulo: 'Plano', cor: 'var(--ev-plano)', Icone: ListTodo },
  ferramenta: { rotulo: 'Ferramenta', cor: 'var(--ev-leitura)', Icone: Wrench },
  erro: { rotulo: 'Erro', cor: 'var(--ev-erro)', Icone: CircleAlert },
  aviso: { rotulo: 'Aviso', cor: 'var(--ev-aviso)', Icone: TriangleAlert },
  inicio: { rotulo: 'Início', cor: 'var(--ev-fim)', Icone: Play },
  fim: { rotulo: 'Concluída', cor: 'var(--ev-fim)', Icone: CircleCheck },
}

export const evento = (tipo: string) => EVENTOS[tipo] || EVENTOS.ferramenta

// checklist: a ordem também é a ordem das cores na tela
export const TAREFA: Record<string, { rotulo: string; cor: string; ordem: number }> = {
  validar: { rotulo: 'Aguarda validação', cor: 'var(--espera)', ordem: 0 },
  in_progress: { rotulo: 'Em andamento', cor: 'var(--tk-entrada)', ordem: 1 },
  pending: { rotulo: 'Pendente', cor: 'var(--fechada)', ordem: 2 },
  completed: { rotulo: 'Concluída', cor: 'var(--ok)', ordem: 3 },
}
// "[validar]" no título (regra geral do CLAUDE.md) vira o status de validação enquanto não termina
export const statusDaTarefa = (x: { titulo: string; status: string }) =>
  x.status !== 'completed' && /^\s*\[validar\]/i.test(x.titulo) ? 'validar' : x.status
export const tarefa = (status: string) => TAREFA[status] || TAREFA.pending

export const corContexto = (pct: number) => (pct >= 80 ? 'var(--ev-erro)' : pct >= 50 ? 'var(--espera)' : 'var(--ok)')

export const fmtPct = (v: number) => `${v < 1 && v > 0 ? v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : Math.round(v)}%`

export function tipoDaFerramenta(n: string) {
  if (/^(Edit|Write|MultiEdit|NotebookEdit|apply_patch)$/.test(n)) return 'edicao'
  if (n === 'Read') return 'leitura'
  if (/^(Grep|Glob)$/.test(n)) return 'busca'
  if (/^(Bash|PowerShell|exec_command|shell|exec)$/.test(n)) return 'comando'
  if (/^(Agent|Task|spawn_agent)$/.test(n)) return 'subagente'
  if (n.startsWith('Web')) return 'web'
  if (n.startsWith('mcp__')) return 'mcp'
  if (n === 'Skill') return 'skill'
  if (/Todo|Task(Create|Update)|Plan/.test(n)) return 'plano'
  return 'ferramenta'
}

export const mistura = (cor: string, pct: number) => `color-mix(in oklch, ${cor} ${pct}%, transparent)`
/** Igual a mistura, mas sobre uma base sólida: o fundo fica opaco e tingido da cor. */
// oklab, não oklch: o branco tem matiz 0 e puxava o azul e o verde para o rosa
export const opaco = (cor: string, pct: number, base = 'var(--card)') => `color-mix(in oklab, ${cor} ${pct}%, ${base})`

const nf = (n: number, casas: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 })

export function fmtTokens(n: number) {
  if (!n) return '0'
  if (n >= 1e9) return `${nf(n / 1e9, 2)} bi`
  if (n >= 1e6) return `${nf(n / 1e6, n >= 1e8 ? 0 : 1)} mi`
  if (n >= 1e3) return `${nf(n / 1e3, n >= 1e5 ? 0 : 1)} mil`
  return nf(n, 0)
}

export const fmtInteiro = (n: number) => nf(Math.round(n), 0)

// cotação do dólar vinda do servidor (AwesomeAPI); sem ela, mostra em US$
let cotacaoAtual: number | null = null
export function definirCotacao(v: number | null | undefined) { cotacaoAtual = v || null }
export const temCotacao = () => cotacaoAtual != null

export function fmtReais(usd: number | null | undefined) {
  const v = usd || 0
  if (cotacaoAtual == null) return `US$ ${nf(v, v >= 100 ? 0 : 2)}`
  const brl = v * cotacaoAtual
  return `R$ ${brl.toLocaleString('pt-BR', brl >= 1000 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function haQuanto(t: number | null | undefined, agora = Date.now()) {
  if (!t) return '-'
  const s = Math.max(0, Math.round((agora - t) / 1000))
  if (s < 5) return 'agora'
  if (s < 60) return `há ${s} s`
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  return new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function duracao(ms: number) {
  if (!ms || ms < 0) return '-'
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} h ${min % 60} min`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}

export function dataHora(t: number | null) {
  if (!t) return '-'
  return new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function nomeModelo(m: string | null) {
  if (!m) return '-'
  return m.replace(/^claude-/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/^gpt-/, 'GPT-')
}

export const corDoModelo = (m: string) => (/^gpt|^o\d|codex/i.test(m) ? 'var(--codex)' : 'var(--claude)')
