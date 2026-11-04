import { useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Icone } from './logos'
import { cn } from '@/lib/utils'

/** Item comum (acao) ou que abre um submenu ao passar o mouse (sub). */
export type ItemMenu = { rotulo: string; Icone?: Icone; acao?: () => void; sub?: ItemMenu[]; perigo?: boolean; cor?: string } | 'separador'
export type Menu = { x: number; y: number; titulo?: string; itens: ItemMenu[] }

const LARGURA = 230

function Linha({ it, aoFechar, aberto, onMouseEnter, onClick }: {
  it: Exclude<ItemMenu, 'separador'>; aoFechar: () => void; aberto?: boolean; onMouseEnter?: (e: React.MouseEvent<HTMLButtonElement>) => void; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button role="menuitem" aria-haspopup={it.sub ? 'menu' : undefined} aria-expanded={it.sub ? !!aberto : undefined}
      onMouseEnter={onMouseEnter}
      onClick={(e) => { if (it.sub) { onClick?.(e); return } aoFechar(); it.acao?.() }}
      className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent', aberto && 'bg-accent', it.perigo && 'text-destructive hover:bg-destructive/10')}>
      {it.Icone && <it.Icone className="size-3.5 shrink-0" style={it.cor ? { color: it.cor } : undefined} />}
      <span className="flex-1">{it.rotulo}</span>
      {it.sub && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
    </button>
  )
}

/** Menu do botão direito: abre onde o mouse está e fecha ao clicar fora, rolar ou apertar Esc. */
export function MenuContexto({ menu, aoFechar }: { menu: Menu; aoFechar: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [sub, setSub] = useState<{ i: number; x: number; y: number } | null>(null)
  useEffect(() => {
    const fora = (e: Event) => { if (!ref.current?.contains(e.target as globalThis.Node)) aoFechar() }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('pointerdown', fora, true)
    window.addEventListener('wheel', fora, true) // rolar dentro do menu (quando ele é comprido) não fecha
    window.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('pointerdown', fora, true)
      window.removeEventListener('wheel', fora, true)
      window.removeEventListener('keydown', tecla)
    }
  }, [aoFechar])

  // o submenu abre ao lado da linha; se não couber à direita, vai para a esquerda
  const abrir = (i: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    const qtd = (menu.itens[i] as Exclude<ItemMenu, 'separador'>).sub?.length || 0
    const x = r.right + LARGURA > window.innerWidth ? r.left - LARGURA : r.right + 2
    const y = Math.max(8, Math.min(r.top - 5, window.innerHeight - (qtd * 32 + 16)))
    setSub({ i, x, y })
  }
  const itensSub = sub ? (menu.itens[sub.i] as Exclude<ItemMenu, 'separador'>).sub || [] : []

  // não deixa o menu sair da tela
  const x = Math.min(menu.x, window.innerWidth - LARGURA)
  const y = Math.min(menu.y, window.innerHeight - (menu.itens.length * 32 + 48))
  return (
    <div ref={ref} onContextMenu={(e) => e.preventDefault()}>
      <div role="menu" className="fixed z-50 max-h-[calc(100vh-16px)] min-w-52 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95"
        style={{ left: x, top: Math.max(8, y) }}>
        {menu.titulo && <p className="truncate px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">{menu.titulo}</p>}
        {menu.itens.map((it, i) =>
          it === 'separador' ? <div key={i} className="my-1 h-px bg-border" /> : (
            <Linha key={i} it={it} aoFechar={aoFechar} aberto={sub?.i === i}
              onMouseEnter={(e) => (it.sub ? abrir(i, e.currentTarget) : setSub(null))}
              onClick={(e) => (sub?.i === i ? setSub(null) : abrir(i, e.currentTarget))} />
          ))}
      </div>
      {sub && itensSub.length > 0 && (
        <div role="menu" className="fixed z-50 max-h-[calc(100vh-16px)] min-w-48 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95"
          style={{ left: sub.x, top: sub.y }}>
          {itensSub.map((it, i) => (it === 'separador' ? <div key={i} className="my-1 h-px bg-border" /> : <Linha key={i} it={it} aoFechar={aoFechar} />))}
        </div>
      )}
    </div>
  )
}
