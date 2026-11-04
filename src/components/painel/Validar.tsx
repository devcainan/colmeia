import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { enviar } from '@/lib/dados'

const RESULTADO: Record<string, string> = {
  entregue: 'Resposta entregue ao agente',
  'na-fila': 'Vai ao agente quando ele parar',
  encerrado: 'Terminal encerrado: retome para responder',
}

/** Aprovar ou recusar um item [validar]: a resposta vai digitada no terminal do agente que pediu. */
export function Validar({ terminal, titulo }: { terminal: string; titulo: string }) {
  const [comentario, setComentario] = useState('')
  const [estado, setEstado] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const responder = async (aprovado: boolean) => {
    setEnviando(true)
    const pedido = titulo.replace(/^\[validar\]\s*/i, '')
    const texto = `[Aviso do painel] Validação de "${pedido}": ${aprovado ? 'APROVADO' : 'RECUSADO'} pelo usuário.${comentario.trim() ? ` Comentário: ${comentario.trim()}` : ''}`
    try {
      const r = await enviar<{ resultado: string }>('POST', `/api/terminais/${terminal}/entrada`, { texto, quandoParar: true })
      setEstado(`${aprovado ? 'Aprovado' : 'Recusado'}. ${RESULTADO[r.resultado] || r.resultado}`)
    } catch (e) {
      setEstado(`Erro: ${(e as Error).message}`)
    } finally {
      setEnviando(false)
    }
  }

  if (estado) return <p className="text-[11px] text-muted-foreground">{estado}</p>
  return (
    <div className="grid gap-1.5">
      <input
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        placeholder="Comentário (opcional)"
        className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-ring"
      />
      <div className="flex gap-1.5">
        <Button size="sm" disabled={enviando} onClick={() => void responder(true)} className="h-7 flex-1 gap-1 text-xs" style={{ background: 'var(--ok)', color: '#fff' }}>
          <Check className="size-3.5" /> Aprovar
        </Button>
        <Button size="sm" variant="outline" disabled={enviando} onClick={() => void responder(false)} className="h-7 flex-1 gap-1 text-xs">
          <X className="size-3.5" /> Recusar
        </Button>
      </div>
    </div>
  )
}
