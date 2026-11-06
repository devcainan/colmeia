// Roda solto do painel: espera ele fechar (libera a porta e o node-pty), roda os passos e sobe de novo com o mesmo comando.
import fs from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'

const { pid, cwd, passos } = JSON.parse(process.argv[2])
const vivo = () => { try { process.kill(pid, 0); return true } catch { return false } }
for (let i = 0; vivo() && i < 100; i++) await new Promise((r) => setTimeout(r, 300))

let log = 'ignore'
try { log = fs.openSync(new URL('../painel.log', import.meta.url), 'a') } catch { /* log preso por outro processo: sobe sem log */ }
const op = (extra) => ({ cwd, stdio: ['ignore', log, log], windowsHide: true, ...extra })
for (const [cmd, args] of passos.slice(0, -1)) spawnSync(cmd, args, op({ shell: cmd === 'npm' }))
const [cmd, args] = passos.at(-1)
spawn(cmd, args, op({ detached: true })).unref()
