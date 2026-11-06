// Lê as conversas do Claude Code e do Codex desta máquina e mantém um resumo
// em memória. Só leitura: nada é gravado nas pastas dos agentes.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { fileURLToPath } from 'node:url'

const HOME = os.homedir()
const DIR_CLAUDE = path.join(HOME, '.claude')
const DIR_CODEX = path.join(HOME, '.codex')
const DIAS = Number(process.env.PAINEL_DIAS || 30)
const MAX_EVENTOS = 150
const BALDE = 5 * 60 * 1000
const BLOCO = 4 * 1024 * 1024
const HORA = 60 * 60 * 1000

const arquivos = new Map() // caminho -> estado de leitura
const sessoes = new Map() // id -> sessao
let abertasClaude = new Map() // sessionId -> dados de ~/.claude/sessions/<pid>.json
let codexAbertos = 0 // processos do Codex interativo vivos
let versao = 0
const ouvintes = new Set()

// ---------- utilidades ----------

const limite = () => Date.now() - DIAS * 24 * HORA

function curto(txt, n = 140) {
  if (!txt) return ''
  const s = String(txt).replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function caminhoCurto(s, arq) {
  if (!arq) return ''
  const a = String(arq).replace(/\\/g, '/')
  const base = (s.pasta || '').replace(/\\/g, '/')
  if (base && a.toLowerCase().startsWith(base.toLowerCase() + '/')) return a.slice(base.length + 1)
  return a.split('/').slice(-2).join('/')
}

function novaSessao(id, agente) {
  return {
    id, agente, papel: 'principal', pai: null, nome: null, titulo: null,
    pasta: null, branch: null, modelo: null, inicio: null, ultima: null,
    ultimoPedido: null, fazendo: null, finalizado: false, ciclo: null,
    tokens: { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0 },
    porModelo: {}, ferramentas: {}, arquivos: {}, eventos: [], baldes: new Map(),
    respostas: 0, erros: 0, mtime: 0, _uso: new Map(),
    contexto: 0, janela: 0, tarefas: new Map(), _criando: new Map(),
    custo: 0, custoPorModelo: {}, semPreco: 0,
  }
}

function sessao(id, agente) {
  let s = sessoes.get(id)
  if (!s) { s = novaSessao(id, agente); sessoes.set(id, s) }
  return s
}

function balde(s, t) {
  const k = Math.floor(t / BALDE) * BALDE
  let b = s.baldes.get(k)
  if (!b) { b = { tk: 0, ev: 0, fe: 0, usd: 0 }; s.baldes.set(k, b) }
  return b
}

function marcarTempo(s, t) {
  if (!t || Number.isNaN(t)) return
  if (!s.inicio || t < s.inicio) s.inicio = t
  if (!s.ultima || t > s.ultima) s.ultima = t
}

function evento(s, t, tipo, texto, ferramenta) {
  if (!t || Number.isNaN(t)) return
  s.eventos.push({ t, tipo, texto: curto(texto), ferramenta: ferramenta || null })
  if (s.eventos.length > MAX_EVENTOS) s.eventos.shift()
  const b = balde(s, t)
  b.ev++
  if (ferramenta) b.fe++
  if (tipo === 'erro') s.erros++
}

function somarTokens(s, t, modelo, d, usd) {
  const tot = d.entrada + d.saida + d.cacheEscrita + d.cacheLeitura
  if (tot <= 0) return
  s.tokens.entrada += d.entrada
  s.tokens.saida += d.saida
  s.tokens.cacheEscrita += d.cacheEscrita
  s.tokens.cacheLeitura += d.cacheLeitura
  if (modelo) s.porModelo[modelo] = (s.porModelo[modelo] || 0) + tot
  if (usd == null) s.semPreco += tot
  else {
    s.custo += usd
    if (modelo) s.custoPorModelo[modelo] = (s.custoPorModelo[modelo] || 0) + usd
  }
  if (t && !Number.isNaN(t)) {
    const b = balde(s, t)
    b.tk += tot
    if (usd) b.usd += usd
  }
}

// ---------- preços e cotação ----------

const DIR_SERVIDOR = path.dirname(fileURLToPath(import.meta.url))
const ARQ_PRECOS = path.join(DIR_SERVIDOR, 'precos.json')
const ARQ_COTACAO = path.join(DIR_SERVIDOR, '..', '.cotacao')
let precos = { modelos: {} }
let mtimePrecos = 0
const cachePreco = new Map()
let cotacao = null
try { cotacao = JSON.parse(fs.readFileSync(ARQ_COTACAO, 'utf8')) } catch { /* ainda sem cotação */ }

// preço mudou: relê tudo para o custo antigo não ficar com a tabela velha
function lerPrecos() {
  let mt
  try { mt = fs.statSync(ARQ_PRECOS).mtimeMs } catch { return }
  if (mt === mtimePrecos) return
  try { precos = JSON.parse(fs.readFileSync(ARQ_PRECOS, 'utf8')) } catch { return }
  mtimePrecos = mt
  cachePreco.clear()
  arquivos.clear()
  sessoes.clear()
}

function precoDe(modelo) {
  if (!modelo) return null
  if (cachePreco.has(modelo)) return cachePreco.get(modelo)
  const t = precos.modelos || {}
  let p = t[modelo] || t[modelo.replace(/-\d{8}$/, '')]
  if (!p) {
    const k = Object.keys(t).filter((x) => modelo.startsWith(x)).sort((a, b) => b.length - a.length)[0]
    p = k ? t[k] : null
  }
  cachePreco.set(modelo, p || null)
  return p || null
}

function custoClaude(modelo, d, cheio, u) {
  let p = precoDe(modelo)
  if (!p) return null
  if (p.acima100k && cheio.entrada + cheio.cacheEscrita + cheio.cacheLeitura > 100000) p = p.acima100k
  let mult = 1
  if (u.speed === 'fast') mult *= precos.multiplicadores?.rapido ?? 2
  if (u.inference_geo === 'us') mult *= precos.multiplicadores?.soEua ?? 1.1
  const c1h = Math.min(d.c1h, d.cacheEscrita)
  const c5m = d.cacheEscrita - c1h
  return (mult * (d.entrada * p.entrada + d.saida * p.saida + c5m * (p.cache5m ?? p.entrada) +
    c1h * (p.cache1h ?? p.entrada) + d.cacheLeitura * (p.cacheLeitura ?? p.entrada))) / 1e6
}

function custoCodex(modelo, d) {
  const p = precoDe(modelo)
  if (!p) return null
  return (d.entrada * p.entrada + d.saida * p.saida + d.cacheEscrita * (p.cache5m ?? p.entrada) +
    d.cacheLeitura * (p.cacheLeitura ?? p.entrada)) / 1e6
}

async function atualizarCotacao() {
  const fixa = Number(process.env.PAINEL_DOLAR)
  if (fixa > 0) { cotacao = { valor: fixa, em: Date.now(), fonte: 'PAINEL_DOLAR' }; return }
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', { signal: AbortSignal.timeout(8000) })
    const j = (await r.json())?.USDBRL
    const v = Number(j?.bid)
    if (v > 0) {
      cotacao = { valor: v, em: Number(j.timestamp) * 1000 || Date.now(), fonte: 'AwesomeAPI (USD-BRL)' }
      fs.writeFileSync(ARQ_COTACAO, JSON.stringify(cotacao))
      versao++
      avisar()
    }
  } catch { /* sem rede: fica a última cotação salva */ }
}

