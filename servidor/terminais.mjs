// Terminais de verdade para o canvas: Claude, Codex ou PowerShell numa pasta, ligados ao navegador
// por WebSocket. É também a base do líder: ele abre trabalhadores, espera, lê a tela e manda mensagem
// pelo equipe.mjs. Passagem de contexto: Claude com contexto grande escreve um .md e volta num chat novo.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { cicloWidgets, ligarWidgets, listaWidgets, widgetExiste } from './widgets.mjs'
import pty from 'node-pty'
import headless from '@xterm/headless'
import serialize from '@xterm/addon-serialize'
import { WebSocketServer } from 'ws'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const ARQ_CANVAS = path.join(DIR, '..', '.canvas.json')
export const DIR_IMAGENS = path.join(DIR, '..', '.canvas-imagens')
const DIR_HANDOFF = path.join(os.homedir(), '.painel-agentes', 'handoffs')
export const EQUIPE = path.join(DIR, 'equipe.mjs').replace(/\\/g, '/')

const CLAUDE = [path.join(os.homedir(), '.local', 'bin', 'claude.exe')].find((f) => fs.existsSync(f)) || 'claude.exe'
const CODEX_JS = path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')

// O que a sessão que subiu o painel deixou no ambiente e não pode vazar para os terminais
const HERDADAS = /^(CLAUDECODE|CLAUDE_PID|CLAUDE_CODE_(CHILD_SESSION|ENTRYPOINT|MESSAGING_SOCKET|MESSAGING_TOKEN|SESSION_ATTENDED|SESSION_ID|SSE_PORT))$/
// Claude parado num pedido de permissão: precisa de alguém no terminal
const PEDINDO_PERMISSAO = /Do you want to (proceed|make this edit|create|allow)|Would you like to proceed|Allow .{1,40} to run/i

const PADRAO = { posicoes: {}, terminais: [], handoff: { ligado: true, limite: 350000 }, blocos: [], ligacoes: [], formas: [] }
const terminais = new Map()
const ouvintes = new Set()
let canvas = lerCanvas()
let sessaoPorPid = () => null
let sessaoAberta = () => null
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

function lerCanvas() {
  try { return { ...PADRAO, ...JSON.parse(fs.readFileSync(ARQ_CANVAS, 'utf8')) } } catch { return structuredClone(PADRAO) }
}

let gravando = null
function gravar() {
  // vivo e trabalhando: para reabrir sozinho depois de um reinício do painel
  canvas.terminais = [...terminais.values()].map(({ id, tipo, titulo, cwd, papel, pai, paiSessao, criadoEm, chat, sessao, modo, vivo, status }) =>
    ({ id, tipo, titulo, cwd, papel, pai, paiSessao, criadoEm, chat, sessao, modo, vivo, trabalhando: status === 'trabalhando' }))
  clearTimeout(gravando)
  gravando = setTimeout(() => fs.writeFile(ARQ_CANVAS, JSON.stringify(canvas, null, 1), () => {}), 300)
}

let avisoPendente = null
function avisar() {
  if (avisoPendente) return
  avisoPendente = setTimeout(() => { avisoPendente = null; for (const f of ouvintes) f() }, 200)
}
export function aoMudarTerminais(f) { ouvintes.add(f); return () => ouvintes.delete(f) }

function meta(t) {
  return {
    id: t.id, tipo: t.tipo, titulo: t.titulo, cwd: t.cwd, papel: t.papel, pai: t.pai, criadoEm: t.criadoEm,
    chat: t.chat, sessao: t.sessao, vivo: t.vivo, codigo: t.codigo, status: t.status, contexto: t.contexto,
    avisos: t.avisos.length, handoff: t.handoff ? t.handoff.fase : null, pid: t.pid, modo: t.modo, paiSessao: t.paiSessao,
  }
}

export function lista() {
  return { terminais: [...terminais.values()].map(meta), posicoes: canvas.posicoes, handoff: canvas.handoff, blocos: canvas.blocos, ligacoes: canvas.ligacoes, formas: canvas.formas, git: estadoGit, ...listaWidgets() }
}

function textoDaTela(t, linhas = 40) {
  const b = t.tela.buffer.active
  const out = []
  for (let i = 0; i < b.length; i++) out.push(b.getLine(i)?.translateToString(true) ?? '')
  while (out.length && !out.at(-1).trim()) out.pop()
  return out.slice(-linhas).join('\n')
}

function novaTela(t, aviso) {
  t.tela = new headless.Terminal({ cols: t.cols, rows: t.rows, scrollback: 3000, allowProposedApi: true })
  t.ser = new serialize.SerializeAddon()
  t.tela.loadAddon(t.ser)
  if (aviso) t.tela.write(aviso)
}

