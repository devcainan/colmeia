#!/usr/bin/env node
// MCP do painel dos agentes: ferramentas nativas para criar notas, checklists, janelas do Git e trabalhadores
// no canvas (http://<ip>:5190). Tudo que o agente cria nasce ligado ao nó dele no canvas.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const PORTA = process.env.PAINEL_PORTA || 5190
// quem chamou: terminal do canvas (variável do painel) ou o Claude que abriu este MCP (processo pai)
const ORIGEM = { terminal: process.env.PAINEL_TERMINAL || null, pidPai: process.ppid }

// Sessão aberta a partir de um agente do canvas (o terminal dele passa COLMEIA_DONO para tudo que roda embaixo): a
// marca diz ao painel de quem ela é, e ele a mostra presa embaixo do agente, mesmo que o processo do meio já tenha fechado.
if (process.env.COLMEIA_DONO) {
  try {
    const dir = path.join(os.homedir(), '.painel-agentes', 'donos')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${process.ppid}.json`), JSON.stringify({ pid: process.ppid, dono: process.env.COLMEIA_DONO, em: Date.now() }))
  } catch { /* sem a marca, a sessão aparece de fora */ }
}

function chave() {
  if (process.env.PAINEL_CHAVE) return process.env.PAINEL_CHAVE
  return fs.readFileSync(path.join(DIR, '..', '.chave'), 'utf8').trim()
}

async function api(metodo, rota, corpo, tempo = 30000) {
  const u = `http://127.0.0.1:${PORTA}${rota}${rota.includes('?') ? '&' : '?'}chave=${encodeURIComponent(chave())}`
  let r
  try {
    r = await fetch(u, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(tempo) })
  } catch {
    throw new Error(`o painel não está respondendo em 127.0.0.1:${PORTA}; peça ao usuário para abrir o painel dos agentes`)
  }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`)
  return j
}

const server = new McpServer({ name: 'painel', version: '1.0.0' })

function ferramenta(nome, descricao, esquema, fn) {
  server.registerTool(nome, { description: descricao, inputSchema: esquema }, async (args) => {
    try { return { content: [{ type: 'text', text: await fn(args) }] } }
    catch (e) { return { content: [{ type: 'text', text: `erro: ${e.message}` }], isError: true } }
  })
}

const ESTADO = { pendente: '[ ]', andamento: '[~]', feito: '[x]' }
const itensTexto = (b) => b.itens.map((i) => `${ESTADO[i.estado]} ${i.id}. ${i.texto}`).join('\n')
const linhaTerminal = (t) => `${t.id}  ${t.tipo}  ${t.status}  ${t.titulo || ''}`

ferramenta('criar_nota', 'Cria uma nota no canvas do painel, ligada ao seu chat. Use para deixar contexto, decisões ou instruções visíveis ao usuário. Para separar assuntos na mesma nota, passe abas (como no Bloco de Notas do Windows 11).',
  {
    titulo: z.string().describe('título curto'),
    texto: z.string().optional().describe('conteúdo da nota (sem abas)'),
    abas: z.array(z.object({ titulo: z.string(), texto: z.string() })).optional().describe('uma aba por assunto; a primeira é a principal'),
  },
  async ({ titulo, texto, abas }) => {
    const b = await api('POST', '/api/blocos', { tipo: 'nota', titulo, texto: texto || '', abas, origem: ORIGEM })
    return `Nota ${b.id} criada no canvas: ${b.titulo}${b.abas ? ` (${b.abas.length} abas)` : ''}`
  })

const MIDIA = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }

ferramenta('mostrar_video', 'Mostra no canvas um vídeo (MP4 ou WebM) ou uma imagem que você gerou, ligado ao seu chat, para o usuário assistir e escolher ali mesmo. Chame uma vez por arquivo. Para versões, use título com letra do grupo e número ("A1: nome", "A2: nome"; outro vídeo usa B): o botão Escolher esta versão manda a escolha ao seu terminal e tira do canvas as versões do mesmo grupo.',
  {
    arquivo: z.string().describe('caminho completo do arquivo no computador, ex.: C:/.../saida/versao-1.mp4'),
    titulo: z.string().optional().describe('nome curto que aparece em cima do vídeo, ex.: "Versão 1: pilha da demanda"'),
  },
  async ({ arquivo, titulo }) => {
    const tipo = MIDIA[path.extname(arquivo).toLowerCase()]
    if (!tipo) throw new Error('use .mp4, .webm, .png, .jpg, .webp ou .gif')
    const bytes = fs.readFileSync(arquivo)
    if (bytes.length > 400e6) throw new Error('arquivo acima de 400 MB')
    const u = `http://127.0.0.1:${PORTA}/api/formas/imagem?chave=${encodeURIComponent(chave())}`
    let r
    try { r = await fetch(u, { method: 'POST', headers: { 'Content-Type': tipo }, body: bytes, signal: AbortSignal.timeout(120000) }) }
    catch { throw new Error(`o painel não está respondendo em 127.0.0.1:${PORTA}`) }
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`)
    const video = tipo.startsWith('video/')
    const f = await api('POST', '/api/formas', { tipo: video ? 'video' : 'imagem', url: j.url, texto: titulo || path.basename(arquivo), origem: ORIGEM, ...(video ? {} : { w: 360, h: 360 }) })
    return `${video ? 'Vídeo' : 'Imagem'} ${f.id} no canvas, ligado ao seu chat: ${f.texto}`
  })

/** O que o endereço responde daqui: fora do ar, ou um site que não deixa abrir dentro de outra página (fica em branco). */
async function conferirPagina(url) {
  let r
  try { r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(6000) }) }
  catch { return 'o endereço não respondeu deste computador: confira se o servidor está no ar antes de pedir o teste' }
  try { await r.body?.cancel() } catch {}
  const xfo = (r.headers.get('x-frame-options') || '').toLowerCase()
  const ancestrais = /frame-ancestors\s+([^;]*)/i.exec(r.headers.get('content-security-policy') || '')?.[1]?.trim()
  if (xfo.includes('deny') || xfo.includes('sameorigin')) return `o site manda X-Frame-Options ${xfo.toUpperCase()} e deve ficar em branco no canvas; o usuário usa o botão de abrir em outra aba`
  if (ancestrais && !ancestrais.includes('*')) return `o site limita quem o abre por dentro (frame-ancestors ${ancestrais}) e pode ficar em branco no canvas`
  if (r.status >= 400) return `o endereço respondeu HTTP ${r.status}`
  return null
}

ferramenta('abrir_pagina', 'Abre uma página web (o teste em localhost, um preview ou um site) dentro do canvas, num navegador embutido ligado ao seu chat, para o usuário testar ali mesmo. Use no lugar de pedir para o usuário abrir uma URL no navegador. Com o mesmo título de uma página que já está no canvas, troca o endereço dela em vez de abrir outra.',
  {
    url: z.string().describe('endereço completo com http:// ou https://, ex.: http://localhost:5174/pedidos'),
    titulo: z.string().optional().describe('nome curto em cima da página, ex.: "Teste: Vendas > Pedidos"'),
  },
  async ({ url, titulo }) => {
    let endereco
    try { endereco = new URL(url.trim()) } catch { throw new Error('endereço inválido: use http:// ou https://') }
    if (endereco.protocol !== 'http:' && endereco.protocol !== 'https:') throw new Error('endereço inválido: use http:// ou https://')
    const nome = (titulo || `${endereco.host}${endereco.pathname === '/' ? '' : endereco.pathname}`).slice(0, 120)
    const aviso = await conferirPagina(endereco.toString())
    const atual = (await api('GET', '/api/terminais')).formas?.find((f) => f.tipo === 'pagina' && f.texto === nome)
    const f = atual
      ? await api('PATCH', `/api/formas/${atual.id}`, { url: endereco.toString() })
      : await api('POST', '/api/formas', { tipo: 'pagina', url: endereco.toString(), texto: nome, origem: ORIGEM })
    const feito = atual ? `Página ${f.id} (${f.texto}) agora mostra ${f.url}` : `Página ${f.id} aberta no canvas, ligada ao seu chat: ${f.texto} (${f.url})`
    const login = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(endereco.hostname) ? ' Se o sistema pedir login dentro do canvas, é normal: o canvas aberto pelo IP da rede guarda a sessão à parte; abrindo o painel por http://localhost:5190 a sessão do navegador vale lá dentro.' : ''
    return `${feito}.${aviso ? ` Atenção: ${aviso}.` : ''}${login}`
  })

ferramenta('editar_nota', 'Troca o texto de uma nota do canvas ou acrescenta ao fim dela.',
  { nota: z.string().describe('id da nota, ex.: b1a2b3'), texto: z.string(), acrescentar: z.boolean().optional().describe('true acrescenta ao fim em vez de substituir') },
  async ({ nota, texto, acrescentar }) => {
    const b = await api('PATCH', `/api/blocos/${nota}`, { texto, acrescentar: !!acrescentar })
    return `Nota ${b.id} atualizada`
  })

ferramenta('criar_checklist', 'Cria uma checklist no canvas, ligada ao seu chat. O usuário acompanha ao vivo; marque cada item com marcar_item ao começar (andamento) e ao terminar (feito).',
  { titulo: z.string(), itens: z.array(z.string()).min(1).describe('um item por passo, com título curto que diga o resultado') },
  async ({ titulo, itens }) => {
    const b = await api('POST', '/api/blocos', { tipo: 'checklist', titulo, itens, origem: ORIGEM })
    return `Checklist ${b.id} criada no canvas:\n${itensTexto(b)}`
  })

ferramenta('adicionar_itens', 'Acrescenta itens ao fim de uma checklist do canvas.',
  { checklist: z.string(), itens: z.array(z.string()).min(1) },
  async ({ checklist, itens }) => {
    const b = await api('PATCH', `/api/blocos/${checklist}`, { itens, acrescentar: true })
    return `Checklist ${b.id}:\n${itensTexto(b)}`
  })

ferramenta('marcar_item', 'Marca um item de checklist do canvas: andamento ao começar, feito ao terminar, pendente para desfazer.',
  { checklist: z.string(), item: z.number().int().describe('número do item'), estado: z.enum(['andamento', 'feito', 'pendente']).default('feito') },
  async ({ checklist, item, estado }) => {
    const b = await api('POST', `/api/blocos/${checklist}/marcar`, { item, estado })
    const feitos = b.itens.filter((i) => i.estado === 'feito').length
    return `${b.titulo}: item ${item} -> ${estado} (${feitos}/${b.itens.length} feitos)`
  })

ferramenta('ver_canvas', 'Lista o que está no canvas: terminais (id, tipo, status) e blocos (notas e checklists com o estado dos itens).', {},
  async () => {
    const c = await api('GET', '/api/terminais')
    const ts = c.terminais.map(linhaTerminal).join('\n') || '(nenhum)'
    const bs = c.blocos.map((b) => (b.tipo === 'nota' ? `nota ${b.id}: ${b.titulo}` : `checklist ${b.id}: ${b.titulo}\n${itensTexto(b)}`)).join('\n\n') || '(nenhum)'
    return `Terminais:\n${ts}\n\nBlocos:\n${bs}`
  })

ferramenta('abrir_git', 'Abre uma janela do Git no canvas (status, branch, commits e um terminal na pasta), ligada ao seu chat. Use antes de commit, push ou deploy para o usuário acompanhar.',
  { pasta: z.string().optional().describe('pasta do repositório; padrão: a pasta atual') },
  async ({ pasta }) => {
    const t = await api('POST', '/api/terminais', { tipo: 'git', titulo: 'Git', cwd: pasta || process.cwd(), pai: ORIGEM.terminal, pidPai: ORIGEM.pidPai })
    return `Janela do Git ${t.id} aberta em ${t.cwd}`
  })

ferramenta('abrir_terminal', 'Abre um trabalhador visível no canvas (Claude, Codex ou PowerShell), ligado a você. Dê uma tarefa completa: o que fazer, arquivos e como conferir. Depois use esperar_terminal e ler_terminal.',
  {
    tipo: z.enum(['claude', 'codex', 'shell']).default('claude'),
    titulo: z.string().describe('nome curto do trabalhador'),
    tarefa: z.string().optional().describe('pedido inicial (Claude e Codex)'),
    pasta: z.string().optional(),
  },
  async ({ tipo, titulo, tarefa, pasta }) => {
    const t = await api('POST', '/api/terminais', { tipo, titulo, prompt: tarefa, cwd: pasta || process.cwd(), pai: ORIGEM.terminal, pidPai: ORIGEM.pidPai })
    return `Terminal ${t.id} (${t.tipo}) aberto em ${t.cwd}`
  })

ferramenta('trazer_sessao', 'Traz para o canvas, como seu trabalhador, uma sessão do Claude que você abriu fora do canvas: ela fecha lá e continua num terminal ligado a você. Use quando o painel avisar que ela parou pedindo permissão ou resposta; o usuário não responde a sessões abertas por agentes, quem responde é você (esperar_terminal, ler_terminal e mandar_terminal).',
  { sessao: z.string().describe('id completo da sessão, como veio no aviso do painel') },
  async ({ sessao }) => {
    const t = await api('POST', '/api/migrar', { sessao, pai: ORIGEM.terminal })
    return `Sessão ${sessao} agora é o trabalhador ${t.id} no canvas, ligado a você. Veja o pedido com esperar_terminal ou ler_terminal (id ${t.id}) e responda com mandar_terminal.`
  })

ferramenta('esperar_terminal', 'Espera um terminal do canvas parar (até N segundos) e devolve a tela. Repita enquanto vier "trabalhando".',
  { id: z.string(), segundos: z.number().int().min(5).max(540).default(100) },
  async ({ id, segundos }) => {
    const t = await api('GET', `/api/terminais/${id}/esperar?segundos=${segundos}`, null, (segundos + 15) * 1000)
    return `${linhaTerminal(t)}\n---\n${t.tela}`
  })

ferramenta('ler_terminal', 'Lê as últimas linhas da tela de um terminal do canvas.',
  { id: z.string(), linhas: z.number().int().min(5).max(400).default(60) },
  async ({ id, linhas }) => {
    const t = await api('GET', `/api/terminais/${id}/tela?linhas=${linhas}`)
    return `${linhaTerminal(t)}\n---\n${t.tela}`
  })

ferramenta('mandar_terminal', 'Manda uma mensagem ou comando para um terminal do canvas, como se fosse digitado.',
  { id: z.string(), texto: z.string() },
  async ({ id, texto }) => (await api('POST', `/api/terminais/${id}/entrada`, { texto })).resultado)

ferramenta('fechar_terminal', 'Fecha um terminal do canvas (encerra o processo).',
  { id: z.string() },
  async ({ id }) => { await api('DELETE', `/api/terminais/${id}`); return 'fechado' })

await server.connect(new StdioServerTransport())