function pedido(s, t, texto) {
  if (!texto) return
  const cmd = /<command-name>\s*([^<]+)<\/command-name>/.exec(texto)
  let limpo = cmd ? cmd[1].trim() : texto
  if (!cmd && /^\s*</.test(limpo)) return // lembretes e saídas internas
  if (/^\[Request interrupted/.test(limpo)) return evento(s, t, 'aviso', 'interrompido pelo usuário')
  limpo = curto(limpo, 220)
  s.ultimoPedido = limpo
  evento(s, t, 'pedido', limpo)
}

function classificar(s, nome, input = {}) {
  const arq = input.file_path || input.notebook_path || input.path
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'apply_patch'].includes(nome)) {
    if (arq) s.arquivos[arq] = (s.arquivos[arq] || 0) + 1
    return ['edicao', caminhoCurto(s, arq) || nome]
  }
  if (nome === 'Read') return ['leitura', caminhoCurto(s, arq)]
  if (nome === 'Grep' || nome === 'Glob') return ['busca', input.pattern]
  if (nome === 'Bash' || nome === 'PowerShell' || nome === 'exec_command' || nome === 'shell')
    return ['comando', input.description || input.command || input.cmd]
  if (nome === 'Agent' || nome === 'Task' || nome === 'spawn_agent')
    return ['subagente', input.description || input.task_name]
  if (nome.startsWith('Web')) return ['web', input.query || input.url]
  if (nome.startsWith('mcp__')) return ['mcp', nome.split('__').slice(1).join(' · ')]
  if (nome === 'Skill') return ['skill', input.skill]
  if (/Todo|Task(Create|Update)|Plan/.test(nome)) return ['plano', nome]
  return ['ferramenta', nome]
}

// checklist da sessão: TaskCreate/TaskUpdate (Claude atual), TodoWrite (Claude antigo)
function checklistClaude(s, t, b) {
  const i = b.input || {}
  if (b.name === 'TaskCreate' && i.subject) s._criando.set(b.id, i)
  else if (b.name === 'TaskUpdate' && i.taskId != null) {
    const x = s.tarefas.get(String(i.taskId))
    if (!x) return
    if (i.status === 'deleted') s.tarefas.delete(String(i.taskId))
    else {
      if (i.status) x.status = i.status
      if (i.subject) x.titulo = curto(i.subject, 160)
      x.mudou = t
    }
  } else if (b.name === 'TodoWrite' && Array.isArray(i.todos)) {
    s.tarefas = new Map(i.todos.map((td, k) => [String(k + 1), { id: String(k + 1), titulo: curto(td.content, 160), status: td.status || 'pending', t, mudou: t }]))
  }
}