function enviarAosClientes(t, d) {
  for (const c of t.clientes) if (c.readyState === 1) c.send(d)
}

function abrirProcesso(t, { prompt, retomar } = {}) {
  const env = {}
  for (const [k, v] of Object.entries(process.env)) if (!HERDADAS.test(k)) env[k] = v
  Object.assign(env, { TERM: 'xterm-256color', COLORTERM: 'truecolor', PAINEL_TERMINAL: t.id })
  const texto = prompt ? String(prompt).replace(/\r\n/g, '\n') : null
  let arquivo, args
  if (t.tipo === 'claude') {
    arquivo = CLAUDE
    args = []
    if (t.modo === 'acceptEdits') args.push('--permission-mode', 'acceptEdits')
    // o equipe.mjs só fala com o painel: abrir trabalhadores (líder) e marcar checklists do canvas
    args.push('--allowedTools', `Bash(node ${EQUIPE}:*)`)
    if (retomar) args.push('--resume', retomar)
    if (texto) args.push(texto)
  } else if (t.tipo === 'codex') {
    arquivo = process.execPath
    args = [CODEX_JS, ...(texto ? [texto] : [])]
  } else if (t.tipo === 'git') {
    arquivo = 'powershell.exe'
    args = ['-NoLogo', '-NoExit', '-Command', 'git status -sb; git log --oneline -5']
  } else {
    arquivo = 'powershell.exe'
    args = ['-NoLogo']
  }
  novaTela(t)
  enviarAosClientes(t, '\x1bc')
  const p = pty.spawn(arquivo, args, { name: 'xterm-256color', cols: t.cols, rows: t.rows, cwd: t.cwd, env })
  Object.assign(t, { proc: p, pid: p.pid, vivo: true, codigo: null, status: 'trabalhando', ultimaSaida: Date.now(), abertoEm: Date.now() })
  p.onData((d) => {
    if (t.proc !== p) return
    t.tela.write(d)
    t.ultimaSaida = Date.now()
    enviarAosClientes(t, d)
  })
  p.onExit(({ exitCode }) => {
    if (t.proc !== p) return // trocado na passagem de contexto
    Object.assign(t, { proc: null, vivo: false, codigo: exitCode, status: 'encerrado' })
    const aviso = `\r\n\x1b[90m[processo encerrado, código ${exitCode}]\x1b[0m\r\n`
    t.tela.write(aviso)
    enviarAosClientes(t, aviso)
    avisar()
    gravar()
  })
}

function registro(dados) {
  return {
    id: dados.id || crypto.randomBytes(4).toString('hex'),
    tipo: ['claude', 'codex', 'shell', 'git'].includes(dados.tipo) ? dados.tipo : 'claude',
    titulo: String(dados.titulo || '').slice(0, 80) || null,
    cwd: dados.cwd, papel: dados.papel || null, pai: dados.pai || null, modo: dados.modo || 'default',
    paiSessao: typeof dados.paiSessao === 'string' ? dados.paiSessao.slice(0, 64) : null,
    criadoEm: dados.criadoEm || Date.now(), chat: dados.chat || 1, sessao: dados.sessao || null,
    cols: 120, rows: 32, clientes: new Set(), avisos: [], handoff: null, ultimoHandoff: 0,
    proc: null, pid: null, vivo: false, codigo: null, status: 'encerrado', contexto: 0,
    ultimaSaida: 0, ultimaEntrada: 0, abertoEm: 0, ultimaEntrega: 0,
  }
}

function pastaValida(cwd) {
  const p = cwd ? path.resolve(String(cwd)) : os.homedir()
  try { if (fs.statSync(p).isDirectory()) return p } catch { /* não existe */ }
  throw new Error(`pasta não encontrada: ${p}`)
}

/** Nó do agente que chamou (MCP ou equipe.mjs): o terminal dele no canvas ou o nó da sessão de fora. */
function noDoAgente({ terminal, pidPai, sessao } = {}) {
  if (terminal && terminais.has(terminal)) return `t:${terminal}`
  const id = sessao || (pidPai ? sessaoPorPid(Number(pidPai))?.id : null)
  if (!id) return null
  for (const t of terminais.values()) if (t.sessao === id) return `t:${t.id}`
  return `s:${id}`
}

