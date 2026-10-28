import { useEffect, useState } from 'react'

export type Route =
  | { name: 'grid' }
  | { name: 'new' }
  | { name: 'detail'; id: string }
  | { name: 'edit'; id: string }

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/'
  if (path === '/' || path === '') return { name: 'grid' }
  if (path === '/new') return { name: 'new' }
  const edit = /^\/p\/([^/]+)\/edit$/.exec(path)
  if (edit?.[1]) return { name: 'edit', id: safeDecode(edit[1]) }
  const detail = /^\/p\/([^/]+)$/.exec(path)
  if (detail?.[1]) return { name: 'detail', id: safeDecode(detail[1]) }
  return { name: 'grid' }
}

export function routeHash(route: Route): string {
  if (route.name === 'grid') return '/'
  if (route.name === 'new') return '/new'
  if (route.name === 'detail') return `/p/${encodeURIComponent(route.id)}`
  return `/p/${encodeURIComponent(route.id)}/edit`
}

export function href(route: Route): string {
  return `#${routeHash(route)}`
}

export function go(route: Route): void {
  const next = routeHash(route)
  const current = window.location.hash.replace(/^#/, '') || '/'
  if (current !== next) window.location.hash = next
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