// checklist do Codex: update_plan manda o plano inteiro a cada mudança
function checklistCodex(s, t, args) {
  if (!Array.isArray(args?.plan)) return
  s.tarefas = new Map(args.plan.map((p, k) => [String(k + 1), { id: String(k + 1), titulo: curto(p.step, 160), status: p.status || 'pending', t, mudou: t }]))
}

function ferramenta(s, t, nome, input) {
  s.ferramentas[nome] = (s.ferramentas[nome] || 0) + 1
  const [tipo, texto] = classificar(s, nome, input || {})
  evento(s, t, tipo, texto || nome, nome)
  s.fazendo = { tipo, ferramenta: nome, texto: curto(texto || nome, 90), t }
}

// ---------- leitura incremental ----------

function lerNovo(caminho, st, porLinha) {
  let tam
  try { tam = fs.statSync(caminho).size } catch { return false }
  if (tam < st.offset) return 'truncado'
  if (tam === st.offset) return false
  const fd = fs.openSync(caminho, 'r')
  try {
    const buf = Buffer.allocUnsafe(Math.min(BLOCO, tam - st.offset))
    while (st.offset < tam) {
      const n = fs.readSync(fd, buf, 0, Math.min(buf.length, tam - st.offset), st.offset)
      if (n <= 0) break
      st.offset += n
      const linhas = (st.resto + st.dec.write(buf.subarray(0, n))).split('\n')
      st.resto = linhas.pop()
      for (const l of linhas) {
        if (!l) continue
        let o
        try { o = JSON.parse(l) } catch { continue }
        try { porLinha(o) } catch { /* linha com formato inesperado */ }
      }
    }
  } finally { fs.closeSync(fd) }
  return true
}

function acompanhar(caminho, criar, porLinha) {
  let st = arquivos.get(caminho)
  if (!st) {
    st = { offset: 0, resto: '', dec: new StringDecoder('utf8') }
    criar(st)
    arquivos.set(caminho, st)
  }
  const r = lerNovo(caminho, st, (o) => porLinha(st, o))
  if (r === 'truncado') {
    if (st.sessaoId) sessoes.delete(st.sessaoId)
    arquivos.delete(caminho)
    return acompanhar(caminho, criar, porLinha)
  }
  return r
}

// ---------- Claude Code ----------

function linhaClaude(s, o) {
  const t = o.timestamp ? Date.parse(o.timestamp) : null
  marcarTempo(s, t)
  if (o.cwd && !s.pasta) s.pasta = o.cwd
  if (o.gitBranch) s.branch = o.gitBranch
  switch (o.type) {
    case 'ai-title': if (o.aiTitle) s.titulo = o.aiTitle; break
    case 'custom-title': if (o.customTitle) s.titulo = o.customTitle; break
    case 'summary': if (o.summary && !s.titulo) s.titulo = o.summary; break
    case 'last-prompt': if (o.lastPrompt && !/^\s*</.test(o.lastPrompt)) s.ultimoPedido = curto(o.lastPrompt, 220); break
    case 'continued-in': if (o.continuedInSessionId) s.continuouEm = o.continuedInSessionId; break
    case 'system':
      if (o.subtype === 'compact_boundary') evento(s, t, 'aviso', 'contexto compactado')
      else if (o.level === 'error' || o.subtype === 'api_error') evento(s, t, 'erro', o.content || 'erro da API')
      break
    case 'assistant': {
      const m = o.message
      if (!m) break
      if (m.model && m.model !== '<synthetic>') s.modelo = m.model
      const id = m.id || o.requestId
      if (m.usage && id) {
        // a mesma resposta vem em várias linhas: soma só o que cresceu
        const u = m.usage
        const novo = {
          entrada: u.input_tokens || 0, saida: u.output_tokens || 0,
          cacheEscrita: u.cache_creation_input_tokens || 0, cacheLeitura: u.cache_read_input_tokens || 0,
          c1h: u.cache_creation?.ephemeral_1h_input_tokens || 0,
        }
        const velho = s._uso.get(id)
        if (!velho) s.respostas++
        const d = {}
        for (const k in novo) d[k] = Math.max(0, novo[k] - (velho?.[k] || 0))
        s._uso.set(id, velho ? Object.fromEntries(Object.keys(novo).map((k) => [k, Math.max(novo[k], velho[k])])) : novo)
        // tamanho do contexto = tudo que entrou na última resposta
        if (t && t >= (s._tContexto || 0)) { s._tContexto = t; s.contexto = novo.entrada + novo.cacheEscrita + novo.cacheLeitura }
        const tk = { entrada: d.entrada, saida: d.saida, cacheEscrita: d.cacheEscrita, cacheLeitura: d.cacheLeitura }
        somarTokens(s, t, s.modelo, tk, custoClaude(s.modelo, d, novo, u))
      }
      for (const b of m.content || []) {
        if (b.type === 'tool_use') ferramenta(s, t, b.name, b.input)
        else if (b.type === 'text' && b.text?.trim()) evento(s, t, 'resposta', b.text)
        if (b.type === 'tool_use') checklistClaude(s, t, b)
      }
      break
    }
    case 'user': {
      if (o.isMeta || o.isCompactSummary || o.isVisibleInTranscriptOnly) break
      const c = o.message?.content
      if (typeof c === 'string') pedido(s, t, c)
      else if (Array.isArray(c)) {
        for (const b of c) {
          if (b.type === 'text') pedido(s, t, b.text)
          else if (b.type === 'tool_result') {
            const txt = typeof b.content === 'string' ? b.content : (b.content || []).map((x) => x.text || '').join(' ')
            if (b.is_error) evento(s, t, 'erro', txt || 'ferramenta falhou')
            const criando = s._criando.get(b.tool_use_id)
            if (criando) {
              s._criando.delete(b.tool_use_id)
              const n = /Task #(\d+)/.exec(txt)?.[1]
              if (n) s.tarefas.set(n, { id: n, titulo: curto(criando.subject, 160), status: 'pending', t, mudou: t })
            }
          }
        }
      }
      break
    }
  }
}

