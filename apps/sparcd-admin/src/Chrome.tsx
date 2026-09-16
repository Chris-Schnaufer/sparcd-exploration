import { type ReactNode } from 'react'
import { BrandSwitcher, ConnectionChip, type Theme } from '@sparcd/auth-ui'

export type AdminSection = 'species' | 'locations' | 'settings'

const sections: { id: AdminSection; label: string }[] = [
  { id: 'species', label: 'Species' },
  { id: 'locations', label: 'Locations' },
  { id: 'settings', label: 'Settings' },
]

export function Chrome({
  identity,
  theme,
  section,
  onSectionChange,
  onToggleTheme,
  onDisconnect,
  children,
}: {
  identity: string
  theme: Theme
  section: AdminSection
  onSectionChange: (section: AdminSection) => void
  onToggleTheme: () => void
  onDisconnect: () => void
  children: ReactNode
}) {
  const navigation = (compact = false) => (
    <nav className={compact ? 'md:hidden shrink-0 bg-panel border-b border-rule flex items-stretch px-2' : 'hidden md:flex items-stretch'} aria-label="Sections">
      {sections.map((item) => {
        const active = item.id === section
        return (
          <button
            type="button"
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            aria-current={active ? 'page' : undefined}
            className={`relative ${compact ? 'flex-1 min-h-11 px-3' : 'px-4'} text-[14px] font-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent -outline-offset-2 ${
              active ? 'text-ink font-[600]' : 'text-inkSoft hover:text-ink'
            }`}
          >
            {item.label}
            {active && <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-ink" />}
          </button>
        )
      })}
    </nav>
  )

  return (
    <div className="min-h-[100svh] flex flex-col bg-paper">
      <header className="min-h-14 shrink-0 bg-panel border-b border-rule flex flex-wrap items-center gap-y-2 py-2 px-4 md:h-14 md:flex-nowrap md:items-stretch md:py-0">
        <div className="flex items-center pr-6"><BrandSwitcher toolName="Admin" /></div>
        <select
          aria-label="Section"
          value={section}
          onChange={(event) => onSectionChange(event.target.value as AdminSection)}
          className="md:hidden min-h-11 bg-panel text-ink text-[14px] font-body border border-rule px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {sections.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        {navigation()}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          <ConnectionChip identity={identity || undefined} onDisconnect={onDisconnect} />
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-11 h-11 sm:w-8 sm:h-8 grid place-items-center border border-rule text-inkSoft hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            aria-label={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
            title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
          >
            <span aria-hidden>{theme === 'light' ? '☾' : '☀'}</span>
          </button>
        </div>
      </header>
      {navigation(true)}
      <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
    </div>
  )
}
