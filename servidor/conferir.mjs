// node servidor/conferir.mjs  -> mede a primeira carga e mostra o resumo
import { varrer, retrato, historico } from './leitor.mjs'

const t0 = Date.now()
varrer()
const ms = Date.now() - t0
const r = retrato()
const mi = (n) => (n / 1e6).toFixed(2) + ' mi'
console.log(`primeira carga: ${ms} ms`)
console.log('resumo:', { ...r.resumo, tokensHoje: mi(r.resumo.tokensHoje), tokensTotal: mi(r.resumo.tokensTotal) })
console.log('modelos:', r.porModelo.map((m) => `${m.modelo}=${mi(m.total)}`).join(', '))
console.log('ferramentas:', r.ferramentas.slice(0, 6).map((f) => `${f.nome}:${f.qtd}`).join(', '))
for (const s of r.sessoes) {
  console.log(`- [${s.agente}/${s.status}] ${s.nome || s.id.slice(0, 8)} | ${s.titulo || '(sem título)'} | ${s.projeto} | ${s.modelo} | ${mi(s.total)} (+sub ${mi(s.totalComSub - s.total)}) | subs ${s.subagentes.length} | agora: ${s.fazendo?.ferramenta || '-'} ${s.fazendo?.texto || ''}`)
}
console.log('feed:', r.feed.slice(0, 5).map((e) => `${new Date(e.t).toLocaleTimeString()} ${e.tipo} ${e.texto.slice(0, 60)}`))
console.log('histórico:', historico().length, 'sessões principais;', 'tamanho do retrato:', (JSON.stringify(r).length / 1024).toFixed(0), 'KB')
const t1 = Date.now(); varrer(); console.log(`segunda varredura: ${Date.now() - t1} ms`)
