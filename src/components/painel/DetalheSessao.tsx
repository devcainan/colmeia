import { motion } from 'motion/react'
import { Cpu, FolderOpen, GitBranch, Hash } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useJson } from '@/lib/dados'
import { AGENTES, TIPOS_TOKEN, dataHora, duracao, evento, fmtInteiro, fmtReais, fmtTokens, mistura, nomeModelo, tipoDaFerramenta } from '@/lib/formato'
import type { Detalhe } from '@/lib/tipos'
import { AgenteBadge, BarraTokens, HaQuanto, IconeEvento, PontoStatus, StatusBadge } from './comum'

export function DetalheSessao({ id, aoFechar, aoAbrir }: { id: string | null; aoFechar: () => void; aoAbrir: (id: string) => void }) {
  const d = useJson<Detalhe>(id ? `/api/sessao/${encodeURIComponent(id)}` : null, 3000)
  const pronto = d && d.id === id
  return (
    <Sheet open={!!id} onOpenChange={(v) => !v && aoFechar()}>
      <SheetContent className="gap-0 overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        {!pronto ? (
          <div className="grid gap-3 p-6">
            <SheetHeader className="p-0"><SheetTitle>Carregando sessão</SheetTitle><SheetDescription>Lendo a conversa</SheetDescription></SheetHeader>
            <Skeleton className="h-8 w-2/3" /><Skeleton className="h-24" /><Skeleton className="h-64" />
          </div>
        ) : (
          <div className="h-full overflow-x-hidden overflow-y-auto">
            <div className="absolute inset-x-0 top-0 h-1" style={{ background: AGENTES[d.agente].cor }} />
            <SheetHeader className="gap-3 p-6 pb-4">
              <div className="flex items-center gap-2 pr-8">
                <AgenteBadge agente={d.agente} />
                <StatusBadge status={d.status} />
                <span className="ml-auto font-mono text-xs text-muted-foreground">{d.nome || d.id.slice(0, 8)}</span>
              </div>
              <SheetTitle className="text-xl leading-snug">{d.titulo || 'Sem título'}</SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span className="flex items-center gap-1"><FolderOpen className="size-3.5" />{d.pasta || d.projeto}</span>
                  {d.branch && <span className="flex items-center gap-1"><GitBranch className="size-3.5" />{d.branch}</span>}
                  <span className="flex items-center gap-1"><Cpu className="size-3.5" />{nomeModelo(d.modelo)}</span>
                  {d.pid && <span className="flex items-center gap-1"><Hash className="size-3.5" />pid {d.pid} · v{d.versao}</span>}
                </div>
              </SheetDescription>
            </SheetHeader>

            <div className="grid grid-cols-2 gap-2 px-6 sm:grid-cols-5">
              {[
                { r: 'Uso (valor API)', v: fmtReais(d.custoComSub), c: AGENTES[d.agente].cor },
                { r: 'Tokens', v: fmtTokens(d.totalComSub), c: 'var(--tk-saida)' },
                { r: 'Respostas', v: fmtInteiro(d.respostas), c: 'var(--tk-entrada)' },
                { r: 'Arquivos editados', v: fmtInteiro(d.nArquivos), c: 'var(--ev-edicao)' },
                { r: 'Erros', v: fmtInteiro(d.erros), c: 'var(--ev-erro)' },
              ].map((x, i) => (
                <motion.div
                  key={x.r}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-xl p-3"
                  style={{ background: mistura(x.c, 10), boxShadow: `inset 0 0 0 1px ${mistura(x.c, 22)}` }}
                >
                  <div className="text-[11px] text-muted-foreground">{x.r}</div>
                  <div className="font-mono text-lg font-semibold" style={{ color: x.c }}>{x.v}</div>
                </motion.div>
              ))}
            </div>

            <div className="grid gap-2 px-6 pt-4">
              <BarraTokens tokens={d.tokens} viva={d.status === 'trabalhando'} className="h-2.5" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                {TIPOS_TOKEN.map((t) => (
                  <div key={t.chave} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-2 rounded-sm" style={{ background: t.cor }} />{t.rotulo}</span>
                    <span className="font-mono">{fmtTokens(d.tokens[t.chave])}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 text-[11px] text-muted-foreground">
                <span>Início {dataHora(d.inicio)}</span>
                <span>Última atividade <HaQuanto t={d.ultima} /></span>
                <span>Duração {duracao((d.ultima || 0) - (d.inicio || 0))}</span>
              </div>
            </div>

            <Tabs defaultValue="atividade" className="px-6 py-5">
              <TabsList className="w-full">
                <TabsTrigger value="atividade">Atividade</TabsTrigger>
                <TabsTrigger value="arquivos">Arquivos ({d.arquivos.length})</TabsTrigger>
                <TabsTrigger value="ferramentas">Ferramentas</TabsTrigger>
                <TabsTrigger value="subagentes">Subagentes ({d.subagentes.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="atividade" className="mt-3">
                <ol className="relative grid gap-1 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-border">
                  {d.eventos.map((e, i) => (
                    <li key={`${e.t}-${i}`} className="relative flex gap-3 py-1.5">
                      <IconeEvento tipo={e.tipo} className="z-10 ring-4 ring-background" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="font-medium" style={{ color: evento(e.tipo).cor }}>{evento(e.tipo).rotulo}</span>
                          {e.ferramenta && <span className="text-muted-foreground">{e.ferramenta}</span>}
                          <span className="ml-auto text-muted-foreground">{new Date(e.t).toLocaleTimeString('pt-BR')}</span>
                        </div>
                        <p className="text-xs leading-relaxed break-words">{e.texto}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </TabsContent>

              <TabsContent value="arquivos" className="mt-3 grid gap-1">
                {d.arquivos.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum arquivo editado.</p>}
                {d.arquivos.map((a) => (
                  <div key={a.arq} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/50">
                    <span className="h-5 w-1 rounded-full" style={{ background: 'var(--ev-edicao)' }} />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{a.arq}</span>
                    <span className="font-mono text-xs text-muted-foreground">{a.n}×</span>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="ferramentas" className="mt-3 grid gap-2">
                {d.ferramentas.map(([n, c]) => {
                  const cor = evento(tipoDaFerramenta(n)).cor
                  const max = d.ferramentas[0]?.[1] || 1
                  return (
                    <div key={n} className="grid gap-1">
                      <div className="flex justify-between text-xs"><span className="font-mono">{n.replace(/^mcp__/, '')}</span><span className="font-mono text-muted-foreground">{fmtInteiro(c)}</span></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${(c / max) * 100}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="h-full rounded-full" style={{ background: cor }} />
                      </div>
                    </div>
                  )
                })}
              </TabsContent>

              <TabsContent value="subagentes" className="mt-3 grid gap-1">
                {d.subagentes.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Sem subagentes.</p>}
                {d.subagentes.map((x) => (
                  <button key={x.id} onClick={() => aoAbrir(x.id)} className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted/50">
                    <PontoStatus status={x.status} />
                    <span className="min-w-0 flex-1 truncate text-sm">{x.titulo || x.nome || x.id.slice(-8)}</span>
                    {x.nome && <span className="text-xs text-muted-foreground">{x.nome}</span>}
                    <span className="text-xs text-muted-foreground">{nomeModelo(x.modelo)}</span>
                    <span className="w-16 text-right font-mono text-xs">{fmtTokens(x.total)}</span>
                    <span className="w-20 text-right font-mono text-xs">{fmtReais(x.custo)}</span>
                  </button>
                ))}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
