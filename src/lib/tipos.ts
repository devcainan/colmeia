export type Agente = 'claude' | 'codex'
export type Status = 'trabalhando' | 'parada' | 'fechada'

export interface Tokens {
  entrada: number
  saida: number
  cacheEscrita: number
  cacheLeitura: number
}

export interface Fazendo {
  tipo: string
  ferramenta: string
  texto: string
  t: number
}

export interface SubResumo {
  id: string
  titulo: string | null
  nome: string | null
  status: Status
  total: number
  custo: number
  modelo: string | null
  inicio?: number | null
  ultima?: number | null
  fazendo?: string | null
}

export interface Sessao {
  id: string
  agente: Agente
  papel: 'principal' | 'subagente'
  pai: string | null
  nome: string | null
  titulo: string | null
  projeto: string
  pasta: string | null
  branch: string | null
  modelo: string | null
  status: Status
  inicio: number | null
  ultima: number | null
  ultimoPedido: string | null
  fazendo: Fazendo | null
  tokens: Tokens
  total: number
  totalComSub: number
  custo: number
  custoComSub: number
  semPreco: number
  subagentes: SubResumo[]
  respostas: number
  erros: number
  ferramentasTop: [string, number][]
  nArquivos: number
  contexto: number
  janela: number
  custoHoje: number
  checklist: ItemChecklist[]
  faisca?: number[]
  pid: number | null
  versao: string | null
}

export interface ItemChecklist {
  id: string
  titulo: string
  status: 'pending' | 'in_progress' | 'completed' | string
  mudou: number | null
}

export interface Evento {
  t: number
  tipo: string
  texto: string
  ferramenta: string | null
}

export interface EventoFeed extends Evento {
  sessao: string
  agente: Agente
  sub: boolean
  rotulo: string
  projeto: string
}

export interface Retrato {
  geradoEm: number
  versao: number
  dias: number
  resumo: {
    abertas: number
    trabalhando: number
    subagentesAtivos: number
    tokensHoje: number
    tokensTotal: number
    ferramentasHora: number
    sessoesPeriodo: number
    custoHoje: number
    custoTotal: number
    semPreco: number
  }
  cotacao: { valor: number; em: number; fonte: string } | null
  precosFonte: string | null
  plano: { valorMensalReais: number; descricao?: string } | null
  limitesCodex: { usado: number; janelaMin: number; renovaEm: number | null; plano: string | null; em: number } | null
  porAgente: Record<Agente, { tokens: number; custo: number }>
  sessoes: Sessao[]
  feed: EventoFeed[]
  serieHoras: { hora: number; claude: number; codex: number; claudeUsd: number; codexUsd: number }[]
  porModelo: { modelo: string; total: number; custo: number; temPreco: boolean }[]
  porTipo: Tokens
  ferramentas: { nome: string; qtd: number }[]
  canvas?: EstadoCanvas
  planoClaude?: PlanoClaude | null
}

/** Os mesmos limites do /usage do Claude Code. */
export interface PlanoClaude {
  limites: { nome: string; pct: number; renova: number | null }[]
  pedidos24h?: number | null
  sessoes24h?: number | null
  erro?: string
  em: number
}

export type TipoTerminal = 'claude' | 'codex' | 'shell' | 'git'
export type StatusTerminal = 'trabalhando' | 'parada' | 'aguardando' | 'encerrado'

export interface Terminal {
  id: string
  tipo: TipoTerminal
  titulo: string | null
  cwd: string
  papel: 'lider' | 'trabalhador' | null
  pai: string | null
  criadoEm: number
  chat: number
  sessao: string | null
  vivo: boolean
  codigo: number | null
  status: StatusTerminal
  contexto: number
  avisos: number
  handoff: string | null
  pid: number | null
  modo: string
  paiSessao: string | null
}

export interface Posicao { x: number; y: number; w?: number; h?: number }

export type EstadoItem = 'pendente' | 'andamento' | 'feito'

export interface Bloco {
  id: string
  tipo: 'nota' | 'checklist'
  titulo: string
  texto: string
  itens: { id: number; texto: string; estado: EstadoItem; mudou: number; por: 'usuario' | 'agente' }[]
  /** abas da nota (como no Bloco de Notas do Windows 11); a primeira espelha texto */
  abas?: AbaNota[]
  /** fundo escolhido no botão direito; sem ele vale a cor do tipo */
  cor?: string
  criadoEm: number
}

export interface AbaNota { id: string; titulo: string; texto: string }

export interface Ligacao { id: string; de: string; para: string }

export type TipoForma = 'frame' | 'retangulo' | 'texto' | 'imagem' | 'desenho' | 'video'

/** Forma do quadro, como no Figma. O desenho do lápis guarda os pontos em 0..1 dentro da caixa dele. */
export interface Forma {
  id: string
  tipo: TipoForma
  cor: string
  texto: string
  tamanho?: number
  espessura?: number
  pontos?: [number, number][]
  url?: string
  /** tom do fundo do frame, em % da cor sobre o fundo do canvas (padrão 12; 0 = sem fundo) */
  opacidade?: number
  criadoEm: number
}

export interface EstadoGit {
  erro?: string
  branch?: string
  remoto?: string | null
  frente?: number
  atras?: number
  alterados?: { st: string; arq: string }[]
  totalAlterados?: number
  commits?: { h: string; msg: string; quando: string; autor: string }[]
  em: number
}

export interface EstadoCanvas {
  terminais: Terminal[]
  posicoes: Record<string, Posicao>
  handoff: { ligado: boolean; limite: number }
  blocos: Bloco[]
  ligacoes: Ligacao[]
  formas?: Forma[]
  git: Record<string, EstadoGit>
  widgets?: Widget[]
  widgetsDados?: Record<string, DadosWidget>
}

export type TipoWidget = 'validacoes' | 'deploy' | 'producao' | 'botoes' | 'cronometro' | 'calculadora'

export interface Widget {
  id: string
  tipo: TipoWidget
  titulo: string
  criadoEm: number
  config: {
    repo?: string
    workflow?: string
    quantos?: number
    url?: string
    intervalo?: number
    botoes?: { rotulo: string; texto: string }[]
    acumulado?: number
    inicio?: number | null
    auto?: boolean
  }
}

export interface ExecucaoDeploy {
  id: number
  numero: number
  nome: string
  titulo: string
  branch: string
  evento: string
  status: string
  conclusao: string | null
  inicio: string
  fim: string
  url: string
  autor: string | null
}

export interface DadosWidget {
  erro?: string
  em: number
  runs?: ExecucaoDeploy[]
  ok?: boolean
  status?: number
  ms?: number
  versao?: string | null
  historico?: { ok: boolean; ms: number; em: number }[]
  desde?: number
}

export interface Detalhe extends Sessao {
  eventos: Evento[]
  arquivos: { arq: string; n: number }[]
  ferramentas: [string, number][]
  porModelo: Record<string, number>
  custoPorModelo: Record<string, number>
}