function lerJsonSeguro(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null }
}

function varrerClaude() {
  let mudou = false
  const dirProj = path.join(DIR_CLAUDE, 'projects')
  let projetos = []
  // a pasta onde o painel roda o /usage não é sessão de ninguém
  try { projetos = fs.readdirSync(dirProj, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.endsWith('-painel-agentes-uso')) } catch { return false }
  const min = limite()
  for (const p of projetos) {
    const base = path.join(dirProj, p.name)
    let itens = []
    try { itens = fs.readdirSync(base, { withFileTypes: true }) } catch { continue }
    for (const it of itens) {
      if (it.isFile() && it.name.endsWith('.jsonl')) {
        const arq = path.join(base, it.name)
        let mt
        try { mt = fs.statSync(arq).mtimeMs } catch { continue }
        const id = it.name.slice(0, -6)
        if (mt < min && !abertasClaude.has(id)) continue
        const r = acompanhar(arq, (st) => { st.sessaoId = id }, (st, o) => linhaClaude(sessao(id, 'claude'), o))
        const s = sessoes.get(id)
        if (s) s.mtime = mt
        if (r) mudou = true
      } else if (it.isDirectory()) {
        const dirSub = path.join(base, it.name, 'subagents')
        let subs = []
        try { subs = fs.readdirSync(dirSub).filter((f) => f.endsWith('.jsonl')) } catch { continue }
        for (const f of subs) {
          const arq = path.join(dirSub, f)
          let mt
          try { mt = fs.statSync(arq).mtimeMs } catch { continue }
          if (mt < min) continue
          const id = `${it.name}:${f.slice(0, -6)}`
          const r = acompanhar(arq, (st) => { st.sessaoId = id }, (st, o) => {
            const s = sessao(id, 'claude')
            s.papel = 'subagente'
            s.pai = it.name
            linhaClaude(s, o)
          })
          const s = sessoes.get(id)
          if (s) {
            s.mtime = mt
            if (!s.finalizado) {
              const meta = lerJsonSeguro(arq.replace(/\.jsonl$/, '.meta.json'))
              if (meta) {
                s.titulo = meta.description || s.titulo
                s.nome = meta.agentType || s.nome
                s.finalizado = !!meta.finished
              }
            }
          }
          if (r) mudou = true
        }
      }
    }
  }
  return mudou
}

function lerAbertasClaude() {
  const m = new Map()
  const dir = path.join(DIR_CLAUDE, 'sessions')
  let fs_ = []
  try { fs_ = fs.readdirSync(dir).filter((f) => f.endsWith('.json')) } catch { /* sem pasta */ }
  for (const f of fs_) {
    const j = lerJsonSeguro(path.join(dir, f))
    if (!j?.sessionId || !j.pid) continue
    let vivo = false
    try { process.kill(j.pid, 0); vivo = true } catch (e) { vivo = e.code === 'EPERM' }
    if (vivo) m.set(j.sessionId, j)
  }
  const mudou = [...m.keys()].join() !== [...abertasClaude.keys()].join() ||
    [...m.values()].some((j) => abertasClaude.get(j.sessionId)?.status !== j.status)
  abertasClaude = m
  return mudou
}

// ---------- Codex ----------

let nomesCodex = new Map()
let limitesCodex = null // último rate_limits visto: quanto do limite do plano já foi usado
let mtimeIndice = 0

