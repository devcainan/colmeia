import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowDownUp, Search } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useJson } from '@/lib/dados'
import { AGENTES, dataHora, duracao, fmtInteiro, fmtReais, fmtTokens, nomeModelo } from '@/lib/formato'
import type { Agente, Sessao } from '@/lib/tipos'
import { AgenteBadge, HaQuanto, StatusBadge } from './comum'

type Ordem = 'ultima' | 'tokens' | 'custo' | 'duracao'

export function Historico({ agente, projeto, aoAbrir }: { agente: Agente | 'todos'; projeto: string; aoAbrir: (id: string) => void }) {
  const lista = useJson<Sessao[]>('/api/historico', 20000)
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('ultima')

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const f = (lista || []).filter((s) =>
      (agente === 'todos' || s.agente === agente) &&
      (projeto === 'todos' || s.projeto === projeto) &&
      (!q || [s.titulo, s.projeto, s.modelo, s.branch, s.nome, s.ultimoPedido].some((x) => x?.toLowerCase().includes(q))))
    const dur = (s: Sessao) => (s.ultima || 0) - (s.inicio || 0)
    return f.sort((a, b) => ordem === 'tokens' ? b.totalComSub - a.totalComSub : ordem === 'custo' ? b.custoComSub - a.custoComSub : ordem === 'duracao' ? dur(b) - dur(a) : (b.ultima || 0) - (a.ultima || 0))
  }, [lista, busca, ordem, agente, projeto])

  const max = Math.max(1, ...linhas.map((s) => s.totalComSub))
  const soma = linhas.reduce((a, s) => a + s.totalComSub, 0)
  const somaCusto = linhas.reduce((a, s) => a + s.custoComSub, 0)

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título, projeto, modelo, branch, pedido" className="pl-8" />
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-xs">
          <ArrowDownUp className="mx-1 size-3.5 text-muted-foreground" />
          {([['ultima', 'Recentes'], ['custo', 'Mais uso'], ['tokens', 'Mais tokens'], ['duracao', 'Mais longas']] as [Ordem, string][]).map(([k, r]) => (
            <button key={k} onClick={() => setOrdem(k)} className={`rounded-md px-2.5 py-1 font-medium transition-colors ${ordem === k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{r}</button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {linhas.length} sessões · <span className="font-mono">{fmtTokens(soma)}</span> tokens · <span className="font-mono text-foreground">{fmtReais(somaCusto)}</span> em valor de API
        </span>
      </div>
      {!lista ? (
        <div className="grid gap-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Sessão</TableHead>
              <TableHead>Projeto</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead className="text-right">Respostas</TableHead>
              <TableHead className="w-48">Tokens</TableHead>
              <TableHead className="text-right">Valor API</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4 text-right">Última</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((s, i) => (
              <motion.tr
                key={s.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 20) * 0.02 }}
                onClick={() => aoAbrir(s.id)}
                className="cursor-pointer border-b transition-colors hover:bg-muted/50"
              >
                <TableCell className="max-w-[380px] pl-4">
                  <div className="flex items-center gap-2">
                    <AgenteBadge agente={s.agente} />
                    <span className="truncate font-medium">{s.titulo || s.id.slice(0, 8)}</span>
                  </div>
                  {s.subagentes.length > 0 && <div className="mt-0.5 pl-1 text-[11px] text-muted-foreground">{s.subagentes.length} subagente(s)</div>}
                </TableCell>
                <TableCell className="text-muted-foreground">{s.projeto}</TableCell>
                <TableCell className="font-mono text-xs">{nomeModelo(s.modelo)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{dataHora(s.inicio)}</TableCell>
                <TableCell className="text-xs">{duracao((s.ultima || 0) - (s.inicio || 0))}</TableCell>
                <TableCell className="text-right font-mono text-xs">{fmtInteiro(s.respostas)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${(s.totalComSub / max) * 100}%`, background: AGENTES[s.agente].cor }} />
                    </div>
                    <span className="w-16 text-right font-mono text-xs">{fmtTokens(s.totalComSub)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-xs font-medium" style={{ color: AGENTES[s.agente].cor }}>{fmtReais(s.custoComSub)}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
                <TableCell className="pr-4 text-right text-xs text-muted-foreground"><HaQuanto t={s.ultima} /></TableCell>
              </motion.tr>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
