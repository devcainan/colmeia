// Plugin do Vite: serve /api/* a partir do leitor, no mesmo servidor da página.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import os from 'node:os'
import { iniciar, retrato, historico, detalhe, aoMudar, sessaoPorPid, sessaoAberta } from './leitor.mjs'
import * as T from './terminais.mjs'
import * as W from './widgets.mjs'
import { iniciarUsoDoPlano, usoDoPlano } from './uso-plano.mjs'

const ARQ_CHAVE = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', '.chave')

function chaveDoPainel() {
  if (process.env.PAINEL_CHAVE) return process.env.PAINEL_CHAVE
  try { return fs.readFileSync(ARQ_CHAVE, 'utf8').trim() } catch { /* primeira vez */ }
  const c = crypto.randomBytes(9).toString('base64url')
  fs.writeFileSync(ARQ_CHAVE, c)
  return c
}

function ehLocal(req) {
  const ip = req.socket?.remoteAddress || ''
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

function json(res, corpo, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(corpo))
}

function lerCorpo(req) {
  return new Promise((ok, falha) => {
    let s = ''
    req.on('data', (c) => { s += c; if (s.length > 1e6) { falha(new Error('corpo grande demais')); req.destroy() } })
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}) } catch { falha(new Error('JSON inválido')) } })
    req.on('error', falha)
  })
}

function lerBytes(req, limite = 25e6) {
  return new Promise((ok, falha) => {
    const partes = []
    let n = 0
    req.on('data', (c) => { n += c.length; if (n > limite) { falha(new Error(`arquivo grande demais (até ${Math.round(limite / 1e6)} MB)`)); req.destroy() } else partes.push(c) })
    req.on('end', () => ok(Buffer.concat(partes)))
    req.on('error', falha)
  })
}

const tudo = () => ({ ...retrato(), canvas: T.lista(), planoClaude: usoDoPlano() })

// Formas do quadro (frame, retângulo, texto, imagem, lápis)
async function rotasFormas(req, res, u) {
  const f = u.pathname.match(/^\/api\/formas\/(\w+)$/)
  const escolha = u.pathname.match(/^\/api\/formas\/(\w+)\/escolher$/)
  if (escolha && req.method === 'POST') {
    const r = T.escolherForma(escolha[1])
    return r ? json(res, r) : json(res, { erro: 'não encontrado' }, 404)
  }
  const img = u.pathname.match(/^\/api\/formas\/imagem\/([\w.]+)$/)
  const ou404 = (x) => (x ? json(res, x) : json(res, { erro: 'não encontrado' }, 404))
  if (img && req.method === 'GET') {
    const a = T.arquivoDaImagem(img[1])
    if (!a) return json(res, { erro: 'imagem não encontrada' }, 404)
    const tam = fs.statSync(a.arq).size
    res.setHeader('Content-Type', a.tipo)
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
    res.setHeader('Accept-Ranges', 'bytes')
    // vídeo: o navegador pede pedaços (Range) para começar logo e para avançar ou voltar
    const r = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''))
    if (r && (r[1] || r[2])) {
      const ini = r[1] ? Number(r[1]) : Math.max(0, tam - Number(r[2]))
      const fim = r[1] && r[2] ? Math.min(Number(r[2]), tam - 1) : tam - 1
      if (ini > fim || ini >= tam) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${tam}`); return res.end() }
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${ini}-${fim}/${tam}`)
      res.setHeader('Content-Length', fim - ini + 1)
      return fs.createReadStream(a.arq, { start: ini, end: fim }).pipe(res)
    }
    res.setHeader('Content-Length', tam)
    return fs.createReadStream(a.arq).pipe(res)
  }
  if (u.pathname === '/api/formas/imagem' && req.method === 'POST') {
    const tipo = String(req.headers['content-type'] || '').split(';')[0]
    return json(res, { url: T.guardarImagem(await lerBytes(req, tipo.startsWith('video/') ? 400e6 : 25e6), tipo) })
  }
  if (u.pathname === '/api/formas' && req.method === 'POST') return json(res, T.criarForma(await lerCorpo(req)))
  if (f && req.method === 'PATCH') return ou404(T.editarForma(f[1], await lerCorpo(req)))
  if (f && req.method === 'DELETE') return ou404(T.apagarForma(f[1]) && { ok: true })
  return json(res, { erro: 'rota desconhecida' }, 404)
}

