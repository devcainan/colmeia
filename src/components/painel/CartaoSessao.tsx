import { motion } from 'motion/react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AGENTES, STATUS, corContexto, evento, fmtPct, fmtReais, fmtTokens, nomeModelo, statusDaTarefa, tarefa } from '@/lib/formato'
import type { ItemChecklist, Sessao } from '@/lib/tipos'
import { Digitando, Faisca, HaQuanto, PontoStatus } from './comum'

// fixa: sem animação de posição (no canvas o nó se move e a animação deixava a barra "solta" por cima)
export function ProgressoChecklist({ itens, className, fixa }: { itens: ItemChecklist[]; className?: string; fixa?: boolean }) {
  if (!itens.length) return null
  const ordenados = [...itens].sort((a, b) => tarefa(statusDaTarefa(b)).ordem - tarefa(statusDaTarefa(a)).ordem)
  return (
    <div className={cn('flex h-1.5 gap-[2px]', className)}>
      {ordenados.map((x) => (
        <motion.div
          key={x.id}
          layout={!fixa}
          className={cn('flex-1 rounded-full', ['in_progress', 'validar'].includes(statusDaTarefa(x)) && 'animate-pulse')}
          style={{ background: tarefa(statusDaTarefa(x)).cor, opacity: statusDaTarefa(x) === 'pending' ? 0.35 : 1 }}
        />
      ))}
    </div>
  )
}

export function CartaoSessao({ s, aoAbrir }: { s: Sessao; aoAbrir: (id: string) => void }) {
  const cor = AGENTES[s.agente].cor
  const viva = s.status === 'trabalhando'
  const pctCtx = s.janela ? (s.contexto / s.janela) * 100 : 0
  const feitas = s.checklist.filter((x) => x.status === 'completed').length
  const atual = s.checklist.find((x) => statusDaTarefa(x) === 'validar') || s.checklist.find((x) => x.status === 'in_progress')
  const ev = s.fazendo ? evento(s.fazendo.tipo) : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
    >
      <Card
        role="button"
        tabIndex={0}
        onClick={() => aoAbrir(s.id)}
        onKeyDown={(e) => e.key === 'Enter' && aoAbrir(s.id)}
        className={cn('h-full cursor-pointer gap-4 px-5 py-5 transition-colors hover:bg-accent/40', viva && 'borda-viva')}
        style={{ ['--cor-viva' as string]: cor }}
      >
        <div className="flex items-center gap-2 text-xs">
          <span className="size-2 rounded-full" style={{ background: cor }} />
          <span className="font-medium" style={{ color: cor }}>{AGENTES[s.agente].rotulo}</span>
          <span className="truncate font-mono text-muted-foreground">{s.nome || s.id.slice(0, 8)}</span>
          <span className="ml-auto flex items-center gap-1.5" style={{ color: STATUS[s.status].cor }}>
            <PontoStatus status={s.status} />{STATUS[s.status].rotulo}
          </span>
        </div>

        <div className="grid gap-1">
          <h3 className="line-clamp-2 text-[15px] leading-snug font-medium">{s.titulo || 'Sem título ainda'}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {[s.projeto, s.branch, nomeModelo(s.modelo)].filter(Boolean).join(' · ')}
          </p>
        </div>

        {s.fazendo && ev && (
          <div className="flex items-center gap-2 text-xs">
            <ev.Icone className="size-3.5 shrink-0" style={{ color: ev.cor }} />
            <span className="shrink-0 text-muted-foreground">{s.fazendo.ferramenta}</span>
            <span className="min-w-0 flex-1 truncate font-mono">{s.fazendo.texto}</span>
            {viva ? <Digitando /> : <HaQuanto t={s.ultima} className="shrink-0 text-muted-foreground" />}
          </div>
        )}

        {s.checklist.length > 0 && (
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="truncate">{atual ? atual.titulo : feitas === s.checklist.length ? 'Checklist concluída' : 'Checklist'}</span>
              <span className="font-mono">{feitas}/{s.checklist.length}</span>
            </div>
            <ProgressoChecklist itens={s.checklist} />
          </div>
        )}

        <div className="mt-auto grid grid-cols-3 gap-3 border-t border-border/60 pt-4">
          <div className="grid gap-1">
            <span className="text-[11px] text-muted-foreground">Contexto</span>
            <span className="font-mono text-sm" style={{ color: corContexto(pctCtx) }}>{fmtPct(pctCtx)}</span>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, pctCtx)}%`, background: corContexto(pctCtx) }} />
            </div>
          </div>
          <div className="grid content-start gap-1">
            <span className="text-[11px] text-muted-foreground">Uso hoje</span>
            <span className="font-mono text-sm">{fmtReais(s.custoHoje)}</span>
          </div>
          <div className="grid content-start gap-1">
            <span className="text-[11px] text-muted-foreground">Tokens</span>
            <span className="font-mono text-sm">{fmtTokens(s.totalComSub)}</span>
          </div>
        </div>

        {s.faisca && <Faisca valores={s.faisca} cor={cor} className="h-5" />}
      </Card>
    </motion.div>
  )
}

export function LinhaEncerrada({ s, aoAbrir }: { s: Sessao; aoAbrir: (id: string) => void }) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={() => aoAbrir(s.id)}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40"
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: AGENTES[s.agente].cor }} />
      <span className="min-w-0 flex-1 truncate">{s.titulo || s.id.slice(0, 8)}</span>
      <span className="hidden text-xs text-muted-foreground md:inline">{nomeModelo(s.modelo)}</span>
      <span className="w-20 text-right font-mono text-xs text-muted-foreground tabular-nums">{fmtTokens(s.totalComSub)}</span>
      <span className="w-24 text-right font-mono text-xs tabular-nums">{fmtReais(s.custoComSub)}</span>
      <HaQuanto t={s.ultima} className="w-20 text-right text-xs text-muted-foreground" />
    </motion.button>
  )
}
