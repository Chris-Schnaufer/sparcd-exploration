import { type ReactNode } from 'react'
import { BrandSwitcher, ConnectionChip, type Theme } from '@sparcd/auth-ui'

export function Chrome({
  identity,
  theme,
  onToggleTheme,
  onDisconnect,
  children,
}: {
  identity: string
  theme: Theme
  onToggleTheme: () => void
  onDisconnect: () => void
  children: ReactNode
}) {
  return (
    <div className="min-h-[100svh] flex flex-col bg-paper">
      <header className="min-h-14 shrink-0 bg-panel border-b border-rule flex flex-wrap items-center gap-y-2 py-2 px-4 md:h-14 md:flex-nowrap md:items-stretch md:py-0">
        <div className="flex items-center pr-6">
          <BrandSwitcher toolName="Admin" />
        </div>
        <span className="text-[14px] text-inkSoft">Configuration</span>
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
      <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
    </div>
  )
}