function lerNomesCodex() {
  const arq = path.join(DIR_CODEX, 'session_index.jsonl')
  let mt
  try { mt = fs.statSync(arq).mtimeMs } catch { return }
  if (mt === mtimeIndice) return
  mtimeIndice = mt
  const m = new Map()
  for (const l of fs.readFileSync(arq, 'utf8').split('\n')) {
    try { const o = JSON.parse(l); if (o.id && o.thread_name) m.set(o.id, o.thread_name) } catch { /* linha parcial */ }
  }
  nomesCodex = m
}

function textoDe(content) {
  if (typeof content === 'string') return content
  return (content || []).map((c) => c.text || '').join(' ')
}

function linhaCodex(st, o) {
  const p = o.payload || {}
  const t = o.timestamp ? Date.parse(o.timestamp) : null
  if (o.type === 'session_meta') {
    if (st.meta) return
    st.meta = p
    st.sessaoId = p.id
    const s = sessao(p.id, 'codex')
    s.pasta = p.cwd || s.pasta
    if (p.id !== p.session_id || p.parent_thread_id) {
      s.papel = 'subagente'
      s.pai = p.parent_thread_id || p.forked_from_id || p.session_id
      s.nome = p.agent_nickname || p.agent_role || null
    }
    // fork começa com o histórico do pai copiado: ignora até a thread própria começar
    st.ativo = !p.forked_from_id
    marcarTempo(s, t)
    return
  }
  if (!st.meta) return
  const s = sessoes.get(st.meta.id)
  if (!st.ativo) {
    if (o.type === 'event_msg' && p.type === 'thread_settings_applied' && p.thread_id === st.meta.id) st.ativo = true
    else return
  }
  marcarTempo(s, t)
  if (o.type === 'turn_context') {
    if (p.model) s.modelo = p.model
    if (p.cwd) s.pasta = p.cwd
    return
  }
  if (o.type === 'event_msg') {
    switch (p.type) {
      case 'thread_settings_applied': if (p.thread_settings?.model) s.modelo = p.thread_settings.model; break
      case 'token_count': {
        const lim = p.rate_limits?.primary
        if (lim && t && (!limitesCodex || t >= limitesCodex.em)) {
          limitesCodex = { usado: lim.used_percent, janelaMin: lim.window_minutes, renovaEm: lim.resets_at ? lim.resets_at * 1000 : null, plano: p.rate_limits.plan_type || null, em: t }
        }
        const u = p.info?.total_token_usage
        if (!u) break
        const atual = {
          entrada: Math.max(0, (u.input_tokens || 0) - (u.cached_input_tokens || 0)),
          saida: u.output_tokens || 0,
          cacheEscrita: u.cache_write_input_tokens || 0,
          cacheLeitura: u.cached_input_tokens || 0,
        }
        const ant = st.total || { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0 }
        const d = {}
        for (const k in atual) d[k] = Math.max(0, atual[k] - ant[k])
        st.total = atual
        somarTokens(s, t, s.modelo, d, custoCodex(s.modelo, d))
        const ult = p.info?.last_token_usage
        if (ult) s.contexto = ult.input_tokens || 0
        if (p.info?.model_context_window) s.janela = p.info.model_context_window
        break
      }
      case 'task_started': s.ciclo = 'rodando'; evento(s, t, 'inicio', 'tarefa iniciada'); break
      case 'task_complete':
        s.ciclo = 'fim'
        evento(s, t, 'fim', p.last_agent_message || 'tarefa concluída')
        break
      case 'turn_aborted': s.ciclo = 'fim'; evento(s, t, 'aviso', 'tarefa interrompida'); break
      case 'user_message': pedido(s, t, p.message); break
      case 'error': evento(s, t, 'erro', p.message || 'erro'); break
    }
    return
  }
  if (o.type === 'token_usage_record') { s.respostas++; return }
  if (o.type === 'compacted') { evento(s, t, 'aviso', 'contexto compactado'); return }
  if (o.type !== 'response_item') return
  switch (p.type) {
    case 'message':
      if (p.role === 'user') pedido(s, t, textoDe(p.content))
      else if (p.role === 'assistant') {
        const tx = textoDe(p.content)
        if (tx.trim()) evento(s, t, 'resposta', tx)
      }
      break
    case 'function_call': {
      if (p.name === 'wait') break
      let args = {}
      try { args = JSON.parse(p.arguments || '{}') } catch { /* argumento cifrado */ }
      if (p.name === 'update_plan') checklistCodex(s, t, args)
      ferramenta(s, t, p.name, args)
      break
    }
    case 'custom_tool_call': {
      const inp = String(p.input || '')
      if (p.name === 'apply_patch' || /\*\*\* (Update|Add|Delete) File: /.test(inp)) {
        const arqs = [...inp.matchAll(/\*\*\* (?:Update|Add|Delete) File: (.+)/g)].map((x) => x[1].trim())
        for (const a of arqs.length ? arqs : [null]) ferramenta(s, t, 'apply_patch', { file_path: a })
        break
      }
      const cmd = /cmd:\s*(["'`])((?:\\.|(?!\1)[^\\]){1,300})\1/.exec(inp)
      if (cmd) ferramenta(s, t, 'exec_command', { cmd: cmd[2].replace(/\\(.)/g, '$1') })
      else ferramenta(s, t, /tools\.(\w+)/.exec(inp)?.[1] || p.name || 'exec', {})
      break
    }
    case 'agent_message':
      evento(s, t, 'subagente', `mensagem ${p.author || ''} → ${p.recipient || ''}`)
      break
  }
}

function varrerCodex() {
  lerNomesCodex()
  let mudou = false
  const raiz = path.join(DIR_CODEX, 'sessions')
  const min = limite()
  const dias = []
  try {
    for (const a of fs.readdirSync(raiz)) for (const m of fs.readdirSync(path.join(raiz, a)))
      for (const d of fs.readdirSync(path.join(raiz, a, m))) {
        const data = Date.parse(`${a}-${m}-${d}T23:59:59`)
        if (data >= min) dias.push(path.join(raiz, a, m, d))
      }
  } catch { /* sem Codex */ }
  for (const dir of dias) {
    let fs_ = []
    try { fs_ = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')) } catch { continue }
    for (const f of fs_) {
      const arq = path.join(dir, f)
      const r = acompanhar(arq, () => {}, linhaCodex)
      const st = arquivos.get(arq)
      const s = st?.sessaoId && sessoes.get(st.sessaoId)
      if (s) {
        try { s.mtime = Math.max(s.mtime, fs.statSync(arq).mtimeMs) } catch { /* sumiu */ }
        if (s.papel === 'principal') s.titulo = nomesCodex.get(s.id) || s.titulo
      }
      if (r) mudou = true
    }
  }
  return mudou
}

// Conta só o Codex interativo: o app-server continua rodando depois que a sessão é fechada
function conferirProcessoCodex() {
  const cmd = "Get-CimInstance Win32_Process -Filter \"Name='codex.exe'\" | ForEach-Object { $_.CommandLine }"
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 20000 }, (err, out) => {
    if (err) return
    const n = (out || '').split(/\r?\n/).filter((l) => l.trim() && !/app-server/i.test(l)).length
    if (n !== codexAbertos) { codexAbertos = n; versao++; avisar() }
  })
}

// Cada processo do Codex aberto corresponde a uma das sessões mais recentes
let cacheCodex = { em: 0, ids: new Set() }
function codexAbertas() {
  if (Date.now() - cacheCodex.em < 1000) return cacheCodex.ids
  const ids = new Set([...sessoes.values()].filter((s) => s.agente === 'codex' && s.papel === 'principal' && Date.now() - s.mtime < 12 * HORA)
    .sort((a, b) => b.mtime - a.mtime).slice(0, codexAbertos).map((s) => s.id))
  cacheCodex = { em: Date.now(), ids }
  return ids
}

// ---------- status e resumo ----------

function statusDe(s) {
  const agora = Date.now()
  if (s.agente === 'claude') {
    if (s.papel === 'principal') {
      const a = abertasClaude.get(s.id)
      if (!a) return 'fechada'
      return a.status === 'busy' ? 'trabalhando' : 'parada'
    }
    if (s.finalizado) return 'fechada'
    if (agora - s.mtime < 3 * 60 * 1000) return 'trabalhando'
    return abertasClaude.has(s.pai) ? 'parada' : 'fechada'
  }
  if (!codexAbertos || !codexAbertas().has(s.id)) return 'fechada'
  return s.ciclo === 'rodando' && agora - s.mtime < 10 * 60 * 1000 ? 'trabalhando' : 'parada'
}

function total(t) { return t.entrada + t.saida + t.cacheEscrita + t.cacheLeitura }

function faisca(s, pontos = 24) {
  const agora = Math.floor(Date.now() / BALDE) * BALDE
  const r = []
  for (let i = pontos - 1; i >= 0; i--) r.push(s.baldes.get(agora - i * BALDE)?.ev || 0)
  return r
}

function projetoDe(s) {
  if (s.pasta) {
    const partes = s.pasta.replace(/\\/g, '/').split('/').filter(Boolean)
    const i = partes.findIndex((x) => /^(Downloads|Documents|Desktop|projetos)$/i.test(x))
    return (i >= 0 && partes[i + 1]) || partes.at(-1) || 'sem pasta'
  }
  return 'sem pasta'
}

function inicioDoDia() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }

