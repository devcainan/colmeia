import { useEffect, useRef } from 'react'
import { animate } from 'motion/react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useTique } from '@/lib/dados'
import { AGENTES, STATUS, TIPOS_TOKEN, evento, fmtTokens, haQuanto, mistura } from '@/lib/formato'
import type { Agente, Status, Tokens } from '@/lib/tipos'

export function Numero({ valor, formatar = fmtTokens, className }: { valor: number; formatar?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const atual = useRef(0)
  useEffect(() => {
    const ctrl = animate(atual.current, valor, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        atual.current = v
        if (ref.current) ref.current.textContent = formatar(v)
      },
    })
    return () => ctrl.stop()
  }, [valor, formatar])
  return <span ref={ref} className={cn('tabular-nums', className)}>{formatar(atual.current)}</span>
}

export function HaQuanto({ t, className }: { t: number | null | undefined; className?: string }) {
  const agora = useTique(1000)
  return <span className={cn('tabular-nums', className)}>{haQuanto(t, agora)}</span>
}

export function AgenteBadge({ agente, className }: { agente: Agente; className?: string }) {
  const a = AGENTES[agente]
  return (
    <span
      className={cn('inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold tracking-wide uppercase', className)}
      style={{ color: a.cor, background: mistura(a.cor, 14), boxShadow: `inset 0 0 0 1px ${mistura(a.cor, 30)}` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: a.cor }} />
      {a.rotulo}
    </span>
  )
}

export function PontoStatus({ status, className }: { status: Status; className?: string }) {
  const s = STATUS[status]
  return (
    <span
      className={cn('inline-block size-2 shrink-0 rounded-full', status === 'trabalhando' && 'ponto-vivo', className)}
      style={{ color: s.cor, background: s.cor }}
    />
  )
}

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS[status]
  return (
    <span
      className="inline-flex h-6 items-center gap-2 rounded-full px-2.5 text-xs font-medium"
      style={{ color: s.cor, background: mistura(s.cor, 12) }}
    >
      <PontoStatus status={status} />
      {s.rotulo}
    </span>
  )
}

export function IconeEvento({ tipo, className }: { tipo: string; className?: string }) {
  const e = evento(tipo)
  return (
    <span
      className={cn('grid size-7 shrink-0 place-items-center rounded-lg', className)}
      style={{ color: e.cor, background: mistura(e.cor, 14) }}
    >
      <e.Icone className="size-3.5" />
    </span>
  )
}

export function BarraTokens({ tokens, viva, className }: { tokens: Tokens; viva?: boolean; className?: string }) {
  const total = TIPOS_TOKEN.reduce((a, t) => a + tokens[t.chave], 0) || 1
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn('flex h-2 w-full overflow-hidden rounded-full bg-muted', viva && 'brilho', className)}>
          {TIPOS_TOKEN.map((t) => (
            <div
              key={t.chave}
              className="h-full transition-[width] duration-700 ease-out"
              style={{ width: tokens[t.chave] ? `max(3px, ${(tokens[t.chave] / total) * 100}%)` : 0, background: t.cor }}
            />
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent className="grid gap-1 font-mono text-xs">
        {TIPOS_TOKEN.map((t) => (
          <div key={t.chave} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: t.cor }} />{t.rotulo}</span>
            <span>{fmtTokens(tokens[t.chave])}</span>
          </div>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}

export function LegendaTokens({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground', className)}>
      {TIPOS_TOKEN.map((t) => (
        <span key={t.chave} className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: t.cor }} />{t.rotulo}</span>
      ))}
    </div>
  )
}

export function Faisca({ valores, cor, className }: { valores: number[]; cor: string; className?: string }) {
  const max = Math.max(1, ...valores)
  return (
    <div className={cn('flex h-8 items-end gap-[2px]', className)}>
      {valores.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-[2px] transition-[height] duration-700 ease-out"
          style={{ height: `${Math.max(6, (v / max) * 100)}%`, background: v ? cor : mistura(cor, 18), opacity: v ? 0.35 + 0.65 * (i / valores.length) : 1 }}
        />
      ))}
    </div>
  )
}

export function Digitando() {
  return (
    <span className="digitando inline-flex gap-0.5 pl-1 align-middle">
      <span className="size-1 rounded-full bg-current" />
      <span className="size-1 rounded-full bg-current" />
      <span className="size-1 rounded-full bg-current" />
    </span>
  )
}