export function criar(dados) {
  const t = registro({ ...dados, id: null, criadoEm: null, chat: 1, sessao: null, cwd: pastaValida(dados.cwd) })
  if (!t.pai && !t.paiSessao && dados.pidPai) {
    const no = noDoAgente({ pidPai: dados.pidPai })
    if (no?.startsWith('t:')) t.pai = no.slice(2)
    else if (no) t.paiSessao = no.slice(2)
  }
  if (t.pai && !terminais.has(t.pai)) t.pai = null
  if (t.pai) t.paiSessao = null // aberto por um terminal do canvas: a ligação é com o nó dele
  if ((t.pai || t.paiSessao) && !t.papel && (t.tipo === 'claude' || t.tipo === 'codex')) t.papel = 'trabalhador'
  terminais.set(t.id, t)
  const retomar = t.tipo === 'claude' && dados.retomar ? String(dados.retomar) : null
  abrirProcesso(t, { prompt: dados.prompt, retomar })
  if (retomar) t.sessao = retomar
  avisar()
  gravar()
  return meta(t)
}

/**
 * Traz uma sessão do Claude aberta fora para o canvas: fecha o processo de fora, abre um terminal na mesma
 * pasta retomando a mesma conversa e, se ela estava trabalhando, manda continuar de onde parou.
 */
export async function migrar(sessao) {
  const a = sessaoAberta(sessao)
  if (!a) throw new Error('a sessão não está aberta')
  for (const t of terminais.values()) if (t.sessao === sessao && t.vivo) throw new Error('a sessão já está no canvas')
  if (!temConversa(sessao)) throw new Error('a conversa ainda não tem mensagens: não há o que levar')
  const trabalhando = a.status === 'trabalhando'
  if (a.pid) {
    try { process.kill(a.pid) } catch { /* já saiu */ }
    // espera o processo sair para não ter dois escrevendo na mesma conversa
    for (let i = 0; i < 50; i++) {
      try { process.kill(a.pid, 0) } catch { break }
      await dormir(100)
    }
  }
  return criar({
    // sem título fixo: o nó mostra o título da conversa (e acompanha se ele mudar)
    tipo: 'claude', cwd: a.cwd || undefined, retomar: sessao,
    prompt: trabalhando ? 'Esta conversa foi movida para o canvas do painel no meio de um trabalho. Continue exatamente de onde parou.' : undefined,
  })
}

// conversa sem nenhuma mensagem não fica gravada: --resume falharia com "No conversation found"
function temConversa(id) {
  if (!id) return false
  const dir = path.join(os.homedir(), '.claude', 'projects')
  try { return fs.readdirSync(dir).some((d) => fs.existsSync(path.join(dir, d, `${id}.jsonl`))) } catch { return false }
}

export function reabrir(id) {
  const t = terminais.get(id)
  if (!t) return null
  if (!t.vivo) abrirProcesso(t, { retomar: t.tipo === 'claude' && temConversa(t.sessao) ? t.sessao : null })
  avisar()
  return meta(t)
}

export function fechar(id) {
  const t = terminais.get(id)
  if (!t) return false
  const p = t.proc
  t.proc = null
  try { p?.kill() } catch { /* já saiu */ }
  for (const c of t.clientes) c.close()
  terminais.delete(id)
  delete canvas.posicoes[`t:${id}`]
  canvas.ligacoes = canvas.ligacoes.filter((l) => l.de !== `t:${id}` && l.para !== `t:${id}`)
  avisar()
  gravar()
  return true
}

/** Corta a ligação com quem abriu (líder, terminal ou sessão): o terminal fica solto no canvas. */
export function soltar(id) {
  const t = terminais.get(id)
  if (!t) return null
  t.pai = null
  t.paiSessao = null
  if (t.papel === 'trabalhador') t.papel = null
  avisar()
  gravar()
  return meta(t)
}

export function renomear(id, titulo) {
  const t = terminais.get(id)
  if (!t) return null
  t.titulo = String(titulo || '').trim().slice(0, 80) || null
  avisar()
  gravar()
  return meta(t)
}

/** Digita no terminal como se fosse o usuário; nos agentes usa colagem para o texto chegar inteiro. */
function digitar(t, texto) {
  if (!t.proc) return false
  const p = t.proc
  p.write(t.tipo === 'shell' || t.tipo === 'git' ? texto : `\x1b[200~${texto}\x1b[201~`)
  setTimeout(() => { if (t.proc === p) p.write('\r') }, 300)
  t.ultimaEntrada = Date.now()
  return true
}

/** Mensagem para o terminal: na hora, ou na fila até ele parar (avisos e validações). */
export function mandar(id, texto, quandoParar = false, cru = false) {
  const t = terminais.get(id)
  if (!t) return { resultado: 'nao-encontrado' }
  if (!t.vivo) return { resultado: 'encerrado' }
  if (cru) { // tecla direta: Esc interrompe o agente, Ctrl+C o PowerShell
    t.proc.write(String(texto || ''))
    t.ultimaEntrada = Date.now()
    return { resultado: 'entregue' }
  }
  const limpo = String(texto || '').trim()
  if (!limpo) return { resultado: 'vazio' }
  if (quandoParar && t.status !== 'parada') {
    t.avisos.push(limpo)
    avisar()
    return { resultado: 'na-fila' }
  }
  digitar(t, limpo)
  return { resultado: 'entregue' }
}

