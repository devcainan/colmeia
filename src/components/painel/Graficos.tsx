import { useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { evento, fmtInteiro, fmtReais, fmtTokens, temCotacao, tipoDaFerramenta } from '@/lib/formato'
import type { Retrato } from '@/lib/tipos'

interface ItemDica { name?: string | number; value?: number | string; color?: string; payload?: Record<string, unknown> }
interface PropsDica { active?: boolean; payload?: ItemDica[]; label?: string | number; titulo?: (l: string | number | undefined) => string; formatar?: (n: number) => string }

function Dica({ active, payload, label, titulo, formatar = fmtTokens }: PropsDica) {
  if (!active || !payload?.length) return null
  return (
    <div className="grid min-w-36 gap-1 rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium">{titulo ? titulo(label) : label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: (p.payload?.cor as string) || p.color }} />
            {String(p.name)}
          </span>
          <span className="font-mono">{formatar(Number(p.value))}</span>
        </div>
      ))}
    </div>
  )
}

const horaCurta = (t: number | string) => new Date(Number(t)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

const cfgHoras = {
  claude: { label: 'Claude', color: 'var(--claude)' },
  codex: { label: 'Codex', color: 'var(--codex)' },
} satisfies ChartConfig

export function Graficos({ dados }: { dados: Retrato }) {
  const [medida, setMedida] = useState<'tokens' | 'reais'>('reais')
  const emReais = medida === 'reais'
  const fmt = emReais ? fmtReais : fmtTokens
  const ferramentas = dados.ferramentas.slice(0, 10).map((f) => {
    const curto = f.nome.split('__').at(-1) || f.nome
    return { ...f, rotulo: curto.length > 12 ? curto.slice(0, 11) + '…' : curto, cor: evento(tipoDaFerramenta(f.nome)).cor }
  })

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <Card className="gap-4 py-5 xl:col-span-3">
        <CardHeader className="px-5">
          <CardTitle className="text-sm font-medium">{emReais ? 'Uso por hora' : 'Tokens por hora'}</CardTitle>
          <CardDescription className="text-xs">Últimas 24 h{emReais ? ', em valor de API' : ''}</CardDescription>
          <CardAction>
            <div className="flex rounded-md bg-muted p-0.5 text-xs">
              {(['reais', 'tokens'] as const).map((k) => (
                <button key={k} onClick={() => setMedida(k)} className={`rounded px-2 py-0.5 transition-colors ${medida === k ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
                  {k === 'tokens' ? 'Tokens' : temCotacao() ? 'R$' : 'US$'}
                </button>
              ))}
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="px-2">
          <ChartContainer config={cfgHoras} className="aspect-auto h-[240px] w-full">
            <AreaChart data={dados.serieHoras} margin={{ left: 4, right: 12, top: 8 }}>
              <defs>
                {(['claude', 'codex'] as const).map((k) => (
                  <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={`var(--color-${k})`} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={`var(--color-${k})`} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} strokeOpacity={0.4} />
              <XAxis dataKey="hora" tickFormatter={horaCurta} tickLine={false} axisLine={false} minTickGap={32} />
              <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} width={72} />
              <ChartTooltip content={<Dica titulo={(l) => horaCurta(l ?? 0)} formatar={fmt} />} />
              <Area dataKey={emReais ? 'codexUsd' : 'codex'} name="Codex" type="monotone" stackId="a" stroke="var(--color-codex)" strokeWidth={1.5} fill="url(#grad-codex)" animationDuration={800} />
              <Area dataKey={emReais ? 'claudeUsd' : 'claude'} name="Claude" type="monotone" stackId="a" stroke="var(--color-claude)" strokeWidth={1.5} fill="url(#grad-claude)" animationDuration={800} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="gap-4 py-5 xl:col-span-2">
        <CardHeader className="px-5">
          <CardTitle className="text-sm font-medium">Ferramentas mais usadas</CardTitle>
          <CardDescription className="text-xs">Sessões das últimas 24 h, cor pelo tipo de ação</CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <ChartContainer config={{}} className="aspect-auto h-[240px] w-full">
            <BarChart data={ferramentas} layout="vertical" margin={{ left: 4, right: 16 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="rotulo" tickLine={false} axisLine={false} width={96} tick={{ fontSize: 11 }} />
              <ChartTooltip cursor={false} content={<Dica titulo={(l) => String(l)} formatar={fmtInteiro} />} />
              <Bar dataKey="qtd" name="Usos" radius={4} barSize={12} animationDuration={800}>
                {ferramentas.map((f) => <Cell key={f.nome} fill={f.cor} />)}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}
