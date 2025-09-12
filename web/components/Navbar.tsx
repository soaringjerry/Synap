"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale } from 'next-intl'

export function Navbar() {
  const pathname = usePathname()
  const locale = useLocale()
  const nav = [
    { href: `/${locale}`, label: 'Home' },
    { href: `/${locale}/explore`, label: 'Explore' },
    { href: `/${locale}/dashboard`, label: 'Dashboard' },
    { href: `/${locale}/settings`, label: 'Settings' }
  ]
  return (
    <nav className="flex items-center justify-between gap-4">
      <div className="brand text-xl">Synap</div>
      <div className="flex items-center gap-2">
        {nav.map(i => (
          <Link key={i.href} href={i.href} className={`btn btn-ghost ${pathname===i.href? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}>{i.label}</Link>
        ))}
      </div>
    </nav>
  )
}

