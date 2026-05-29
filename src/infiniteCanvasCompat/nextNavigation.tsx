import { createContext, useContext, type ReactNode } from 'react'

export type CanvasRoute = {
  pathname: string
  params: Record<string, string>
}

type CanvasNavigationValue = CanvasRoute & {
  navigate: (href: string) => void
  backToHome: () => void
}

const CanvasNavigationContext = createContext<CanvasNavigationValue | null>(null)

export function CanvasNavigationProvider({
  children,
  value,
}: {
  children: ReactNode
  value: CanvasNavigationValue
}) {
  return <CanvasNavigationContext.Provider value={value}>{children}</CanvasNavigationContext.Provider>
}

function useCanvasNavigation() {
  const value = useContext(CanvasNavigationContext)
  if (!value) throw new Error('CanvasNavigationProvider is missing')
  return value
}

export function useRouter() {
  const navigation = useCanvasNavigation()
  return {
    push: navigation.navigate,
    replace: navigation.navigate,
    back: navigation.backToHome,
    refresh: () => undefined,
    prefetch: async () => undefined,
  }
}

export function useParams<T extends Record<string, string> = Record<string, string>>() {
  return useCanvasNavigation().params as T
}

export function usePathname() {
  return useCanvasNavigation().pathname
}
