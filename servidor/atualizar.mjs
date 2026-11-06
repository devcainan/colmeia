// Confere o GitHub e, quando o usuário pede, puxa a versão nova e reinicia o painel.
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
// conferir em segundo plano não pode abrir a janela de login do Git Credential Manager
const ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }
let estado = null
let atualizando = false

function git(args, timeout = 60000) {
  return new Promise((ok) => execFile('git', ['-C', RAIZ, ...args], { env: ENV, timeout, windowsHide: true }, (e, out, err) =>
    ok({ ok: !e, out: String(out || '').trim(), err: String(err || e?.message || '').trim() })))
}

async function conferir(avisar) {
  await git(['fetch', '--quiet', 'origin'])
  const n = await git(['rev-list', '--count', 'HEAD..@{u}'])
  const atras = n.ok ? Number(n.out) : 0
  const novo = atras > 0 ? { atras, titulo: (await git(['log', '-1', '--format=%s', '@{u}'])).out } : null
  if (JSON.stringify(novo) !== JSON.stringify(estado)) { estado = novo; avisar() }
}

/** { atras, titulo } quando o GitHub tem commits que esta Colmeia não tem; null se está em dia ou não é um clone. */
export const atualizacao = () => estado

export function iniciarAtualizacao(avisar) {
  conferir(avisar)
  setInterval(() => conferir(avisar), 5 * 60e3).unref()
}

/** git pull --ff-only; se veio algo, reinicia o painel (com npm install antes, se as dependências mudaram). */
export async function atualizar() {
  if (atualizando) throw new Error('já está atualizando')
  atualizando = true
  try {
    const antes = (await git(['rev-parse', 'HEAD'])).out
    const p = await git(['pull', '--ff-only'], 180000)
    // o git não mexe em nada quando recusa (mudança local no mesmo arquivo, histórico divergente)
    if (!p.ok) throw new Error(p.err.split('\n').slice(0, 6).join('\n') || 'git pull falhou')
    if ((await git(['rev-parse', 'HEAD'])).out === antes) { estado = null; atualizando = false; return { ok: true, reiniciou: false } }
    const deps = (await git(['diff', '--name-only', antes, 'HEAD', '--', 'package.json', 'package-lock.json'])).out
    const passos = []
    if (deps) passos.push(['npm', ['install']])
    if (process.argv.includes('preview')) passos.push([process.execPath, [process.argv[1], 'build']]) // npm start serve o build
    passos.push([process.execPath, process.argv.slice(1)])
    setTimeout(() => {
      spawn(process.execPath, [path.join(RAIZ, 'servidor', 'reiniciar.mjs'), JSON.stringify({ pid: process.pid, cwd: process.cwd(), passos })],
        { cwd: RAIZ, detached: true, stdio: 'ignore', windowsHide: true }).unref()
      process.exit(0)
    }, 500)
    return { ok: true, reiniciou: true }
  } catch (e) {
    atualizando = false
    throw e
  }
}
