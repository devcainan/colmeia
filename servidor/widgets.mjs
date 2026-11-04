// Widgets do canvas (opcionais, um nó cada): validações (dados vêm das sessões, no navegador), deploy (GitHub
// Actions), produção no ar (confere o site), botões rápidos (mandam um pedido pronto ao terminal ligado) e
// cronômetro (manual ou contando enquanto o terminal ligado trabalha).
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'

const TIPOS = ['validacoes', 'deploy', 'producao', 'botoes', 'cronometro', 'calculadora']
const TITULOS = { validacoes: 'Validações', deploy: 'Deploy', producao: 'Produção no ar', botoes: 'Botões rápidos', cronometro: 'Cronômetro', calculadora: 'Calculadora' }
const PADRAO = {
  validacoes: {},
  deploy: { repo: '', workflow: '', quantos: 5 }, // dono/repositório e nome do workflow: ajustados na engrenagem
  producao: { url: '', intervalo: 60 },
  botoes: {
    botoes: [
      { rotulo: 'Roda os testes', texto: 'Rode os testes da parte que você mexeu e me diga o resultado em poucas linhas.' },
      { rotulo: 'Resume o que fez', texto: 'Resuma em poucas linhas o que você fez até agora e o que falta.' },
      { rotulo: 'Continue', texto: 'Continue de onde parou.' },
    ],
  },
  cronometro: { acumulado: 0, inicio: null, auto: false },
  calculadora: {},
}

let ctx = null // { canvas, terminais, mandar, avisar, gravar } vindo do terminais.mjs
const dados = {} // id -> estado ao vivo (deploy, produção)
const proximo = new Map() // id -> quando ler de novo
const lendo = new Set()

export function ligarWidgets(c) {
  ctx = c
  ctx.canvas.widgets ??= []
}
const lista = () => ctx?.canvas.widgets ?? []
const achar = (id) => lista().find((w) => w.id === id)
export const widgetExiste = (id) => !!achar(id)
export const listaWidgets = () => ({ widgets: lista(), widgetsDados: dados })

function limparConfig(tipo, config = {}, atual) {
  const c = { ...atual }
  if (tipo === 'deploy') {
    if (typeof config.repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(config.repo.trim())) c.repo = config.repo.trim()
    if (typeof config.workflow === 'string') c.workflow = config.workflow.trim().slice(0, 80)
    if (config.quantos !== undefined) c.quantos = Math.min(Math.max(Number(config.quantos) || 5, 1), 15)
  } else if (tipo === 'producao') {
    if (typeof config.url === 'string' && /^https?:\/\/\S+$/.test(config.url.trim())) c.url = config.url.trim().replace(/\/+$/, '')
    if (config.intervalo !== undefined) c.intervalo = Math.min(Math.max(Number(config.intervalo) || 60, 15), 3600)
  } else if (tipo === 'botoes') {
    if (Array.isArray(config.botoes)) {
      c.botoes = config.botoes
        .filter((b) => String(b?.rotulo || '').trim() && String(b?.texto || '').trim())
        .slice(0, 12)
        .map((b) => ({ rotulo: String(b.rotulo).trim().slice(0, 40), texto: String(b.texto).trim().slice(0, 4000) }))
    }
  } else if (tipo === 'cronometro') {
    if (typeof config.auto === 'boolean') c.auto = config.auto
  }
  return c
}

export function criarWidget({ tipo }) {
  if (!TIPOS.includes(tipo)) throw new Error('widget desconhecido')
  const w = { id: `w${crypto.randomBytes(3).toString('hex')}`, tipo, titulo: TITULOS[tipo], config: structuredClone(PADRAO[tipo]), criadoEm: Date.now() }
  lista().push(w)
  proximo.set(w.id, 0) // deploy e produção leem na hora
  ctx.avisar()
  ctx.gravar()
  return w
}

export function editarWidget(id, { titulo, config }) {
  const w = achar(id)
  if (!w) return null
  if (typeof titulo === 'string') w.titulo = titulo.trim().slice(0, 60) || TITULOS[w.tipo]
  if (config && typeof config === 'object') {
    w.config = limparConfig(w.tipo, config, w.config)
    proximo.set(w.id, 0)
    delete dados[w.id]
  }
  ctx.avisar()
  ctx.gravar()
  return w
}

export function apagarWidget(id) {
  const antes = lista().length
  ctx.canvas.widgets = lista().filter((w) => w.id !== id)
  ctx.canvas.ligacoes = ctx.canvas.ligacoes.filter((l) => l.de !== `w:${id}` && l.para !== `w:${id}`)
  delete ctx.canvas.posicoes[`w:${id}`]
  delete dados[id]
  proximo.delete(id)
  ctx.avisar()
  ctx.gravar()
  return lista().length !== antes
}

/** Terminais ligados ao widget no canvas. */
function alvos(id) {
  const no = `w:${id}`
  return ctx.canvas.ligacoes
    .flatMap((l) => (l.de === no ? [l.para] : l.para === no ? [l.de] : []))
    .filter((x) => x.startsWith('t:'))
    .map((x) => x.slice(2))
}

/** Botão rápido: digita o pedido no(s) terminal(is) ligado(s). */
export function apertar(id, indice) {
  const w = achar(id)
  const b = w?.tipo === 'botoes' ? w.config.botoes[Number(indice)] : null
  if (!b) throw new Error('botão não encontrado')
  const ts = alvos(id)
  if (!ts.length) throw new Error('ligue o widget a um terminal primeiro')
  return { resultados: ts.map((t) => ({ terminal: t, ...ctx.mandar(t, b.texto, false) })) }
}

