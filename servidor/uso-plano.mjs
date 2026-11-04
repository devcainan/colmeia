// Limites do plano do Claude, os mesmos do /usage: roda `claude -p /usage` (comando local, não usa modelo)
// a cada 3 minutos numa pasta própria e apaga a conversa que ele grava, para não virar sessão no painel.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'

const CLAUDE = [path.join(os.homedir(), '.local', 'bin', 'claude.exe')].find((f) => fs.existsSync(f)) || 'claude'
export const DIR_USO = path.join(os.homedir(), '.painel-agentes', 'uso')
// o Claude grava a conversa em projects/<pasta com tudo que não é letra/número/hífen trocado por hífen>
export const PROJETO_USO = DIR_USO.replace(/[^a-zA-Z0-9-]/g, '-')
const HERDADAS = /^(CLAUDECODE|CLAUDE_PID|CLAUDE_CODE_(CHILD_SESSION|ENTRYPOINT|MESSAGING_SOCKET|MESSAGING_TOKEN|SESSION_ATTENDED|SESSION_ID|SSE_PORT)|PAINEL_TERMINAL)$/
const MESES = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }

let estado = null
let lendo = false

function nome(n) {
  if (n === 'Current session') return 'Sessão (5 h)'
  const m = /^Current week \((.+)\)$/.exec(n)
  if (m) return m[1] === 'all models' ? 'Semana, todos os modelos' : `Semana, ${m[1]}`
  return n
}

/** "Nov 4, 12:59pm" -> horário local em ms */
function quando(txt) {
  const m = /([A-Z][a-z]{2}) (\d{1,2}),? (\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(txt || '')
  if (!m || MESES[m[1]] === undefined) return null
  let h = Number(m[3]) % 12
  if (m[5].toLowerCase() === 'pm') h += 12
  const agora = new Date()
  const d = new Date(agora.getFullYear(), MESES[m[1]], Number(m[2]), h, Number(m[4] || 0))
  if (d.getTime() < agora.getTime() - 180 * 86400e3) d.setFullYear(d.getFullYear() + 1) // virada de ano
  return d.getTime()
}

export function interpretar(texto) {
  const limites = []
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^(Current [^:]+):\s*(\d+(?:\.\d+)?)% used(?:\s*\S\s*resets\s+(.+?))?\s*$/.exec(linha.trim())
    if (m) limites.push({ nome: nome(m[1]), pct: Number(m[2]), renova: quando(m[3]) })
  }
  const r24 = /Last 24h\s*\S\s*(\d+) requests\s*\S\s*(\d+) sessions/.exec(texto)
  return { limites, pedidos24h: r24 ? Number(r24[1]) : null, sessoes24h: r24 ? Number(r24[2]) : null }
}

function limparRastro() {
  const dir = path.join(os.homedir(), '.claude', 'projects', PROJETO_USO)
  try { for (const f of fs.readdirSync(dir)) if (f.endsWith('.jsonl')) fs.rmSync(path.join(dir, f), { force: true }) } catch { /* nada gravado */ }
}

function ler() {
  if (lendo) return
  lendo = true
  try { fs.mkdirSync(DIR_USO, { recursive: true }) } catch { /* já existe */ }
  const env = {}
  for (const [k, v] of Object.entries(process.env)) if (!HERDADAS.test(k)) env[k] = v
  execFile(CLAUDE, ['-p', '/usage'], { cwd: DIR_USO, env, timeout: 90000, windowsHide: true, maxBuffer: 2e6 }, (e, out) => {
    lendo = false
    limparRastro()
    const r = interpretar(String(out || ''))
    if (r.limites.length) estado = { ...r, em: Date.now() }
    else estado = { ...(estado || { limites: [] }), erro: e ? 'não consegui ler o /usage do Claude' : 'o /usage não trouxe limites', em: Date.now() }
  })
}

export function iniciarUsoDoPlano() {
  ler()
  setInterval(ler, 3 * 60e3).unref()
}
export const usoDoPlano = () => estado
