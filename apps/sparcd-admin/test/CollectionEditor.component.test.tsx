// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { CollectionEditor, type CollectionRecord } from '../src/CollectionEditor'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const collection: CollectionRecord = {
  key: 'sparcd-test::abc', bucket: 'sparcd-test', uuid: 'abc', name: 'Test collection',
  organization: 'Lab', contact: null, description: 'Study', etag: 'collection-etag',
  document: { nameProperty: 'Test collection', organizationProperty: 'Lab', descriptionProperty: 'Study' },
  speciesAssignment: { values: [{ scientificName: 'puma', name: 'Puma' }], etag: 'species-etag' },
  locationsAssignment: { values: [{ idProperty: 'north', nameProperty: 'North' }], etag: 'locations-etag' },
}

function renderEditor(client: any) {
  const host = document.createElement('div'); document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(<CollectionEditor collections={[collection]} client={client} actor="admin" reload={() => {}} speciesRegistry={collection.speciesAssignment.values} locationsRegistry={collection.locationsAssignment.values} />))
  return { host, root }
}

describe('CollectionEditor audit retry', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('shows Retry audit record after applied audit failure and recovers on click', async () => {
    let appliedAttempts = 0
    const client = {
      writeImmutable: async (_bucket: string, key: string) => {
        if (key.endsWith('.applied.json') && appliedAttempts++ === 0) throw new Error('temporary audit failure')
      },
      replaceIfUnchanged: async () => ({ etag: 'new-etag' }),
    }
    const { host, root } = renderEditor(client)
    const description = host.querySelector('input[aria-label="Description"]') as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(description, 'Updated study')
      description.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => (host.querySelector('button') as HTMLButtonElement).click())
    expect(host.textContent).toContain('Retry audit record')
    await act(async () => (Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Retry audit record') as HTMLButtonElement).click())
    expect(host.textContent).toContain('Applied audit record recovered.')
    act(() => root.unmount())
  })
})
