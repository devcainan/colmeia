import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Confirmar, type Pergunta } from '@/components/canvas/Confirmar'
import { enviar } from '@/lib/dados'
import type { Retrato } from '@/lib/tipos'

/** Aparece quando o GitHub tem versão nova: puxa, instala o que mudou e reinicia o painel. */
export function Atualizar({ a }: { a: NonNullable<Retrato['atualizacao']> }) {
  const [pergunta, setPergunta] = useState<Pergunta | null>(null)
  const [indo, setIndo] = useState(false)
  const novidade = `${a.atras === 1 ? '1 atualização' : `${a.atras} atualizações`} no GitHub: ${a.titulo}`

  const perguntar = (titulo: string, linhas: string[], botao: string) => setPergunta({
    titulo, linhas, botao,
    responder: async (sim) => {
      setPergunta(null)
      if (!sim) return
      setIndo(true)
      // deu certo: o painel reinicia e a página volta sozinha
      try { await enviar('POST', '/api/atualizar') } catch (e) {
        setIndo(false)
        perguntar('Não deu para atualizar', [(e as Error).message, 'Nada foi mudado nesta Colmeia.'], 'Tentar de novo')
      }
    },
  })

  return (
    <>
      <Button size="sm" className="ml-auto shrink-0 md:ml-0" disabled={indo} title={novidade}
        onClick={() => perguntar('Atualizar a Colmeia?', [novidade, 'O painel reinicia: os terminais reabrem sozinhos e quem estava trabalhando continua de onde parou.'], 'Atualizar')}>
        <Download />{indo ? 'Atualizando…' : 'Atualizar'}
      </Button>
      {pergunta && <Confirmar pergunta={pergunta} />}
    </>
  )
}
