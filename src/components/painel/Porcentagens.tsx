import { motion } from 'motion/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AGENTES, TIPOS_TOKEN, corContexto, corDoModelo, fmtPct, fmtReais, fmtTokens, nomeModelo } from '@/lib/formato'
import type { Retrato } from '@/lib/tipos'

interface Parte { valor: number; cor: string }

// anel em SVG: cada parte ocupa sua fração da volta
function Anel({ partes, total, centro, sub }: { partes: Parte[]; total?: number; centro: string; sub: string }) {
  const r = 52
  const volta = 2 * Math.PI * r
  const soma = total ?? partes.reduce((a, p) => a + p.valor, 0)
  let acumulado = 0
  return (
    <svg viewBox="0 0 128 128" className="mx-auto size-40">
      <circle cx="64" cy="64" r={r} fill="none" stroke="var(--muted)" strokeWidth="10" />
      {partes.map((p, i) => {
        const frac = soma ? p.valor / soma : 0
        const ini = acumulado
        acumulado += frac
        return (
          <motion.circle
            key={i}
            cx="64" cy="64" r={r} fill="none" stroke={p.cor} strokeWidth="10" strokeLinecap="butt"
            strokeDasharray={`${volta} ${volta}`}
            initial={{ strokeDashoffset: volta }}
            animate={{ strokeDashoffset: volta * (1 - frac) }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.1 * i }}
            style={{ rotate: -90 + ini * 360, transformOrigin: '64px 64px' }}
          />
        )
      })}
      <text x="64" y="62" textAnchor="middle" className="fill-foreground font-mono text-[18px] font-medium">{centro}</text>
      <text x="64" y="80" textAnchor="middle" className="fill-muted-foreground text-[9px]">{sub}</text>
    </svg>
  )
}

