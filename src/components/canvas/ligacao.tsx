import { useEffect, useState } from 'react'
import { getBezierPath, useConnection, type ConnectionLineComponentProps } from '@xyflow/react'
import { Link2 } from 'lucide-react'

const ENCAIXE = 'var(--ok)'

/** Elástico da ligação: perto de um ponto de outro nó ele encaixa (linha cheia, anel verde e aviso). */
export function LinhaDeLigacao({ fromX, fromY, toX, toY, fromPosition, toPosition, connectionStatus, toHandle }: ConnectionLineComponentProps) {
  const [d] = getBezierPath({ sourceX: fromX, sourceY: fromY, sourcePosition: fromPosition, targetX: toX, targetY: toY, targetPosition: toPosition })
  const encaixou = connectionStatus === 'valid' && !!toHandle
  const cor = encaixou ? ENCAIXE : 'var(--muted-foreground)'
  return (
    <g>
      <path d={d} fill="none" stroke={cor} strokeWidth={encaixou ? 3 : 2} strokeDasharray={encaixou ? undefined : '6 5'} />
      {encaixou ? (
        <g transform={`translate(${toX}, ${toY})`}>
          <circle r={18} fill="none" stroke={ENCAIXE} strokeWidth={2} className="encaixe-pulso" />
          <circle r={11} fill={`color-mix(in oklch, ${ENCAIXE} 25%, transparent)`} stroke={ENCAIXE} strokeWidth={2} />
          <circle r={4} fill={ENCAIXE} />
          <text x={24} y={4} fontSize={12} fontWeight={600} fill={ENCAIXE}>soltar para ligar</text>
        </g>
      ) : (
        <circle cx={toX} cy={toY} r={4} fill={cor} />
      )}
    </g>
  )
}

/**
 * O nó é o destino da ligação que está sendo puxada? (mouse em cima dele ou o elástico encaixado num ponto dele)
 * Devolve as props de ponteiro para pôr na raiz do nó.
 */
export function useAcoplamento(id: string) {
  // chave em texto: só re-renderiza quando muda a origem ou o ponto encaixado, não a cada movimento
  const chave = useConnection((c) => (c.inProgress ? `${c.fromNode?.id ?? ''}|${c.toNode?.id ?? ''}` : ''))
  const [sobre, setSobre] = useState(false)
  useEffect(() => { if (!chave) setSobre(false) }, [chave])
  const [origem, encaixado] = chave.split('|')
  const ativo = !!chave && origem !== id && (sobre || encaixado === id)
  return { ativo, props: { onPointerEnter: () => setSobre(true), onPointerLeave: () => setSobre(false) } }
}

/** Selo e contorno verdes no nó de destino enquanto a ligação está sendo puxada. */
export function Encaixe({ ativo }: { ativo: boolean }) {
  if (!ativo) return null
  return (
    <>
      <span className="pointer-events-none absolute -inset-1.5 z-10 rounded-2xl border-2 encaixe-borda" style={{ borderColor: ENCAIXE }} />
      <span className="pointer-events-none absolute -top-3.5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white shadow-lg" style={{ background: ENCAIXE }}>
        <Link2 className="size-3" />soltar para ligar
      </span>
    </>
  )
}
