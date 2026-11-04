import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { KeyRound, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAgentes } from '@/lib/dados'
import { AGENTES } from '@/lib/formato'
import type { Agente } from '@/lib/tipos'
import { Atividade } from '@/components/painel/Atividade'
import { CartaoSessao, LinhaEncerrada } from '@/components/painel/CartaoSessao'
import { Checklists } from '@/components/painel/Checklists'
import { DetalheSessao } from '@/components/painel/DetalheSessao'
import { Graficos } from '@/components/painel/Graficos'
import { Historico } from '@/components/painel/Historico'
import { Kpis } from '@/components/painel/Kpis'
import { Porcentagens } from '@/components/painel/Porcentagens'
import { HaQuanto } from '@/components/painel/comum'
import { Canvas } from '@/components/canvas/Canvas'

function lerTema() {
  try { return localStorage.getItem('painel-tema') || 'dark' } catch { return 'dark' }
}

export default function App() {
  const { dados, conectado, semChave } = useAgentes()
  const [agente, setAgente] = useState<Agente | 'todos'>('todos')
  const [projeto, setProjeto] = useState('todos')
  const [aberta, setAberta] = useState<string | null>(null)
  const [tema, setTema] = useState(lerTema)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'dark')
    try { localStorage.setItem('painel-tema', tema) } catch { /* sem armazenamento */ }
  }, [tema])

  const projetos = useMemo(() => [...new Set((dados?.sessoes || []).map((s) => s.projeto))].sort(), [dados])
  const passa = (a: Agente, p: string) => (agente === 'todos' || a === agente) && (projeto === 'todos' || p === projeto)
  const sessoes = (dados?.sessoes || []).filter((s) => passa(s.agente, s.projeto))
  const abertas = sessoes.filter((s) => s.status !== 'fechada')
  const encerradas = sessoes.filter((s) => s.status === 'fechada')
  const feed = (dados?.feed || []).filter((e) => passa(e.agente, e.projeto))
  const comChecklist = sessoes.filter((s) => s.checklist.length).length
  // a aba fica guardada: se a página recarregar, volta onde estava
  const [aba, setAbaEstado] = useState(() => { try { return localStorage.getItem('painel-aba') || 'vivo' } catch { return 'vivo' } })
  const setAba = (a: string) => { setAbaEstado(a); try { localStorage.setItem('painel-aba', a) } catch { /* sem armazenamento */ } }
  const terminalDe = useMemo(() => new Map((dados?.canvas?.terminais || []).filter((t) => t.sessao).map((t) => [t.sessao!, t.id])), [dados])
  const nTerminais = dados?.canvas?.terminais.filter((t) => t.vivo).length || 0

  if (semChave) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <Card className="max-w-md items-center gap-3 p-8 text-center">
          <KeyRound className="size-6 text-muted-foreground" />
          <h1 className="font-medium">Chave do painel necessária</h1>
          <p className="text-sm text-muted-foreground">Abra pelo endereço com <code className="font-mono">?chave=</code> que aparece no terminal ao rodar <code className="font-mono">npm run dev</code>.</p>
        </Card>
      </div>
    )
  }

  const naTela = aba === 'canvas'
  return (
    <Tabs value={aba} onValueChange={setAba} className="min-h-screen gap-0">
      <header className="sticky top-0 z-30 h-12 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className={`mx-auto flex h-full items-center gap-3 px-4 sm:px-6 ${naTela ? '' : 'max-w-[1480px]'}`}>
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="flex gap-1">
              <span className="size-2 rounded-full" style={{ background: AGENTES.claude.cor }} />
              <span className="size-2 rounded-full" style={{ background: AGENTES.codex.cor }} />
            </span>
            <h1 className="text-sm font-medium">Colmeia</h1>
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <span className={`size-1.5 rounded-full ${conectado ? 'ponto-vivo' : ''}`} style={{ color: conectado ? 'var(--ok)' : 'var(--ev-erro)', background: 'currentColor' }} />
              {conectado ? <>ao vivo{dados && <> · <HaQuanto t={dados.geradoEm} /></>}</> : 'reconectando'}
            </span>
          </div>
          <TabsList variant="line" className="ml-2 h-full min-w-0 overflow-x-auto overflow-y-hidden">
            <TabsTrigger value="vivo">Ao vivo</TabsTrigger>
            <TabsTrigger value="canvas">Canvas{nTerminais ? ` · ${nTerminais}` : ''}</TabsTrigger>
            <TabsTrigger value="uso">Uso</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>
          <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex">
            <Select value={agente} onValueChange={(v) => setAgente(v as Agente | 'todos')}>
              <SelectTrigger size="sm" className="w-36 border-none bg-transparent shadow-none"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos agentes</SelectItem>
                <SelectItem value="claude">Claude</SelectItem>
                <SelectItem value="codex">Codex</SelectItem>
              </SelectContent>
            </Select>
            <Select value={projeto} onValueChange={setProjeto}>
              <SelectTrigger size="sm" className="w-40 border-none bg-transparent shadow-none"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos projetos</SelectItem>
                {projetos.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setTema(tema === 'dark' ? 'light' : 'dark')} aria-label="Trocar tema">
              {tema === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </div>
        </div>
      </header>

      {naTela ? (
        <div className="fixed inset-x-0 top-12 bottom-0">
          {dados?.canvas
            ? <Canvas canvas={dados.canvas} sessoes={dados.sessoes} visiveis={sessoes} tema={tema} aoAbrir={setAberta} />
            : <p className="grid h-full place-items-center text-sm text-muted-foreground">Carregando o canvas…</p>}
        </div>
      ) : (
      <main className="mx-auto grid max-w-[1480px] gap-6 px-4 py-6 sm:px-6">
        {!dados ? (
          <div className="grid gap-4">
            <Skeleton className="h-24 rounded-xl" />
            <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-80 rounded-xl lg:col-span-2" /><Skeleton className="h-80 rounded-xl" /></div>
            <p className="text-center text-sm text-muted-foreground">Lendo as conversas dos agentes…</p>
          </div>
        ) : (
          <>
            <Kpis dados={dados} />

              <TabsContent value="vivo">
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
                  <section className="grid content-start gap-4">
                    <h2 className="text-xs text-muted-foreground">Sessões abertas · {abertas.length}</h2>
                    <div className="grid gap-4 md:grid-cols-2">
                      <AnimatePresence mode="popLayout">
                        {abertas.map((s) => <CartaoSessao key={s.id} s={s} aoAbrir={setAberta} />)}
                      </AnimatePresence>
                      {abertas.length === 0 && <Card className="col-span-full items-center py-12 text-sm text-muted-foreground">Nenhuma sessão aberta agora.</Card>}
                    </div>
                    {encerradas.length > 0 && (
                      <div className="grid gap-1">
                        <h2 className="px-3 pt-2 text-xs text-muted-foreground">Encerradas nas últimas 24 h · {encerradas.length}</h2>
                        {encerradas.map((s) => <LinhaEncerrada key={s.id} s={s} aoAbrir={setAberta} />)}
                      </div>
                    )}
                  </section>

                  <Card className="gap-0 py-3 xl:sticky xl:top-20 xl:self-start">
                    <Tabs defaultValue="checklists" className="gap-3">
                      <TabsList variant="line" className="px-4">
                        <TabsTrigger value="checklists">Checklists{comChecklist ? ` · ${comChecklist}` : ''}</TabsTrigger>
                        <TabsTrigger value="atividade">Atividade</TabsTrigger>
                      </TabsList>
                      <ScrollArea className="h-[640px]">
                        <TabsContent value="checklists"><Checklists sessoes={sessoes} aoAbrir={setAberta} terminalDe={terminalDe} /></TabsContent>
                        <TabsContent value="atividade"><Atividade feed={feed} aoAbrir={setAberta} /></TabsContent>
                      </ScrollArea>
                    </Tabs>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="uso" className="grid gap-4">
                <Porcentagens dados={dados} />
                <Graficos dados={dados} />
              </TabsContent>

              <TabsContent value="historico">
                <Historico agente={agente} projeto={projeto} aoAbrir={setAberta} />
              </TabsContent>
          </>
        )}
      </main>
      )}

      <DetalheSessao id={aberta} aoFechar={() => setAberta(null)} aoAbrir={setAberta} />
    </Tabs>
  )
}
