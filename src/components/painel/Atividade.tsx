import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { AGENTES, evento } from '@/lib/formato'
import type { EventoFeed } from '@/lib/tipos'
import { HaQuanto } from './comum'

const FILTROS: { id: string; rotulo: string; tipos: string[] | null }[] = [
  { id: 'todos', rotulo: 'Tudo', tipos: null },
  { id: 'pedido', rotulo: 'Pedidos', tipos: ['pedido'] },
  { id: 'edicao', rotulo: 'Edições', tipos: ['edicao'] },
  { id: 'comando', rotulo: 'Comandos', tipos: ['comando'] },
  { id: 'erro', rotulo: 'Erros', tipos: ['erro', 'aviso'] },
]

export function Atividade({ feed, aoAbrir }: { feed: EventoFeed[]; aoAbrir: (id: string) => void }) {
  const [filtro, setFiltro] = useState('todos')
  const itens = useMemo(() => {
    const f = FILTROS.find((x) => x.id === filtro)?.tipos
    const lista = (f ? feed.filter((e) => f.includes(e.tipo)) : feed).slice(0, 80)
    const vistos = new Map<string, number>()
    return lista.map((e) => {
      const base = `${e.sessao}|${e.t}|${e.tipo}|${e.texto.slice(0, 24)}`
      const n = vistos.get(base) || 0
      vistos.set(base, n + 1)
      return { e, chave: `${base}|${n}` }
    })
  }, [feed, filtro])

  return (
    <div className="grid gap-2">
      <div className="flex gap-1 px-4">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={cn('rounded-md px-2 py-1 text-xs transition-colors', filtro === f.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {f.rotulo}
          </button>
        ))}
      </div>
      <ul className="grid px-2 pb-2">
        <AnimatePresence initial={false} mode="popLayout">
          {itens.map(({ e, chave }) => {
            const ev = evento(e.tipo)
            return (
              <motion.li
                key={chave}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                <button onClick={() => aoAbrir(e.sessao)} className="flex w-full gap-2.5 rounded-md px-2 py-2 text-left hover:bg-accent/40">
                  <ev.Icone className="mt-0.5 size-3.5 shrink-0" style={{ color: ev.cor }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="size-1.5 shrink-0 rounded-full" style={{ background: AGENTES[e.agente].cor }} />
                      <span className="truncate">{e.rotulo}</span>
                      <HaQuanto t={e.t} className="ml-auto shrink-0" />
                    </div>
                    <p className={cn('line-clamp-2 text-xs leading-relaxed', ['comando', 'edicao', 'leitura', 'busca'].includes(e.tipo) && 'font-mono')}>{e.texto}</p>
                  </div>
                </button>
              </motion.li>
            )
          })}
        </AnimatePresence>
        {itens.length === 0 && <li className="py-10 text-center text-sm text-muted-foreground">Nada por aqui ainda.</li>}
      </ul>
    </div>
  )
}
