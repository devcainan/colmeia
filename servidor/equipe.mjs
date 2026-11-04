#!/usr/bin/env node
// Comandos do líder para a equipe do canvas (falam com o painel em 127.0.0.1).
//   node equipe.mjs abrir "<título>" "<tarefa>" [--pasta P] [--tipo claude|codex] [--prompt-arquivo F]
//   node equipe.mjs lista | esperar <id> [segundos] | tela <id> [linhas] | mandar <id> "<texto>" | fechar <id>
//   node equipe.mjs marcar <bloco> <número> [andamento|feito|pendente]   (checklist do canvas)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const PORTA = process.env.PAINEL_PORTA || 5190
const CHAVE = process.env.PAINEL_CHAVE || fs.readFileSync(path.join(DIR, '..', '.chave'), 'utf8').trim()
const EU = process.env.PAINEL_TERMINAL || null

function opcoes(args) {
  const o = { _: [] }
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) o[args[i].slice(2)] = args[++i]
    else o._.push(args[i])
  }
  return o
}

async function api(metodo, rota, corpo, tempo = 30000) {
  const u = `http://127.0.0.1:${PORTA}${rota}${rota.includes('?') ? '&' : '?'}chave=${encodeURIComponent(CHAVE)}`
  const r = await fetch(u, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(tempo),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`)
  return j
}

const linha = (t) => `${t.id}  ${t.status.padEnd(11)} ${t.tipo.padEnd(6)} ${t.titulo || ''}${t.avisos ? `  (${t.avisos} aviso na fila)` : ''}`

async function main() {
  const [cmd, ...resto] = process.argv.slice(2)
  const o = opcoes(resto)
  switch (cmd) {
    case 'abrir': {
      const [titulo, texto] = o._
      const prompt = o['prompt-arquivo'] ? fs.readFileSync(o['prompt-arquivo'], 'utf8') : texto
      if (!titulo || !prompt) throw new Error('uso: abrir "<título>" "<tarefa>" ou --prompt-arquivo <arquivo>')
      // sessão de fora do canvas (Claude aberto no terminal comum): o trabalhador nasce ligado ao nó dela
      const paiSessao = EU ? null : process.env.CLAUDE_CODE_SESSION_ID || null
      const t = await api('POST', '/api/terminais', { tipo: o.tipo || 'claude', titulo, prompt, cwd: o.pasta || process.cwd(), pai: EU, paiSessao, modo: o.modo })
      console.log(`aberto ${t.id} (${t.tipo}) em ${t.cwd}`)
      break
    }
    case 'lista': {
      const { terminais } = await api('GET', '/api/terminais')
      const meus = EU ? terminais.filter((t) => t.pai === EU) : terminais
      console.log(meus.length ? meus.map(linha).join('\n') : 'nenhum trabalhador aberto')
      break
    }
    case 'esperar': {
      const seg = Number(o._[1]) || 100
      const t = await api('GET', `/api/terminais/${o._[0]}/esperar?segundos=${seg}`, null, (seg + 15) * 1000)
      console.log(`${linha(t)}\n---\n${t.tela}`)
      break
    }
    case 'tela': {
      const t = await api('GET', `/api/terminais/${o._[0]}/tela?linhas=${Number(o._[1]) || 60}`)
      console.log(`${linha(t)}\n---\n${t.tela}`)
      break
    }
    case 'mandar': {
      const r = await api('POST', `/api/terminais/${o._[0]}/entrada`, { texto: o._.slice(1).join(' ') })
      console.log(r.resultado)
      break
    }
    case 'marcar': {
      const [bloco, item, estado = 'feito'] = o._
      if (!bloco || !item) throw new Error('uso: marcar <bloco> <número> [andamento|feito|pendente]')
      const b = await api('POST', `/api/blocos/${bloco}/marcar`, { item, estado })
      const i = b.itens.find((x) => x.id === Number(item))
      console.log(`${b.titulo}: ${i.id}. ${i.texto} -> ${i.estado}`)
      break
    }
    case 'fechar': {
      await api('DELETE', `/api/terminais/${o._[0]}`)
      console.log('fechado')
      break
    }
    default:
      console.log('comandos: abrir, lista, esperar, tela, mandar, marcar, fechar')
  }
}

main().catch((e) => { console.error(`erro: ${e.message}`); process.exit(1) })