export function tela(id, linhas = 40) {
  const t = terminais.get(id)
  return t ? { ...meta(t), tela: textoDaTela(t, Math.min(Math.max(linhas, 5), 400)) } : null
}

/** Espera o terminal terminar o que está fazendo (parado e sem entrada recente) ou o tempo acabar. */
export async function esperar(id, segundos = 100) {
  const t = terminais.get(id)
  if (!t) return null
  const fim = Date.now() + Math.min(Math.max(segundos, 1), 540) * 1000
  while (Date.now() < fim) {
    if (!t.vivo) break
    const agora = Date.now()
    if ((t.status === 'parada' || t.status === 'aguardando') && agora - t.ultimaEntrada > 8000 && agora - t.abertoEm > 15000) break
    await dormir(1000)
  }
  return tela(id, 40)
}

export function redimensionar(t, cols, rows) {
  const c = Math.min(Math.max(Number(cols) || 0, 20), 400)
  const r = Math.min(Math.max(Number(rows) || 0, 5), 200)
  if (c === t.cols && r === t.rows) return
  t.cols = c
  t.rows = r
  try { t.proc?.resize(c, r) } catch { /* saiu */ }
  t.tela.resize(c, r)
  avisarTamanho(t)
}

// Aviso de controle para as abas (não é saída do terminal): começa com \u0000, que o programa nunca escreve.
// Todas as abas desenham no tamanho do processo; senão a aba de outro tamanho via letras "presas" na tela.
const TAMANHO = (t, extra = {}) => `\u0000${JSON.stringify({ t: 'tam', c: t.cols, r: t.rows, ...extra })}`
function avisarTamanho(t) {
  for (const c of t.clientes) if (c.readyState === 1) c.send(TAMANHO(t))
}

export function salvarCanvas({ posicoes, handoff }) {
  if (posicoes && typeof posicoes === 'object') canvas.posicoes = { ...canvas.posicoes, ...posicoes }
  if (handoff && typeof handoff === 'object') {
    canvas.handoff = {
      ligado: handoff.ligado !== false,
      limite: Math.min(Math.max(Number(handoff.limite) || 350000, 50000), 950000),
    }
    avisar()
  }
  gravar()
}

// ---------- Blocos (nota e checklist) e ligações, como no n8n ----------

const ESTADOS = ['pendente', 'andamento', 'feito']
const acharBloco = (id) => canvas.blocos.find((b) => b.id === id)

function normalizarItens(b, itens) {
  return itens.filter((i) => String(i?.texto || '').trim()).map((i) => {
    const id = Number(i.id) > 0 ? Number(i.id) : ++b.seq
    if (id > b.seq) b.seq = id
    const antes = b.itens.find((x) => x.id === id)
    const estado = ESTADOS.includes(i.estado) ? i.estado : antes?.estado || 'pendente'
    const mudou = !antes || antes.estado !== estado
    return { id, texto: String(i.texto).trim().slice(0, 300), estado, mudou: mudou ? Date.now() : antes.mudou, por: mudou ? 'usuario' : antes.por }
  })
}

export function criarBloco({ tipo, titulo, texto, itens, origem, ligarEm }) {
  const ehLista = tipo === 'checklist'
  const b = { id: `b${crypto.randomBytes(3).toString('hex')}`, tipo: ehLista ? 'checklist' : 'nota', titulo: String(titulo || '').slice(0, 80) || (ehLista ? 'Checklist' : 'Nota'), texto: String(texto || ''), itens: [], seq: 0, criadoEm: Date.now() }
  if (Array.isArray(itens)) b.itens = normalizarItens(b, itens.map((i) => (typeof i === 'string' ? { texto: i } : i)))
  canvas.blocos.push(b)
  // criado por um agente (ou a partir de um nó): já nasce ligado ao chat, à esquerda dele
  const no = ligarEm && noExiste(ligarEm) ? ligarEm : noDoAgente(origem)
  if (no) {
    ligar(`b:${b.id}`, no)
    const p = canvas.posicoes[no]
    if (p) {
      const irmaos = canvas.ligacoes.filter((l) => l.para === no && l.de.startsWith('b:')).length - 1
      canvas.posicoes[`b:${b.id}`] = { x: p.x - 340, y: p.y + irmaos * 250 }
    }
  }
  avisar()
  gravar()
  return b
}

