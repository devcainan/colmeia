import { useEffect, useRef } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type Pergunta = { titulo: string; linhas: string[]; botao: string; responder: (sim: boolean) => void }

/** Aviso de "tem certeza?" no meio da tela. Enter confirma, Esc ou clicar fora cancela. */
export function Confirmar({ pergunta }: { pergunta: Pergunta }) {
  const botao = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    botao.current?.focus()
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return
      e.preventDefault()
      e.stopPropagation()
      pergunta.responder(e.key === 'Enter')
    }
    window.addEventListener('keydown', tecla, true) // antes do canvas, para o Esc/Enter não fazer mais nada
    return () => window.removeEventListener('keydown', tecla, true)
  }, [pergunta])

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 backdrop-blur-[2px] animate-in fade-in-0" onPointerDown={(e) => { if (e.target === e.currentTarget) pergunta.responder(false) }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirmar-titulo"
        className="grid w-full max-w-md gap-4 rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl animate-in zoom-in-95">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive"><TriangleAlert className="size-4.5" /></span>
          <div className="grid min-w-0 gap-1.5">
            <h2 id="confirmar-titulo" className="text-sm font-medium">{pergunta.titulo}</h2>
            {pergunta.linhas.map((l, i) => <p key={i} className="text-xs leading-relaxed text-muted-foreground">{l}</p>)}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => pergunta.responder(false)}>Cancelar</Button>
          <Button ref={botao} variant="destructive" size="sm" onClick={() => pergunta.responder(true)}>{pergunta.botao}</Button>
        </div>
      </div>
    </div>
  )
}