// Blocos (nota e checklist) e ligações do canvas
async function rotasBlocos(req, res, u) {
  const b = u.pathname.match(/^\/api\/blocos\/(\w+)(?:\/(\w+))?$/)
  const l = u.pathname.match(/^\/api\/ligacoes\/(\w+)$/)
  const ou404 = (x) => (x ? json(res, x) : json(res, { erro: 'não encontrado' }, 404))
  if (u.pathname === '/api/blocos' && req.method === 'POST') return json(res, T.criarBloco(await lerCorpo(req)))
  if (b && !b[2] && req.method === 'PATCH') return ou404(T.editarBloco(b[1], await lerCorpo(req)))
  if (b && !b[2] && req.method === 'DELETE') return ou404(T.apagarBloco(b[1]) && { ok: true })
  if (b && b[2] === 'marcar' && req.method === 'POST') {
    const c = await lerCorpo(req)
    return ou404(T.marcar(b[1], c.item, c.estado, c.por === 'usuario' ? 'usuario' : 'agente'))
  }
  if (b && b[2] === 'enviar' && req.method === 'POST') return ou404(T.enviarBloco(b[1]))
  if (u.pathname === '/api/ligacoes' && req.method === 'POST') { const c = await lerCorpo(req); return json(res, T.ligar(c.de, c.para)) }
  if (l && req.method === 'DELETE') return ou404(T.desligar(l[1]) && { ok: true })
  return json(res, { erro: 'rota desconhecida' }, 404)
}

// Widgets do canvas: criar, ajustar, apagar, apertar botão rápido e mexer no cronômetro
async function rotasWidgets(req, res, u) {
  const m = u.pathname.match(/^\/api\/widgets\/(\w+)(?:\/(\w+))?$/)
  const ou404 = (x) => (x ? json(res, x) : json(res, { erro: 'widget não encontrado' }, 404))
  if (u.pathname === '/api/widgets' && req.method === 'POST') return json(res, W.criarWidget(await lerCorpo(req)))
  if (m && !m[2] && req.method === 'PATCH') return ou404(W.editarWidget(m[1], await lerCorpo(req)))
  if (m && !m[2] && req.method === 'DELETE') return ou404(W.apagarWidget(m[1]) && { ok: true })
  if (m && m[2] === 'apertar' && req.method === 'POST') return json(res, W.apertar(m[1], (await lerCorpo(req)).indice))
  if (m && m[2] === 'cronometro' && req.method === 'POST') return json(res, W.cronometro(m[1], (await lerCorpo(req)).acao))
  return json(res, { erro: 'rota desconhecida' }, 404)
}

