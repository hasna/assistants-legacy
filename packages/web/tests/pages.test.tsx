import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock next/navigation (used by useAutoRefresh and some components)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

// Mock useAutoRefresh hook (uses next/navigation internally)
vi.mock('@/hooks/use-auto-refresh', () => ({
  useAutoRefresh: () => ({ refresh: vi.fn() }),
}))

// Mock the page.tsx server component imports that export type interfaces
// These page files use getDb() which isn't available in test environment
vi.mock('@/app/(dashboard)/people/page', () => ({}))
vi.mock('@/app/(dashboard)/channels/page', () => ({}))
vi.mock('@/app/(dashboard)/webhooks/page', () => ({}))
vi.mock('@/app/(dashboard)/workspace/page', () => ({}))

describe('Dashboard Pages', () => {
  it('renders OrdersClient', async () => {
    const { OrdersClient } = await import('@/app/(dashboard)/orders/client')
    render(<OrdersClient data={[]} />)
    expect(screen.getByText('Orders')).toBeInTheDocument()
  })

  it('renders PlansClient', async () => {
    const { PlansClient } = await import('@/app/(dashboard)/plans/client')
    render(<PlansClient data={[]} />)
    expect(screen.getByText('Plans')).toBeInTheDocument()
  })

  it('renders PeopleClient', async () => {
    const { PeopleClient } = await import('@/app/(dashboard)/people/client')
    render(<PeopleClient data={[]} />)
    expect(screen.getByText('People')).toBeInTheDocument()
  })

  it('renders ChannelsClient', async () => {
    const { ChannelsClient } = await import('@/app/(dashboard)/channels/client')
    render(<ChannelsClient data={[]} />)
    expect(screen.getByText('Channels')).toBeInTheDocument()
  })

  it('renders WebhooksClient', async () => {
    const { WebhooksClient } = await import('@/app/(dashboard)/webhooks/client')
    render(<WebhooksClient data={[]} />)
    expect(screen.getByText('Webhooks')).toBeInTheDocument()
  })

  it('renders WorkspaceClient', async () => {
    const { WorkspaceClient } = await import('@/app/(dashboard)/workspace/client')
    render(<WorkspaceClient data={[]} />)
    expect(screen.getByText('Workspaces')).toBeInTheDocument()
  })

  it('renders JobsClient', async () => {
    const { JobsClient } = await import('@/app/(dashboard)/jobs/client')
    render(<JobsClient data={[]} />)
    expect(screen.getByText('Jobs')).toBeInTheDocument()
  })

  it('renders RecordingsClient', async () => {
    const { RecordingsClient } = await import('@/app/(dashboard)/recordings/client')
    render(<RecordingsClient data={[]} />)
    expect(screen.getByText('Recordings')).toBeInTheDocument()
  })

  it('renders EconomyClient', async () => {
    const { EconomyClient } = await import('@/app/(dashboard)/economy/client')
    render(<EconomyClient data={[]} totalSpend={0} todaySpend={0} />)
    expect(screen.getByText('Economy')).toBeInTheDocument()
  })

  it('renders EmailsClient', async () => {
    const { EmailsClient } = await import('@/app/(dashboard)/emails/client')
    render(<EmailsClient sent={[]} inbox={[]} />)
    expect(screen.getByText('Emails')).toBeInTheDocument()
  })
})