function Barra({ rotulo, pct, cor, valor }: { rotulo: string; pct: number; cor: string; valor?: string }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="truncate">{rotulo}</span>
        <span className="shrink-0 font-mono text-muted-foreground">{valor ? `${valor} · ` : ''}<span className="text-foreground">{fmtPct(pct)}</span></span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div className="h-full rounded-full" style={{ background: cor }} initial={{ width: 0 }} animate={{ width: `${Math.min(100, pct)}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
      </div>
    </div>
  )
}

function Bloco({ titulo, descricao, children }: { titulo: string; descricao: string; children: React.ReactNode }) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="text-sm font-medium">{titulo}</CardTitle>
        <CardDescription className="text-xs">{descricao}</CardDescription>
      </CardHeader>
      <CardContent className="grid content-start gap-3 px-5">{children}</CardContent>
    </Card>
  )
}

export function Porcentagens({ dados }: { dados: Retrato }) {
  const abertas = dados.sessoes.filter((s) => s.status !== 'fechada' && s.janela)
  const ag = dados.porAgente
  const totalAg = ag.claude.custo + ag.codex.custo
  const pctClaude = totalAg ? (ag.claude.custo / totalAg) * 100 : 0
  const totalModelos = dados.porModelo.reduce((a, m) => a + m.custo, 0)
  const hoje = dados.sessoes.filter((s) => s.custoHoje > 0).sort((a, b) => b.custoHoje - a.custoHoje)
  const totalHoje = hoje.reduce((a, s) => a + s.custoHoje, 0)
  const totalTipos = TIPOS_TOKEN.reduce((a, t) => a + dados.porTipo[t.chave], 0)
  const lim = dados.limitesCodex

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Bloco titulo="Janela de contexto" descricao="Quanto cada sessão aberta já ocupou da janela do modelo">
        {abertas.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma sessão aberta.</p>}
        {abertas.map((s) => {
          const pct = (s.contexto / s.janela) * 100
          return <Barra key={s.id} rotulo={s.nome || s.titulo || s.id.slice(0, 8)} pct={pct} cor={corContexto(pct)} valor={`${fmtTokens(s.contexto)} de ${fmtTokens(s.janela)}`} />
        })}
        <p className="text-[11px] text-muted-foreground">Verde até 50%, amarelo até 80%, vermelho acima.</p>
      </Bloco>

      <Bloco titulo="Divisão do uso" descricao={`Por agente, em valor de API, últimos ${dados.dias} dias`}>
        <Anel
          partes={[{ valor: ag.claude.custo, cor: AGENTES.claude.cor }, { valor: ag.codex.custo, cor: AGENTES.codex.cor }]}
          centro={fmtPct(pctClaude)}
          sub="Claude"
        />
        <Barra rotulo="Claude" pct={pctClaude} cor={AGENTES.claude.cor} valor={fmtReais(ag.claude.custo)} />
        <Barra rotulo="Codex" pct={100 - pctClaude} cor={AGENTES.codex.cor} valor={fmtReais(ag.codex.custo)} />
      </Bloco>

      <Bloco titulo="Limite do plano do Codex" descricao="Quanto do limite da janela atual já foi usado">
        {lim ? (
          <>
            <Anel partes={[{ valor: lim.usado, cor: corContexto(lim.usado) }]} total={100} centro={fmtPct(lim.usado)} sub={`plano ${lim.plano || '-'}`} />
            <p className="text-center text-xs text-muted-foreground">
              Janela de {Math.round(lim.janelaMin / 1440)} dias
              {lim.renovaEm && <> · renova em {new Date(lim.renovaEm).toLocaleDateString('pt-BR')}</>}
            </p>
          </>
        ) : <p className="text-xs text-muted-foreground">O Codex ainda não informou o limite.</p>}
      </Bloco>

      <Bloco titulo="Limites do plano do Claude" descricao="Os mesmos números do /usage do Claude Code, lidos a cada 3 minutos">
        {!dados.planoClaude && <p className="text-xs text-muted-foreground">Lendo o /usage…</p>}
        {dados.planoClaude?.erro && !dados.planoClaude.limites.length && <p className="text-xs text-destructive">{dados.planoClaude.erro}</p>}
        {dados.planoClaude?.limites.map((l) => (
          <Barra key={l.nome} rotulo={l.nome} pct={l.pct} cor={corContexto(l.pct)}
            valor={`${fmtPct(l.pct)}${l.renova ? ` · renova ${new Date(l.renova).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}`} />
        ))}
        {dados.planoClaude?.pedidos24h != null && (
          <p className="text-[11px] text-muted-foreground">Últimas 24 h: {dados.planoClaude.pedidos24h} pedidos em {dados.planoClaude.sessoes24h} sessões.</p>
        )}
      </Bloco>

      <Bloco titulo="Uso por modelo" descricao={`Parte de cada modelo no uso em valor de API, ${dados.dias} dias`}>
        {dados.porModelo.filter((m) => m.custo > 0).sort((a, b) => b.custo - a.custo).map((m) => (
          <Barra key={m.modelo} rotulo={nomeModelo(m.modelo)} pct={(m.custo / (totalModelos || 1)) * 100} cor={corDoModelo(m.modelo)} valor={fmtReais(m.custo)} />
        ))}
      </Bloco>

      <Bloco titulo="Uso de hoje por sessão" descricao="Parte de cada sessão no uso desde 00:00">
        {hoje.length === 0 && <p className="text-xs text-muted-foreground">Sem uso hoje.</p>}
        {hoje.map((s) => (
          <Barra key={s.id} rotulo={s.titulo || s.nome || s.id.slice(0, 8)} pct={(s.custoHoje / (totalHoje || 1)) * 100} cor={AGENTES[s.agente].cor} valor={fmtReais(s.custoHoje)} />
        ))}
      </Bloco>

      <Bloco titulo="Tipos de token" descricao={`Parte de cada tipo nos tokens dos últimos ${dados.dias} dias`}>
        {TIPOS_TOKEN.map((t) => (
          <Barra key={t.chave} rotulo={t.rotulo} pct={(dados.porTipo[t.chave] / (totalTipos || 1)) * 100} cor={t.cor} valor={fmtTokens(dados.porTipo[t.chave])} />
        ))}
      </Bloco>
    </div>
  )
}
