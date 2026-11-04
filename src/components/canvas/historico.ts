// Desfazer e refazer do canvas (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y): mover, alinhar, redimensionar, criar e apagar
// formas, notas e checklists, criar e cortar ligações. Terminais ficam de fora (processo fechado não volta).
import { enviar } from '@/lib/dados'
import type { Bloco, Forma, Ligacao, Posicao } from '@/lib/tipos'

export type Passo = { desfazer: () => unknown; refazer: () => unknown }

const LIMITE = 100
const pilha: Passo[] = []
let refeitos: Passo[] = []
let ocupado = false

// nó recriado ganha id novo no servidor: o id antigo aponta para o novo, para os passos seguintes acharem
const apelidos = new Map<string, string>()
export function resolver(no: string) {
  let x = no
  for (let i = 0; i < 50 && apelidos.has(x); i++) x = apelidos.get(x)!
  return x
}
const apelidar = (velho: string, novo: string) => { if (velho !== novo) apelidos.set(velho, novo) }

// o canvas informa como aplicar posições e como ler o estado atual
type Canvas = {
  aplicarPosicoes: (m: Record<string, Posicao>) => void
  bloco: (id: string) => Bloco | undefined
  posicao: (no: string) => Posicao | undefined
  ligacoesDe: (no: string) => Ligacao[]
}
let canvas: Canvas = { aplicarPosicoes: () => {}, bloco: () => undefined, posicao: () => undefined, ligacoesDe: () => [] }
export function ligarHistorico(c: Canvas) { canvas = c }

export function registrar(p: Passo | null | undefined) {
  if (!p) return
  pilha.push(p)
  if (pilha.length > LIMITE) pilha.shift()
  refeitos = []
}

/** Vários passos que voltam juntos (ex.: apagar várias formas de uma vez). */
export function juntar(passos: Passo[]): Passo | null {
  if (!passos.length) return null
  return {
    desfazer: async () => { for (const p of [...passos].reverse()) await p.desfazer() },
    refazer: async () => { for (const p of passos) await p.refazer() },
  }
}

async function rodar(de: Passo[], para: Passo[], lado: keyof Passo) {
  if (ocupado) return
  const p = de.pop()
  if (!p) return
  ocupado = true
  try { await p[lado](); para.push(p) } catch { /* o servidor recusou: o passo sai do histórico */ } finally { ocupado = false }
}
export const desfazer = () => rodar(pilha, refeitos, 'desfazer')
export const refazer = () => rodar(refeitos, pilha, 'refazer')

// ---------- posições ----------

const mesmo = (a?: Posicao, b?: Posicao) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

/** Antes e depois de mover, alinhar ou redimensionar: guarda só o que mudou. */
export function passoMovimento(antes: Record<string, Posicao>, depois: Record<string, Posicao>): Passo | null {
  const ids = Object.keys(depois).filter((id) => antes[id] && !mesmo(antes[id], depois[id]))
  if (!ids.length) return null
  const com = (m: Record<string, Posicao>) => Object.fromEntries(ids.map((id) => [resolver(id), m[id]]))
  return { desfazer: () => canvas.aplicarPosicoes(com(antes)), refazer: () => canvas.aplicarPosicoes(com(depois)) }
}

// ---------- formas ----------

async function recriarForma(no: string, f: Forma, caixa: Posicao) {
  const { id: _id, criadoEm: _criado, ...dados } = f as Forma & { criadoEm?: number }
  const nova = await enviar<Forma>('POST', '/api/formas', { ...dados, x: caixa.x, y: caixa.y, w: caixa.w, h: caixa.h })
  apelidar(no, `f:${nova.id}`)
}
const apagarForma = (no: string) => enviar('DELETE', `/api/formas/${resolver(no).slice(2)}`)

export function passoFormaCriada(f: Forma, caixa: Posicao): Passo {
  const no = `f:${f.id}`
  let ultima = caixa
  return {
    desfazer: () => { ultima = canvas.posicao(resolver(no)) || ultima; return apagarForma(no) },
    refazer: () => recriarForma(no, f, ultima),
  }
}
export function passoFormaApagada(f: Forma, caixa: Posicao): Passo {
  const no = `f:${f.id}`
  return { desfazer: () => recriarForma(no, f, caixa), refazer: () => apagarForma(no) }
}

// ---------- notas e checklists ----------

type Copia = { b: Bloco; p?: Posicao; ligacoes: { de: string; para: string }[] }

function copiar(no: string): Copia | null {
  const atual = resolver(no)
  const b = canvas.bloco(atual.slice(2))
  if (!b) return null
  return { b, p: canvas.posicao(atual), ligacoes: canvas.ligacoesDe(atual).map(({ de, para }) => ({ de, para })) }
}

async function recriarBloco(no: string, c: Copia) {
  const novo = await enviar<Bloco>('POST', '/api/blocos', { tipo: c.b.tipo, titulo: c.b.titulo, texto: c.b.texto, itens: c.b.itens })
  const nn = `b:${novo.id}`
  const velho = resolver(no)
  apelidar(velho, nn)
  if (c.p) await enviar('PUT', '/api/canvas', { posicoes: { [nn]: c.p } })
  for (const l of c.ligacoes) {
    const de = l.de === velho ? nn : resolver(l.de)
    const para = l.para === velho ? nn : resolver(l.para)
    await enviar('POST', '/api/ligacoes', { de, para }).catch(() => {})
  }
}
const apagarBloco = (no: string) => enviar('DELETE', `/api/blocos/${resolver(no).slice(2)}`)

export function passoBlocoCriado(b: Bloco): Passo {
  const no = `b:${b.id}`
  let copia: Copia | null = null
  return {
    desfazer: () => { copia = copiar(no); return apagarBloco(no) }, // guarda o que foi escrito até agora
    refazer: () => (copia ? recriarBloco(no, copia) : undefined),
  }
}
export function passoBlocoApagado(no: string): Passo | null {
  const copia = copiar(no)
  if (!copia) return null
  return { desfazer: () => recriarBloco(no, copia), refazer: () => apagarBloco(no) }
}

// ---------- ligações ----------

export function passoLigacaoCriada(l: Ligacao): Passo {
  let atual = l.id
  return {
    desfazer: () => enviar('DELETE', `/api/ligacoes/${atual}`),
    refazer: async () => { atual = (await enviar<Ligacao>('POST', '/api/ligacoes', { de: resolver(l.de), para: resolver(l.para) })).id },
  }
}
export function passoLigacaoCortada(de: string, para: string): Passo {
  let atual: string | null = null
  return {
    desfazer: async () => { atual = (await enviar<Ligacao>('POST', '/api/ligacoes', { de: resolver(de), para: resolver(para) })).id },
    refazer: () => (atual ? enviar('DELETE', `/api/ligacoes/${atual}`) : undefined),
  }
}