export function editarBloco(id, { titulo, texto, itens, acrescentar }) {
  const b = acharBloco(id)
  if (!b) return null
  if (titulo !== undefined) b.titulo = String(titulo).slice(0, 80)
  if (texto !== undefined) b.texto = (acrescentar && b.texto ? `${b.texto}\n${texto}` : String(texto)).slice(0, 50000)
  if (Array.isArray(itens)) b.itens = normalizarItens(b, (acrescentar ? [...b.itens, ...itens] : itens).map((i) => (typeof i === 'string' ? { texto: i } : i)))
  avisar()
  gravar()
  return b
}

/** O agente (pelo equipe.mjs) ou o usuário marca um item: pendente, andamento ou feito. */
export function marcar(id, item, estado = 'feito', por = 'agente') {
  const b = acharBloco(id)
  const i = b?.itens.find((x) => x.id === Number(item))
  if (!i) return null
  i.estado = ESTADOS.includes(estado) ? estado : 'feito'
  i.mudou = Date.now()
  i.por = por
  avisar()
  gravar()
  return b
}

export function apagarBloco(id) {
  const antes = canvas.blocos.length
  canvas.blocos = canvas.blocos.filter((b) => b.id !== id)
  canvas.ligacoes = canvas.ligacoes.filter((l) => l.de !== `b:${id}` && l.para !== `b:${id}`)
  delete canvas.posicoes[`b:${id}`]
  avisar()
  gravar()
  return canvas.blocos.length !== antes
}

const noExiste = (no) => (no.startsWith('t:') && terminais.has(no.slice(2))) || (no.startsWith('b:') && !!acharBloco(no.slice(2))) || no.startsWith('s:')
  || (no.startsWith('w:') && widgetExiste(no.slice(2)))

export function ligar(de, para) {
  if (!de || !para || de === para || !noExiste(de) || !noExiste(para)) throw new Error('ligação inválida')
  const igual = canvas.ligacoes.find((l) => (l.de === de && l.para === para) || (l.de === para && l.para === de))
  if (igual) return igual
  const l = { id: `l${crypto.randomBytes(3).toString('hex')}`, de, para }
  canvas.ligacoes.push(l)
  avisar()
  gravar()
  return l
}

export function desligar(id) {
  const antes = canvas.ligacoes.length
  canvas.ligacoes = canvas.ligacoes.filter((l) => l.id !== id)
  avisar()
  gravar()
  return canvas.ligacoes.length !== antes
}

function textoDoBloco(b) {
  if (b.tipo === 'nota') return `[Nota do painel: ${b.titulo}]\n${b.texto.trim()}`
  const falta = b.itens.filter((i) => i.estado !== 'feito')
  return [
    `[Checklist do painel: ${b.titulo}]`,
    'Faça os itens abaixo, um por vez, na ordem. A checklist fica no canvas e o usuário acompanha.',
    `Ao começar um item rode: node ${EQUIPE} marcar ${b.id} <número> andamento`,
    `Ao terminar o item rode: node ${EQUIPE} marcar ${b.id} <número> feito`,
    ...falta.map((i) => `${i.id}. ${i.texto}`),
  ].join('\n')
}

/** Manda a nota ou a checklist para cada terminal ligado a ela (na fila se ele estiver ocupado). */
export function enviarBloco(id) {
  const b = acharBloco(id)
  if (!b) return null
  const no = `b:${id}`
  const alvos = canvas.ligacoes.flatMap((l) => (l.de === no ? [l.para] : l.para === no ? [l.de] : []))
    .filter((x) => x.startsWith('t:')).map((x) => x.slice(2))
  if (!alvos.length) throw new Error('ligue o bloco a um terminal primeiro')
  if (b.tipo === 'checklist' && !b.itens.some((i) => i.estado !== 'feito')) throw new Error('todos os itens já estão feitos')
  const texto = textoDoBloco(b)
  return { resultados: alvos.map((t) => ({ terminal: t, ...mandar(t, texto, true) })) }
}

// ---------- Formas do quadro, como no Figma: frame, retângulo, texto, imagem e traço do lápis ----------

const TIPOS_FORMA = ['frame', 'retangulo', 'texto', 'imagem', 'desenho']
const acharForma = (id) => canvas.formas.find((f) => f.id === id)
const num = (v, padrao) => (Number.isFinite(Number(v)) ? Number(v) : padrao)

/** Pontos do lápis em 0..1 dentro da caixa do traço; o nó estica o desenho junto quando é redimensionado. */
function limparPontos(pontos) {
  if (!Array.isArray(pontos)) return []
  return pontos.slice(0, 4000).filter((p) => Array.isArray(p) && p.length === 2).map(([x, y]) => [Math.round(num(x, 0) * 1000) / 1000, Math.round(num(y, 0) * 1000) / 1000])
}