function custoDesde(s, desde) {
  let v = 0
  for (const [k, b] of s.baldes) if (k >= desde) v += b.usd
  return v
}

function rotuloDe(s) {
  const a = s.agente === 'claude' ? abertasClaude.get(s.id) : null
  return a?.name || curto(s.titulo, 40) || s.id.slice(0, 8)
}

function resumoSessao(s, filhos) {
  const st = statusDe(s)
  const subs = filhos.get(s.id) || []
  const tk = total(s.tokens)
  const ferr = Object.entries(s.ferramentas).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const aberta = s.agente === 'claude' && s.papel === 'principal' ? abertasClaude.get(s.id) : null
  return {
    id: s.id, agente: s.agente, papel: s.papel, pai: s.pai,
    nome: aberta?.name || s.nome, titulo: s.titulo, projeto: projetoDe(s), pasta: s.pasta,
    branch: s.branch, modelo: s.modelo, status: st, inicio: s.inicio, ultima: s.ultima,
    ultimoPedido: s.ultimoPedido, fazendo: s.fazendo, tokens: s.tokens, total: tk,
    totalComSub: tk + subs.reduce((a, f) => a + total(f.tokens), 0),
    custo: s.custo, custoComSub: s.custo + subs.reduce((a, f) => a + f.custo, 0),
    semPreco: s.semPreco + subs.reduce((a, f) => a + f.semPreco, 0),
    subagentes: subs.map((f) => ({ id: f.id, titulo: f.titulo, nome: f.nome, status: statusDe(f), total: total(f.tokens), custo: f.custo, modelo: f.modelo, inicio: f.inicio, ultima: f.ultima, fazendo: f.fazendo?.texto || null })),
    respostas: s.respostas, erros: s.erros, ferramentasTop: ferr,
    contexto: s.contexto, janela: s.janela || precoDe(s.modelo)?.contexto || (s.modelo?.startsWith('claude') ? 1000000 : 0),
    custoHoje: custoDesde(s, inicioDoDia()) + subs.reduce((a, f) => a + custoDesde(f, inicioDoDia()), 0),
    checklist: [...s.tarefas.values()].map(({ id, titulo, status, mudou }) => ({ id, titulo, status, mudou })),
    nArquivos: Object.keys(s.arquivos).length, faisca: faisca(s),
    pid: aberta?.pid || null, versao: aberta?.version || null,
    esperando: aberta?.status === 'waiting' ? aberta.waitingFor || 'resposta' : null,
  }
}

