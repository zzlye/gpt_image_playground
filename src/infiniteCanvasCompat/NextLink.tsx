import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { useRouter } from './nextNavigation'

type NextLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | { pathname?: string }
  children?: ReactNode
}

export default function Link({ href, children, onClick, ...props }: NextLinkProps) {
  const router = useRouter()
  const resolvedHref = typeof href === 'string' ? href : href.pathname || '#'

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || resolvedHref.startsWith('http')) return
    event.preventDefault()
    router.push(resolvedHref)
  }

  return (
    <a href={resolvedHref} onClick={handleClick} {...props}>
      {children}
    </a>
  )
}
