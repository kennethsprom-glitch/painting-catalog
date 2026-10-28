import { useEffect } from 'react'
import { CatalogProvider } from './catalog.tsx'
import { useCatalog } from './catalog-context.ts'
import { DetailScreen } from './screens/DetailScreen.tsx'
import { FormScreen } from './screens/FormScreen.tsx'
import { GridScreen } from './screens/GridScreen.tsx'
import { useRoute } from './router.ts'

export default function App() {
  return (
    <CatalogProvider>
      <div className="mx-auto min-h-dvh w-full max-w-5xl bg-background md:my-6 md:min-h-[calc(100dvh-3rem)] md:shadow-xl">
        <Shell />
      </div>
    </CatalogProvider>
  )
}

function Shell() {
  const route = useRoute()
  const { ready, error } = useCatalog()
  const routeKey = route.name === 'detail' || route.name === 'edit' ? `${route.name}:${route.id}` : route.name

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [routeKey])

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-serif text-2xl">The catalog couldn’t be opened</h1>
        <p className="mt-3 text-muted-foreground">
          {error} Storage in this browser may be blocked. Try a normal Safari tab instead of private browsing.
        </p>
      </div>
    )
  }

  if (!ready) {
    return (
      <p className="px-4 py-16 text-center text-muted-foreground" role="status">
        Opening the catalog…
      </p>
    )
  }

  if (route.name === 'new') return <FormScreen mode="new" />
  if (route.name === 'edit') return <FormScreen mode="edit" id={route.id} />
  if (route.name === 'detail') return <DetailScreen id={route.id} />
  return <GridScreen />
}
