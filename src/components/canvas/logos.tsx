import type { CSSProperties } from 'react'

export type Icone = (props: { className?: string; style?: CSSProperties }) => React.ReactNode

// raios da estrela do Claude: comprimentos alternados, como na marca
const RAIOS = [10.6, 8.4, 10, 8.8, 10.8, 8.2, 10.2, 9, 10.6, 8.4, 10.4, 8.8]

/** Marca do Codex / OpenAI (rosácea de seis pétalas entrelaçadas), na cor do texto atual. */
export const LogoCodex: Icone = ({ className, style }) => (
  <svg viewBox="0 0 24 24" className={className} style={style} fill="none" stroke="currentColor" strokeWidth={1.7} aria-label="Codex" role="img">
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <rect key={i} x={8.3} y={2.6} width={7.4} height={11.2} rx={3.7} transform={`rotate(${i * 60} 12 12)`} />
    ))}
  </svg>
)

/** Marca do Claude (estrela de raios), na cor do texto atual. */
export const LogoClaude: Icone = ({ className, style }) => (
  <svg viewBox="0 0 24 24" className={className} style={style} fill="currentColor" aria-label="Claude" role="img">
    {RAIOS.map((r, i) => (
      <rect key={i} x={10.9} y={12 - r} width={2.2} height={r - 1.6} rx={1.1} transform={`rotate(${i * 30 + (i % 2 ? 4 : 0)} 12 12)`} />
    ))}
    <circle cx={12} cy={12} r={2.4} />
  </svg>
)