function mapaFilhos() {
  const m = new Map()
  for (const s of sessoes.values()) {
    if (s.papel !== 'subagente' || !s.pai) continue
    if (!m.has(s.pai)) m.set(s.pai, [])
    m.get(s.pai).push(s)
  }
  return m
}

export function retrato() {
  const agora = Date.now()
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const ini24 = Math.floor((agora - 23 * HORA) / HORA) * HORA
  const filhos = mapaFilhos()
  const horas = new Map()
  for (let h = ini24; h <= agora; h += HORA) horas.set(h, { hora: h, claude: 0, codex: 0, claudeUsd: 0, codexUsd: 0 })
  let tokensHoje = 0, tokensTotal = 0, ferramentasHora = 0, custoHoje = 0, custoTotal = 0, semPreco = 0
  const porModelo = {}, custoModelo = {}, ferramentas = {}, porTipo = { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0 }
  const feed = []
  const vivas = []
  const porAgente = { claude: { tokens: 0, custo: 0 }, codex: { tokens: 0, custo: 0 } }
  for (const s of sessoes.values()) {
    tokensTotal += total(s.tokens)
    custoTotal += s.custo
    porAgente[s.agente].tokens += total(s.tokens)
    porAgente[s.agente].custo += s.custo
    semPreco += s.semPreco
    for (const k in porTipo) porTipo[k] += s.tokens[k]
    for (const [m, v] of Object.entries(s.porModelo)) porModelo[m] = (porModelo[m] || 0) + v
    for (const [m, v] of Object.entries(s.custoPorModelo)) custoModelo[m] = (custoModelo[m] || 0) + v
    for (const [k, b] of s.baldes) {
      if (k >= hoje.getTime()) { tokensHoje += b.tk; custoHoje += b.usd }
      if (k >= agora - HORA) ferramentasHora += b.fe
      const h = horas.get(Math.floor(k / HORA) * HORA)
      if (h) { h[s.agente] += b.tk; h[`${s.agente}Usd`] += b.usd }
    }
    const st = statusDe(s)
    const recente = s.ultima && agora - s.ultima < 24 * HORA
    if (recente || st !== 'fechada') {
      for (const [n, c] of Object.entries(s.ferramentas)) ferramentas[n] = (ferramentas[n] || 0) + c
      const pai = s.pai && sessoes.get(s.pai)
      const rotulo = rotuloDe(pai || s) + (pai ? ` › ${s.nome || 'subagente'}` : '')
      const projeto = projetoDe(pai || s)
      for (const e of s.eventos) {
        if (agora - e.t < 24 * HORA) feed.push({ ...e, sessao: s.pai || s.id, agente: s.agente, sub: s.papel === 'subagente', rotulo, projeto })
      }
      if (s.papel === 'principal') vivas.push(resumoSessao(s, filhos))
    }
  }
  feed.sort((a, b) => b.t - a.t)
  const ordem = { trabalhando: 0, parada: 1, fechada: 2 }
  vivas.sort((a, b) => ordem[a.status] - ordem[b.status] || (b.ultima || 0) - (a.ultima || 0))
  const todas = [...sessoes.values()]
  return {
    geradoEm: agora, versao, dias: DIAS,
    resumo: {
      abertas: todas.filter((s) => s.papel === 'principal' && statusDe(s) !== 'fechada').length,
      trabalhando: todas.filter((s) => statusDe(s) === 'trabalhando').length,
      subagentesAtivos: todas.filter((s) => s.papel === 'subagente' && statusDe(s) === 'trabalhando').length,
      tokensHoje, tokensTotal, ferramentasHora, custoHoje, custoTotal, semPreco,
      sessoesPeriodo: todas.filter((s) => s.papel === 'principal').length,
    },
    cotacao,
    precosFonte: precos.fonte || null,
    plano: precos.plano || null,
    limitesCodex,
    porAgente,
    sessoes: vivas,
    // os mais recentes de cada agente, para o filtro por agente não ficar vazio
    feed: [...feed.filter((e) => e.agente === 'claude').slice(0, 150), ...feed.filter((e) => e.agente === 'codex').slice(0, 150)].sort((a, b) => b.t - a.t),
    serieHoras: [...horas.values()],
    porModelo: Object.entries(porModelo).map(([modelo, v]) => ({ modelo, total: v, custo: custoModelo[modelo] || 0, temPreco: !!precoDe(modelo) })).sort((a, b) => b.total - a.total),
    porTipo,
    ferramentas: Object.entries(ferramentas).map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, 12),
  }
}

