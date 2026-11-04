import { Crown, GitBranch, ListChecks, Network, StickyNote, Terminal as IconeTerminal } from 'lucide-react'
import { STATUS } from '@/lib/formato'
import type { StatusTerminal, Terminal, TipoTerminal } from '@/lib/tipos'
import { LogoClaude, LogoCodex, type Icone } from './logos'

/** Uma cor por papel no canvas (a borda e a barra do nó); o status vai no ponto pequeno. */
export const COR = {
  lider: 'var(--ev-plano)',
  trabalhador: 'var(--ev-pedido)',
  claude: 'var(--claude)',
  codex: 'var(--codex)',
  shell: 'var(--ev-leitura)',
  git: 'var(--ev-comando)',
  sessao: 'var(--fechada)',
  subagente: 'var(--ev-subagente)',
  nota: 'var(--ev-web)',
  checklist: 'var(--ev-edicao)',
} as const

export const ROTULO_TIPO: Record<TipoTerminal, string> = { claude: 'Claude', codex: 'Codex', shell: 'PowerShell', git: 'Git' }

/** Nome do terminal: o que o usuário deu; senão o título da conversa do Claude nele; senão o tipo. */
export const nomeDoTerminal = (t: Pick<Terminal, 'titulo' | 'tipo'>, s?: { titulo: string | null } | null) =>
  t.titulo || s?.titulo || ROTULO_TIPO[t.tipo]

export const corDoTerminal = (t: Pick<Terminal, 'papel' | 'tipo'>) =>
  t.papel === 'lider' ? COR.lider : t.papel === 'trabalhador' ? COR.trabalhador : COR[t.tipo]

export const iconeDoTerminal = (t: Pick<Terminal, 'papel' | 'tipo'>): Icone =>
  t.papel === 'lider' ? Crown : t.tipo === 'git' ? GitBranch : t.tipo === 'shell' ? IconeTerminal : t.tipo === 'codex' ? LogoCodex : LogoClaude

export const LEGENDA: [string, string, Icone][] = [
  ['Líder', COR.lider, Crown],
  ['Trabalhador', COR.trabalhador, LogoClaude],
  ['Claude', COR.claude, LogoClaude],
  ['Codex', COR.codex, LogoCodex],
  ['PowerShell', COR.shell, IconeTerminal],
  ['Git', COR.git, GitBranch],
  ['Subagente', COR.subagente, Network],
  ['Nota', COR.nota, StickyNote],
  ['Checklist', COR.checklist, ListChecks],
]

export const ST: Record<StatusTerminal, { rotulo: string; cor: string }> = {
  trabalhando: { rotulo: 'trabalhando', cor: STATUS.trabalhando.cor },
  parada: { rotulo: 'parado', cor: STATUS.parada.cor },
  aguardando: { rotulo: 'pedindo permissão', cor: 'var(--ev-erro)' },
  encerrado: { rotulo: 'encerrado', cor: STATUS.fechada.cor },
}