// Terminais abrem processos: exigem a chave sempre, até no 127.0.0.1 (outro site no navegador não a conhece)
async function rotasTerminais(req, res, u) {
  const m = u.pathname.match(/^\/api\/terminais\/([\w-]+)(?:\/(\w+))?$/)
  try {
    if (/^\/api\/(blocos|ligacoes)/.test(u.pathname)) return await rotasBlocos(req, res, u)
    if (/^\/api\/formas/.test(u.pathname)) return await rotasFormas(req, res, u)
    if (/^\/api\/widgets/.test(u.pathname)) return await rotasWidgets(req, res, u)
    if (u.pathname === '/api/terminais' && req.method === 'GET') return json(res, T.lista())
    if (u.pathname === '/api/terminais' && req.method === 'POST') return json(res, T.criar(await lerCorpo(req)))
    if (u.pathname === '/api/lider' && req.method === 'POST') return json(res, T.criarLider(await lerCorpo(req)))
    if (u.pathname === '/api/migrar' && req.method === 'POST') return json(res, await T.migrar((await lerCorpo(req)).sessao))
    if (u.pathname === '/api/canvas' && req.method === 'PUT') { T.salvarCanvas(await lerCorpo(req)); return json(res, { ok: true }) }
    if (m && !m[2] && req.method === 'DELETE') return T.fechar(m[1]) ? json(res, { ok: true }) : json(res, { erro: 'terminal não encontrado' }, 404)
    if (m && !m[2] && req.method === 'PATCH') {
      const c = await lerCorpo(req)
      const t = c.soltar ? T.soltar(m[1]) : T.renomear(m[1], c.titulo)
      return t ? json(res, t) : json(res, { erro: 'terminal não encontrado' }, 404)
    }
    if (m && m[2] === 'entrada' && req.method === 'POST') {
      const b = await lerCorpo(req)
      return json(res, T.mandar(m[1], b.texto, !!b.quandoParar, !!b.cru))
    }
    if (m && m[2] === 'reabrir' && req.method === 'POST') {
      const t = T.reabrir(m[1])
      return t ? json(res, t) : json(res, { erro: 'terminal não encontrado' }, 404)
    }
    if (m && m[2] === 'tela') {
      const t = T.tela(m[1], Number(u.searchParams.get('linhas')) || 40)
      return t ? json(res, t) : json(res, { erro: 'terminal não encontrado' }, 404)
    }
    if (m && m[2] === 'esperar') {
      const t = await T.esperar(m[1], Number(u.searchParams.get('segundos')) || 100)
      return t ? json(res, t) : json(res, { erro: 'terminal não encontrado' }, 404)
    }
  } catch (e) {
    return json(res, { erro: e.message }, 400)
  }
  return json(res, { erro: 'rota desconhecida' }, 404)
}

function rotas(chave) {
  return (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next()
    const u = new URL(req.url, 'http://painel')
    const comChave = u.searchParams.get('chave') === chave
    if (/^\/api\/(terminais|lider|canvas|blocos|ligacoes|formas|migrar|widgets)/.test(u.pathname)) {
      return comChave ? rotasTerminais(req, res, u) : json(res, { erro: 'chave inválida' }, 401)
    }
    if (!ehLocal(req) && !comChave) return json(res, { erro: 'chave inválida' }, 401)

    if (u.pathname === '/api/agentes') return json(res, tudo())
    if (u.pathname === '/api/historico') return json(res, historico())
    if (u.pathname.startsWith('/api/sessao/')) {
      const d = detalhe(decodeURIComponent(u.pathname.slice('/api/sessao/'.length)))
      return d ? json(res, d) : json(res, { erro: 'sessão não encontrada' }, 404)
    }
    if (u.pathname === '/api/eventos') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
      let pendente = null
      const enviar = () => {
        pendente = null
        res.write(`data: ${JSON.stringify(tudo())}\n\n`)
      }
      enviar()
      // junta mudanças seguidas num envio só
      const agendar = () => { if (!pendente) pendente = setTimeout(enviar, 500) }
      const parar = aoMudar(agendar)
      const pararT = T.aoMudarTerminais(agendar)
      const pulso = setInterval(() => res.write(': pulso\n\n'), 20000)
      req.on('close', () => { parar(); pararT(); clearInterval(pulso); if (pendente) clearTimeout(pendente) })
      return
    }
    return json(res, { erro: 'rota desconhecida' }, 404)
  }
}

function enderecosDaRede() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address)
}

export function painelAgentes() {
  let chave
  const ligar = (server) => {
    chave = chaveDoPainel()
    iniciar()
    T.iniciarTerminais({ porPid: sessaoPorPid, aberta: sessaoAberta })
    iniciarUsoDoPlano()
    if (server.httpServer) T.ligarWebSocket(server.httpServer, chave)
    server.middlewares.use(rotas(chave))
    server.httpServer?.once('listening', () => {
      const porta = server.httpServer.address()?.port
      setTimeout(() => {
        console.log('\n  Painel dos agentes (abra com a chave):')
        for (const ip of enderecosDaRede()) console.log(`  ➜ http://${ip}:${porta}/?chave=${chave}`)
        console.log('')
      }, 300)
    })
  }
  return {
    name: 'painel-agentes',
    configureServer: ligar,
    configurePreviewServer: ligar,
  }
}