export function cronometro(id, acao) {
  const w = achar(id)
  if (w?.tipo !== 'cronometro') throw new Error('cronômetro não encontrado')
  const c = w.config
  const agora = Date.now()
  if (acao === 'iniciar' && !c.inicio) c.inicio = agora
  else if (acao === 'pausar' && c.inicio) { c.acumulado += agora - c.inicio; c.inicio = null }
  else if (acao === 'zerar') { c.acumulado = 0; c.inicio = c.inicio ? agora : null }
  ctx.avisar()
  ctx.gravar()
  return w
}

// ---------- dados ao vivo ----------

// credencial do Git Credential Manager, só em memória; nunca abre janela de login
// Com mais de uma conta do GitHub salva, tenta primeiro a do dono do repositório.
const tokens = new Map() // conta -> { valor, em }
function credencial(conta) {
  return new Promise((ok) => {
    const env = { ...process.env, GCM_INTERACTIVE: 'never', GIT_TERMINAL_PROMPT: '0' }
    const p = execFile('git', ['credential', 'fill'], { timeout: 10000, windowsHide: true, env }, (e, out) => {
      ok(e ? null : /^password=(.+)$/m.exec(out || '')?.[1]?.trim() || null)
    })
    p.stdin.end(`protocol=https\nhost=github.com\n${conta ? `username=${conta}\n` : ''}\n`)
  })
}
async function tokenDoGitHub(dono) {
  const t = tokens.get(dono)
  if (t?.valor && Date.now() - t.em < 30 * 60e3) return t.valor
  const valor = (await credencial(dono)) || (await credencial(null))
  if (valor) tokens.set(dono, { valor, em: Date.now() })
  return valor
}

async function lerDeploy(w) {
  const { repo, workflow, quantos } = w.config
  const dono = repo.split('/')[0]
  const tk = await tokenDoGitHub(dono)
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=30`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'colmeia', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) },
    signal: AbortSignal.timeout(15000),
  })
  if (r.status === 401) tokens.delete(dono)
  if (!r.ok) return { erro: r.status === 404 ? 'repositório não encontrado ou sem acesso' : `o GitHub respondeu ${r.status}`, em: Date.now() }
  const j = await r.json()
  const runs = (j.workflow_runs || [])
    .filter((x) => !workflow || x.name === workflow)
    .slice(0, quantos)
    .map((x) => ({
      id: x.id, numero: x.run_number, nome: x.name, titulo: x.display_title, branch: x.head_branch, evento: x.event,
      status: x.status, conclusao: x.conclusion, inicio: x.run_started_at || x.created_at, fim: x.updated_at, url: x.html_url, autor: x.actor?.login || null,
    }))
  return { runs, em: Date.now() }
}

async function lerProducao(w) {
  const { url } = w.config
  const ini = Date.now()
  let status = 0
  let erro = null
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'follow', headers: { 'User-Agent': 'colmeia', 'Cache-Control': 'no-cache' } })
    status = r.status
    await r.arrayBuffer().catch(() => {})
  } catch (e) {
    erro = e?.name === 'TimeoutError' ? 'sem resposta em 15 s' : 'não conectou'
  }
  const ms = Date.now() - ini
  let versao = null
  try {
    const r = await fetch(`${url}/.commit`, { signal: AbortSignal.timeout(8000), headers: { 'Cache-Control': 'no-cache' } })
    const texto = r.ok ? (await r.text()).trim() : ''
    if (/^[\w.-]{4,40}$/.test(texto)) versao = texto // página HTML (rota inexistente) não conta como versão
  } catch { /* sem versão */ }
  const ok = !erro && status >= 200 && status < 400
  const antes = dados[w.id]
  const historico = [...(antes?.historico || []), { ok, ms, em: Date.now() }].slice(-40)
  return { ok, status, ms, erro, versao, historico, desde: antes && antes.ok === ok ? antes.desde : Date.now(), em: Date.now() }
}

/** Chamado a cada segundo pelo ciclo dos terminais. */
export function cicloWidgets() {
  if (!ctx) return
  const agora = Date.now()
  let mudou = false
  for (const w of lista()) {
    if (w.tipo === 'cronometro' && w.config.auto) {
      const c = w.config
      const trabalhando = alvos(w.id).some((t) => ctx.terminais.get(t)?.status === 'trabalhando')
      if (trabalhando && !c.inicio) { c.inicio = agora; mudou = true }
      else if (!trabalhando && c.inicio) { c.acumulado += agora - c.inicio; c.inicio = null; mudou = true }
      continue
    }
    if (w.tipo !== 'deploy' && w.tipo !== 'producao') continue
    if (w.tipo === 'deploy' ? !w.config.repo : !w.config.url) {
      // sem repositório ou endereço ainda: avisa uma vez e espera o ajuste
      if (!dados[w.id]) { dados[w.id] = { erro: w.tipo === 'deploy' ? 'Escolha o repositório na engrenagem.' : 'Escolha o endereço na engrenagem.', em: agora }; ctx.avisar() }
      continue
    }
    if (lendo.has(w.id) || agora < (proximo.get(w.id) ?? 0)) continue
    const rodando = w.tipo === 'deploy' && dados[w.id]?.runs?.some((r) => r.status !== 'completed')
    const intervalo = w.tipo === 'deploy' ? (rodando ? 15e3 : 60e3) : w.config.intervalo * 1000
    proximo.set(w.id, agora + intervalo)
    lendo.add(w.id)
    const ler = w.tipo === 'deploy' ? lerDeploy : lerProducao
    ler(w)
      .then((d) => { dados[w.id] = d })
      .catch((e) => { dados[w.id] = { ...(dados[w.id] || {}), erro: String(e?.message || e), em: Date.now() } })
      .finally(() => { lendo.delete(w.id); ctx.avisar() })
  }
  if (mudou) { ctx.avisar(); ctx.gravar() }
}
