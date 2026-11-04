import { AnimatePresence, motion } from 'motion/react'
import { Circle, CircleAlert, CircleCheck, CircleDot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AGENTES, TAREFA, statusDaTarefa, tarefa } from '@/lib/formato'
import type { Sessao } from '@/lib/tipos'
import { ProgressoChecklist } from './CartaoSessao'
import { Validar } from './Validar'

const ICONE = { validar: CircleAlert, in_progress: CircleDot, pending: Circle, completed: CircleCheck } as Record<string, typeof Circle>

// checklists das sessões, cada item agrupado pela cor do status: em andamento, pendente, concluída
// terminalDe: sessão aberta num terminal do canvas -> id do terminal (só essas recebem a resposta da validação)
export function Checklists({ sessoes, aoAbrir, terminalDe }: { sessoes: Sessao[]; aoAbrir: (id: string) => void; terminalDe?: Map<string, string> }) {
  const com = sessoes.filter((s) => s.checklist.length)
  if (!com.length) {
    return (
      <div className="grid gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
        <p>Nenhuma sessão com checklist nas últimas 24 h.</p>
        <p className="text-xs">Quando um agente separa a demanda em tarefas, elas aparecem aqui e são marcadas sozinhas.</p>
      </div>
    )
  }
  return (
    <div className="grid gap-6 px-4 pb-4">
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {Object.values(TAREFA).map((t) => (
          <span key={t.rotulo} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: t.cor }} />{t.rotulo}</span>
        ))}
      </div>
      {com.map((s) => {
        const itens = s.checklist.map((x) => ({ ...x, st: statusDaTarefa(x) })).sort((a, b) => tarefa(a.st).ordem - tarefa(b.st).ordem || Number(a.id) - Number(b.id))
        const feitas = s.checklist.filter((x) => x.status === 'completed').length
        return (
          <section key={s.id} className="grid gap-2">
            <button onClick={() => aoAbrir(s.id)} className="flex items-center gap-2 text-left text-xs">
              <span className="size-1.5 rounded-full" style={{ background: AGENTES[s.agente].cor }} />
              <span className="min-w-0 flex-1 truncate font-medium">{s.titulo || s.nome}</span>
              <span className="font-mono text-muted-foreground">{feitas}/{s.checklist.length}</span>
            </button>
            <ProgressoChecklist itens={s.checklist} />
            <ul className="grid">
              <AnimatePresence initial={false}>
                {itens.map((x) => {
                  const t = tarefa(x.st)
                  const Icone = ICONE[x.st] || Circle
                  return (
                    <motion.li
                      key={x.id}
                      layout
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      className="grid gap-1.5 py-1 text-xs"
                    >
                      <div className="flex items-start gap-2">
                        <motion.span key={x.st} initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="mt-px">
                          <Icone className={cn('size-3.5', ['in_progress', 'validar'].includes(x.st) && 'animate-pulse')} style={{ color: t.cor }} />
                        </motion.span>
                        <span className={cn('leading-snug', x.status === 'completed' && 'text-muted-foreground line-through decoration-muted-foreground/40')}>{x.titulo}</span>
                      </div>
                      {x.st === 'validar' && (
                        <div className="pl-5">
                          {terminalDe?.get(s.id)
                            ? <Validar terminal={terminalDe.get(s.id)!} titulo={x.titulo} />
                            : <p className="text-[11px] text-muted-foreground">Sessão aberta fora do canvas: responda no terminal dela.</p>}
                        </div>
                      )}
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
          </section>
        )
      })}
    </div>
  )
}