function campos(f, { cor, texto, tamanho, pontos, espessura }) {
  if (typeof cor === 'string') f.cor = cor.slice(0, 40)
  if (texto !== undefined) f.texto = String(texto).slice(0, 20000)
  if (tamanho !== undefined) f.tamanho = Math.min(Math.max(num(tamanho, 16), 8), 200)
  if (espessura !== undefined) f.espessura = Math.min(Math.max(num(espessura, 3), 1), 40)
  if (pontos !== undefined) f.pontos = limparPontos(pontos)
}

export function criarForma({ tipo, x, y, w, h, url, ...resto }) {
  if (!TIPOS_FORMA.includes(tipo)) throw new Error('forma desconhecida')
  const f = { id: `f${crypto.randomBytes(4).toString('hex')}`, tipo, cor: '', texto: '', criadoEm: Date.now() }
  if (tipo === 'imagem') {
    if (typeof url !== 'string' || !url.startsWith('/api/formas/imagem/')) throw new Error('imagem inválida')
    f.url = url
  }
  if (tipo === 'frame') f.texto = 'Frame'
  campos(f, resto)
  canvas.formas.push(f)
  canvas.posicoes[`f:${f.id}`] = { x: num(x, 0), y: num(y, 0), w: Math.max(num(w, 200), 8), h: Math.max(num(h, 120), 8) }
  avisar()
  gravar()
  return f
}

export function editarForma(id, dados) {
  const f = acharForma(id)
  if (!f) return null
  campos(f, dados)
  avisar()
  gravar()
  return f
}

export function apagarForma(id) {
  const f = acharForma(id)
  if (!f) return false
  canvas.formas = canvas.formas.filter((x) => x.id !== id)
  delete canvas.posicoes[`f:${id}`]
  // a imagem sai do disco só quando nenhuma outra forma a usa
  if (f.url && !canvas.formas.some((x) => x.url === f.url)) fs.rm(path.join(DIR_IMAGENS, path.basename(f.url)), { force: true }, () => {})
  avisar()
  gravar()
  return true
}

const EXT_IMAGEM = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

/** Guarda a imagem colada ou solta no quadro e devolve o endereço dela. */
export function guardarImagem(bytes, tipo) {
  const ext = EXT_IMAGEM[tipo]
  if (!ext) throw new Error('só PNG, JPG, WebP ou GIF')
  fs.mkdirSync(DIR_IMAGENS, { recursive: true })
  const nome = `${crypto.randomBytes(8).toString('hex')}.${ext}`
  fs.writeFileSync(path.join(DIR_IMAGENS, nome), bytes)
  return `/api/formas/imagem/${nome}`
}

export function arquivoDaImagem(nome) {
  const limpo = path.basename(String(nome))
  const ext = limpo.split('.').pop()
  const tipo = Object.entries(EXT_IMAGEM).find(([, e]) => e === ext)?.[0]
  const arq = path.join(DIR_IMAGENS, limpo)
  return tipo && /^[0-9a-f]{16}\.\w+$/.test(limpo) && fs.existsSync(arq) ? { arq, tipo } : null
}

// ---------- Git (janela de deploy) ----------

const estadoGit = {}
const lendoGit = new Set()

function git(cwd, args) {
  return new Promise((ok) => execFile('git', ['-C', cwd, ...args], { timeout: 15000, maxBuffer: 4e6, windowsHide: true }, (e, out) => ok(e ? null : out)))
}