export function historico() {
  const filhos = mapaFilhos()
  return [...sessoes.values()]
    .filter((s) => s.papel === 'principal' && s.ultima)
    .map((s) => {
      const r = resumoSessao(s, filhos)
      delete r.faisca
      return r
    })
    .sort((a, b) => b.ultima - a.ultima)
}

export function detalhe(id) {
  const s = sessoes.get(id)
  if (!s) return null
  const filhos = mapaFilhos()
  return {
    ...resumoSessao(s, filhos),
    eventos: [...s.eventos].reverse(),
    arquivos: Object.entries(s.arquivos).sort((a, b) => b[1] - a[1]).map(([arq, n]) => ({ arq: caminhoCurto(s, arq), n })),
    ferramentas: Object.entries(s.ferramentas).sort((a, b) => b[1] - a[1]),
    porModelo: s.porModelo,
    custoPorModelo: s.custoPorModelo,
  }
}

// ---------- ciclo ----------

function avisar() { for (const f of ouvintes) f(versao) }

/** Sessão do Claude aberta por este pid (terminais do canvas): status, contexto e checklist. */
export function sessaoPorPid(pid) {
  for (const a of abertasClaude.values()) {
    if (a.pid !== pid) continue
    // chat mandado para segundo plano: o Claude continua numa sessão nova (parkedJobId) que este terminal passa a mostrar
    const b = (a.parkedJobId && [...abertasClaude.values()].find((x) => x.sessionId.startsWith(a.parkedJobId))) || a
    const s = sessoes.get(b.sessionId)
    return { id: b.sessionId, status: s ? statusDe(s) : (b.status === 'busy' ? 'trabalhando' : 'parada'), contexto: s?.contexto || 0 }
  }
  return null
}

/** Sessão do Claude aberta fora do canvas, pelo id: pid, pasta, nome e status (para migrar ao canvas). */
export function sessaoAberta(id) {
  const a = abertasClaude.get(id)
  if (!a) return null
  const s = sessoes.get(id)
  return { pid: a.pid, cwd: a.cwd || s?.pasta || null, nome: a.name || s?.titulo || null, status: s ? statusDe(s) : (a.status === 'busy' ? 'trabalhando' : 'parada'), bg: a.kind === 'bg',
    // parada num pedido de permissão ou pergunta: só anda quando alguém responde
    esperando: a.status === 'waiting', motivo: a.waitingFor || null }
}

/** Conversa mandada para segundo plano continua numa sessão nova ("continued-in"): a última da cadeia, se ainda está aberta. */
export function continuacao(id) {
  let atual = id
  for (let i = 0; i < 5 && sessoes.get(atual)?.continuouEm; i++) atual = sessoes.get(atual).continuouEm
  return atual !== id && abertasClaude.has(atual) ? atual : id
}

export function aoMudar(f) { ouvintes.add(f); return () => ouvintes.delete(f) }

export function varrer() {
  lerPrecos()
  const a = lerAbertasClaude()
  const b = varrerClaude()
  const c = varrerCodex()
  if (a || b || c) { versao++; avisar() }
  return a || b || c
}

let iniciado = false
export function iniciar(intervalo = 2000) {
  if (iniciado) return
  iniciado = true
  varrer()
  conferirProcessoCodex()
  atualizarCotacao()
  setInterval(varrer, intervalo).unref?.()
  setInterval(conferirProcessoCodex, 15000).unref?.()
  setInterval(atualizarCotacao, HORA).unref?.()
  // status de sessão parada muda com o relógio mesmo sem arquivo novo
  setInterval(() => { versao++; avisar() }, 30000).unref?.()
}
