import { motion } from 'motion/react'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { fmtInteiro, fmtReais, fmtTokens } from '@/lib/formato'
import type { Retrato } from '@/lib/tipos'
import { Numero } from './comum'

const fmtBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: v < 100 ? 2 : 0, maximumFractionDigits: v < 100 ? 2 : 0 })}`

interface Item {
  rotulo: string
  valor: number
  formatar: (n: number) => string
  detalhe: string
  vivo?: boolean
  dica?: React.ReactNode
}

const hora = (t: number | null) => (t ? new Date(t).toLocaleString('pt-BR', { weekday: new Date(t).toDateString() === new Date().toDateString() ? undefined : 'short', hour: '2-digit', minute: '2-digit' }) : '')

/** Os mesmos números do /usage do Claude Code: sessão de 5 h e semana. */
function planoClaude(dados: Retrato): Item {
  const p = dados.planoClaude
  const sessao = p?.limites.find((l) => l.nome.startsWith('Sessão'))
  const semana = p?.limites.find((l) => l.nome === 'Semana, todos os modelos')
  return {
    rotulo: 'Plano do Claude', valor: sessao?.pct ?? 0, formatar: (n) => (p?.limites.length ? `${Math.round(n)}%` : '-'),
    detalhe: !p ? 'lendo o /usage…' : p.erro && !p.limites.length ? p.erro : `sessão${sessao?.renova ? ` até ${hora(sessao.renova)}` : ''}${semana ? ` · semana ${semana.pct}%` : ''}`,
    dica: p?.limites.length ? (
      <>
        Os mesmos limites do /usage do Claude Code, lidos a cada 3 minutos.
        {p.limites.map((l) => <span key={l.nome} className="block">{l.nome}: {l.pct}%{l.renova ? `, renova ${hora(l.renova)}` : ''}</span>)}
      </>
    ) : undefined,
  }
}

export function Kpis({ dados }: { dados: Retrato }) {
  const r = dados.resumo
  const plano = dados.plano?.valorMensalReais || 0
  const lim = dados.limitesCodex
  // quantas vezes o uso em valor de API cabe no que se paga pelo plano no mesmo período
  const usoReais = dados.cotacao ? r.custoTotal * dados.cotacao.valor : 0
  const rende = plano && usoReais ? Math.round(usoReais / ((plano * dados.dias) / 30)) : 0

  const itens: Item[] = [
    { rotulo: 'Sessões abertas', valor: r.abertas, formatar: fmtInteiro, detalhe: `${r.sessoesPeriodo} em ${dados.dias} dias` },
    { rotulo: 'Trabalhando agora', valor: r.trabalhando, formatar: fmtInteiro, detalhe: r.subagentesAtivos ? `${r.subagentesAtivos} subagente(s)` : 'com subagentes', vivo: r.trabalhando > 0 },
    { rotulo: 'Uso hoje', valor: r.custoHoje, formatar: fmtReais, detalhe: `${fmtTokens(r.tokensHoje)} tokens` },
    { rotulo: `Uso em ${dados.dias} dias`, valor: r.custoTotal, formatar: fmtReais, detalhe: rende ? `plano rende ${rende}×` : `${fmtTokens(r.tokensTotal)} tokens` },
    {
      rotulo: 'Custo real', valor: plano, formatar: fmtBRL,
      detalhe: `${fmtBRL(plano / 30)} por dia${lim ? ` · Codex ${fmtInteiro(lim.usado)}% do limite` : ''}`,
      dica: (
        <>
          Custo real é o plano pago por mês. &quot;Uso&quot; é o consumo da IA convertido pelo preço público da API, para comparar sessões, modelos e dias.
          {dados.cotacao && <><br />Dólar R$ {dados.cotacao.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({dados.cotacao.fonte}).</>}
        </>
      ),
    },
    planoClaude(dados),
  ]

  return (
    <Card className="grid grid-cols-2 gap-0 p-0 md:grid-cols-3 xl:grid-cols-6">
      {itens.map((it, i) => {
        const corpo = (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.4 }}
            className={cn('grid gap-1 px-5 py-4', i > 0 && 'border-l border-border/60', it.dica && 'cursor-help')}
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {it.vivo && <span className="ponto-vivo size-1.5 rounded-full" style={{ color: 'var(--ok)', background: 'var(--ok)' }} />}
              {it.rotulo}
            </span>
            <Numero valor={it.valor} formatar={it.formatar} className="font-mono text-2xl font-medium tracking-tight" />
            <span className="truncate text-[11px] text-muted-foreground">{it.detalhe}</span>
          </motion.div>
        )
        return it.dica ? (
          <Tooltip key={it.rotulo}>
            <TooltipTrigger asChild>{corpo}</TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs leading-relaxed">{it.dica}</TooltipContent>
          </Tooltip>
        ) : <div key={it.rotulo}>{corpo}</div>
      })}
    </Card>
  )
}
