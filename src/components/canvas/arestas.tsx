import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
import { Scissors } from 'lucide-react'
import { enviar } from '@/lib/dados'
import { passoLigacaoCortada, registrar } from './historico'

export type DadosAresta = { ligacao?: string; soltar?: string }

/** Corta a ligação: bloco ↔ terminal some; trabalhador ↔ líder (ou sessão) fica solto no canvas. */
export function cortar(d?: DadosAresta, de?: string, para?: string) {
  if (d?.ligacao) {
    void enviar('DELETE', `/api/ligacoes/${d.ligacao}`).then(() => { if (de && para) registrar(passoLigacaoCortada(de, para)) }).catch(() => {})
    return
  }
  if (d?.soltar) return void enviar('PATCH', `/api/terminais/${d.soltar}`, { soltar: true }).catch(() => {})
}

/** Ligação com tesoura no meio, como no n8n: aparece ao passar o mouse ou com a ligação selecionada. */
export function ArestaCortavel({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data, selected }: EdgeProps<Edge<DadosAresta>>) {
  const [caminho, x, y] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const [sobre, setSobre] = useState(false)
  const ver = sobre || selected
  return (
    <>
      <BaseEdge id={id} path={caminho} style={{ ...style, strokeWidth: ver ? 3 : (style?.strokeWidth ?? 2) }} markerEnd={markerEnd} />
      <path d={caminho} fill="none" stroke="transparent" strokeWidth={26} onMouseEnter={() => setSobre(true)} onMouseLeave={() => setSobre(false)} />
      <EdgeLabelRenderer>
        <button
          className="nodrag nopan absolute grid size-6 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow transition-opacity hover:border-destructive hover:text-destructive"
          style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, pointerEvents: 'all', opacity: ver ? 1 : 0 }}
          onMouseEnter={() => setSobre(true)} onMouseLeave={() => setSobre(false)}
          onClick={() => cortar(data, source, target)} title="Cortar ligação"
        >
          <Scissors className="size-3" />
        </button>
      </EdgeLabelRenderer>
    </>
  )
}

export const tiposDeAresta = { corte: ArestaCortavel }