async function lerGit(cwd) {
  if (lendoGit.has(cwd)) return
  lendoGit.add(cwd)
  try {
    const [st, log] = await Promise.all([git(cwd, ['status', '--porcelain=v1', '-b']), git(cwd, ['log', '-8', '--pretty=format:%h%x09%s%x09%cr%x09%an'])])
    if (st == null) { estadoGit[cwd] = { erro: 'não é um repositório git', em: Date.now() }; return }
    const [cab, ...arqs] = st.split('\n').filter(Boolean)
    const m = cab.match(/^## (.+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/) || []
    const novo = {
      branch: m[1] || '?', remoto: m[2] || null,
      frente: Number(/ahead (\d+)/.exec(m[3] || '')?.[1] || 0), atras: Number(/behind (\d+)/.exec(m[3] || '')?.[1] || 0),
      alterados: arqs.slice(0, 300).map((l) => ({ st: l.slice(0, 2), arq: l.slice(3) })), totalAlterados: arqs.length,
      commits: (log || '').split('\n').filter(Boolean).map((l) => { const [h, msg, quando, autor] = l.split('\t'); return { h, msg, quando, autor } }),
    }
    const antes = JSON.stringify({ ...estadoGit[cwd], em: 0 })
    estadoGit[cwd] = { ...novo, em: Date.now() }
    if (antes !== JSON.stringify({ ...estadoGit[cwd], em: 0 })) avisar()
  } finally {
    lendoGit.delete(cwd)
  }
}

let tiqueGit = 0
function cicloGit() {
  if (++tiqueGit % 5) return
  const pastas = new Set([...terminais.values()].filter((t) => t.tipo === 'git').map((t) => t.cwd))
  for (const p of pastas) void lerGit(p)
}

// ---------- Líder ----------

export function promptDoLider(objetivo) {
  const eq = `node ${EQUIPE}`
  return [
    'Você é o líder de uma equipe de agentes no painel dos agentes. O usuário acompanha tudo num canvas e pode digitar em qualquer terminal.',
    `Objetivo do usuário: ${String(objetivo).trim()}`,
    '',
    'Como trabalhar:',
    '1. Leia o necessário do projeto e separe o objetivo em checklist (TaskCreate), uma tarefa por área. Marque cada uma em andamento e concluída na hora (TaskUpdate).',
    `2. Para cada área, abra um trabalhador com uma tarefa clara e completa (o que fazer, arquivos, como conferir): ${eq} abrir "<título curto>" --prompt-arquivo <arquivo.md> (ou o texto entre aspas no lugar do --prompt-arquivo). Use --pasta <pasta> se for outra pasta e --tipo codex para usar o Codex. O comando devolve o id do trabalhador.`,
    `3. Acompanhe: ${eq} esperar <id> 100 devolve quando ele parar (repita enquanto vier "trabalhando"). Depois leia o resultado em ${eq} tela <id> 80.`,
    `4. Para corrigir ou pedir mais: ${eq} mandar <id> "<mensagem>". Para ver a equipe: ${eq} lista.`,
    '5. Se um trabalhador ficar "aguardando", ele está pedindo permissão: avise o usuário em uma linha e siga com os outros.',
    '6. Antes de passo arriscado ou de decisão do usuário, crie uma tarefa com [validar] no começo do título e pare. A resposta do usuário chega como mensagem neste terminal, começando com [Aviso do painel].',
    `7. No fim, confira o trabalho, feche os trabalhadores com ${eq} fechar <id> e escreva um resumo curto do que foi feito e do que falta.`,
    'Não abra mais de 4 trabalhadores ao mesmo tempo. Escreva em português.',
  ].join('\n')
}

export function criarLider({ objetivo, cwd, modo }) {
  if (!String(objetivo || '').trim()) throw new Error('objetivo vazio')
  return criar({ tipo: 'claude', cwd, modo, papel: 'lider', titulo: `Líder: ${String(objetivo).trim().slice(0, 60)}`, prompt: promptDoLider(objetivo) })
}

// ---------- Ciclo: status, fila de avisos e passagem de contexto ----------

function pedidoDeHandoff(arquivo, limite) {
  return [
    `[Aviso do painel] Este chat passou de ${Math.round(limite / 1000)} mil tokens de contexto e vai continuar num chat novo.`,
    `Escreva agora em ${arquivo} um resumo para quem continuar: objetivo, o que já foi feito, decisões tomadas, arquivos mexidos, checklist com o estado de cada item e o próximo passo exato.`,
    'Não faça mais nada depois de gravar o arquivo. Responda só HANDOFF PRONTO.',
  ].join('\n')
}

function passagemDeContexto(t) {
  const h = canvas.handoff
  if (!h?.ligado || t.tipo !== 'claude' || !t.vivo) return
  const agora = Date.now()
  if (!t.handoff) {
    if (t.status !== 'parada' || t.contexto < h.limite || agora - t.ultimoHandoff < 10 * 60e3) return
    fs.mkdirSync(DIR_HANDOFF, { recursive: true })
    const arquivo = path.join(DIR_HANDOFF, `${t.id}-chat${t.chat}.md`).replace(/\\/g, '/')
    try { fs.rmSync(arquivo, { force: true }) } catch { /* nada */ }
    t.handoff = { fase: 'pedido', arquivo, em: agora }
    digitar(t, pedidoDeHandoff(arquivo, h.limite))
    avisar()
    return
  }
  if (agora - t.handoff.em > 5 * 60e3) { // não escreveu: desiste e tenta de novo mais tarde
    t.handoff = null
    t.ultimoHandoff = agora
    avisar()
    return
  }
  let pronto = false
  try { pronto = fs.statSync(t.handoff.arquivo).size > 200 } catch { /* ainda não */ }
  if (!pronto || t.status !== 'parada' || agora - t.ultimaSaida < 5000) return
  const arquivo = t.handoff.arquivo
  const velho = t.proc
  t.proc = null
  try { velho?.kill() } catch { /* já saiu */ }
  Object.assign(t, { chat: t.chat + 1, handoff: null, ultimoHandoff: agora, contexto: 0, sessao: null })
  abrirProcesso(t, {
    prompt: `Você continua um trabalho começado em outro chat (este é o chat ${t.chat} deste terminal). Leia primeiro ${arquivo}, que tem o objetivo, o que já foi feito e o próximo passo, e siga a partir dali.`,
  })
  avisar()
  gravar()
}

function ciclo() {
  cicloGit()
  cicloWidgets()
  const agora = Date.now()
  for (const t of terminais.values()) {
    if (!t.vivo) continue
    let st = null
    if (t.tipo === 'claude') {
      const s = sessaoPorPid(t.pid)
      if (s) {
        if (s.id !== t.sessao) { t.sessao = s.id; gravar(); avisar() }
        if (s.contexto !== t.contexto) { t.contexto = s.contexto; avisar() }
        st = s.status === 'trabalhando' ? 'trabalhando' : 'parada'
      }
    }
    if (!st) st = agora - t.ultimaSaida < 4000 ? 'trabalhando' : 'parada'
    if (st === 'parada' && PEDINDO_PERMISSAO.test(textoDaTela(t, 15))) st = 'aguardando'
    if (st !== t.status) { t.status = st; avisar(); gravar() }
    if (st === 'parada' && t.avisos.length && agora - t.ultimaEntrada > 3000 && agora - t.ultimaEntrega > 5000) {
      digitar(t, t.avisos.splice(0).join('\n\n'))
      t.ultimaEntrega = agora
      avisar()
    }
    passagemDeContexto(t)
  }
}

// ---------- Ligação com o servidor ----------

function conectar(t, ws) {
  t.clientes.add(ws)
  // primeiro o tamanho (para a tela chegar já na largura certa); "sozinho" = nenhuma outra aba olhando
  ws.send(TAMANHO(t, { sozinho: t.clientes.size === 1 }))
  ws.send('\x1bc' + t.ser.serialize())
  ws.on('message', (raw) => {
    let m
    try { m = JSON.parse(String(raw)) } catch { return }
    if (m.t === 'i' && t.proc && typeof m.d === 'string') { t.proc.write(m.d); t.ultimaEntrada = Date.now() }
    else if (m.t === 'r') redimensionar(t, m.c, m.r)
  })
  ws.on('close', () => t.clientes.delete(ws))
}

let iniciado = false
export function iniciarTerminais({ porPid, aberta }) {
  sessaoPorPid = porPid
  if (aberta) sessaoAberta = aberta
  ligarWidgets({ canvas, terminais, mandar, avisar, gravar })
  if (iniciado) return
  iniciado = true
  // Terminais da última vez: os que estavam abertos reabrem sozinhos (Claude na mesma conversa e, se estava
  // trabalhando, com "continue"); os que já estavam encerrados ficam com Retomar
  const voltar = []
  for (const d of canvas.terminais || []) {
    if (!d?.id) continue
    const t = registro(d)
    novaTela(t, d.vivo
      ? '\x1b[90mO painel reiniciou; reabrindo este terminal…\x1b[0m\r\n'
      : '\x1b[90mO painel reiniciou e este terminal foi encerrado. Use Retomar para abrir de novo.\x1b[0m\r\n')
    terminais.set(t.id, t)
    if (d.vivo) voltar.push({ t, trabalhando: !!d.trabalhando })
  }
  setTimeout(() => {
    for (const { t, trabalhando } of voltar) {
      if (t.vivo) continue
      const claude = t.tipo === 'claude'
      abrirProcesso(t, {
        retomar: claude && temConversa(t.sessao) ? t.sessao : null,
        prompt: claude && trabalhando ? 'O painel dos agentes reiniciou no meio do seu trabalho. Continue exatamente de onde parou.' : undefined,
      })
    }
    if (voltar.length) { avisar(); gravar() }
  }, 1500)
  setInterval(ciclo, 1000).unref()
  const encerrar = () => { for (const t of terminais.values()) try { t.proc?.kill() } catch { /* já saiu */ } }
  process.once('exit', encerrar)
}

/** WebSocket /api/terminais/<id>/ws?chave=... no mesmo servidor do Vite (o HMR usa outro protocolo). */
export function ligarWebSocket(httpServer, chave) {
  const wss = new WebSocketServer({ noServer: true })
  httpServer.on('upgrade', (req, socket, head) => {
    const u = new URL(req.url || '/', 'http://painel')
    const m = u.pathname.match(/^\/api\/terminais\/([\w-]+)\/ws$/)
    if (!m) return
    const origem = req.headers.origin
    let deFora = false
    try { deFora = !!origem && new URL(origem).host !== req.headers.host } catch { deFora = true }
    const t = terminais.get(m[1])
    if (deFora || u.searchParams.get('chave') !== chave || !t) { socket.destroy(); return }
    wss.handleUpgrade(req, socket, head, (ws) => conectar(t, ws))
  })
}
