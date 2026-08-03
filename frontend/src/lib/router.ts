import { useEffect, useState } from 'react'

function parseHash(): string[] {
  const h = window.location.hash.replace(/^#\/?/, '')
  return h ? h.split('/').map(decodeURIComponent) : []
}

export function navigate(path: string): void {
  window.location.hash = `#/${path.replace(/^\/+/, '')}`
}

export function useHash(): string[] {
  const [parts, setParts] = useState<string[]>(parseHash)
  useEffect(() => {
    const onHash = () => setParts(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return parts
}
