import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RegistryEditor } from './RegistryEditor'
import { CollectionEditor, type CollectionRecord } from './CollectionEditor'
import { Chrome, type AdminSection } from './Chrome'
import {
  clearSharedConnection,
  Connection,
  loadPersistedConnection,
  loadSessionConnection,
  saveSharedConnection,
  subscribeSharedConnection,
  loadSharedTheme,
  saveSharedTheme,
  type Theme,
} from '@sparcd/auth-ui'
import type { S3Config } from '@sparcd/types'
import { listCollections, SafeS3Client } from '@sparcd/s3-safe'
import { settingsBucketCandidates } from './settingsBucket'
import './style.css'

const LOCATIONS_KEY = 'Settings/locations.json'
const SPECIES_KEY = 'Settings/species.json'

type Registry = { key: string; value: unknown[]; etag: string; bucket: string }

const json = (value: unknown) => JSON.stringify(value, null, 2)
const id = () => crypto.randomUUID()

async function settingsBucket(client: SafeS3Client) {
  const visible = await client.listBuckets()
  const candidates = settingsBucketCandidates(visible)
  for (const bucket of candidates) {
    try {
      await client.statObject(bucket, LOCATIONS_KEY)
      return bucket
    } catch {
      // Try the next bucket. A settings bucket must contain locations.json.
    }
  }
  throw Error('No readable conventional settings bucket (sparcd-settings-* or sparcd).')
}

async function loadRegistries(config: S3Config) {
  const client = new SafeS3Client(config, ['*'], ['*'])
  const bucket = await settingsBucket(client)
  const read = async (key: string): Promise<Registry> => {
    const stat = await client.statObject(bucket, key)
    return {
      key,
      value: JSON.parse(new TextDecoder().decode(await client.getObject(bucket, key))),
      etag: stat.etag!,
      bucket,
    }
  }
  const collections: CollectionRecord[] = []
  for (const collection of await listCollections(client)) {
    const key = `Collections/${collection.uuid}/collection.json`
    const stat = await client.statObject(collection.bucket, key)
    const document = JSON.parse(new TextDecoder().decode(await client.getObject(collection.bucket, key))) as Record<string, unknown>
    collections.push({ ...collection, etag: stat.etag!, document })
  }
  return { client, species: await read(SPECIES_KEY), locations: await read(LOCATIONS_KEY), collections }
}

async function verifyWriteAccess(config: S3Config) {
  const { client, species } = await loadRegistries(config)
  await client.writeImmutable(
    species.bucket,
    `Settings/admin-sessions/${id()}.json`,
    json({ schemaVersion: 1, openedAt: new Date().toISOString(), accessKey: config.accessKey }),
    { contentType: 'application/json' },
  )
}

function App() {
  const [config, setConfig] = useState<S3Config | null>(null)
  const [data, setData] = useState<Awaited<ReturnType<typeof loadRegistries>> | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [identity, setIdentity] = useState('')
  const [theme, setTheme] = useState<Theme>(() => loadSharedTheme() ?? 'light')
  const [section, setSection] = useState<AdminSection>('species')

  const authorize = async (nextConfig: S3Config, remember = true) => {
    setConnecting(true)
    setError('')
    try {
      await verifyWriteAccess(nextConfig)
      const loaded = await loadRegistries(nextConfig)
      saveSharedConnection(nextConfig, remember)
      setIdentity(sessionStorage.getItem('sparcd-admin-identity') ?? nextConfig.accessKey)
      setData(loaded)
      setConfig(nextConfig)
    } catch (cause) {
      setConfig(null)
      setData(null)
      setError(`Admin access was not established: ${(cause as Error).message}`)
    } finally {
      setConnecting(false)
    }
  }

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    const sessionConfig = loadSessionConnection()
    if (sessionConfig) void authorize(sessionConfig)
    return subscribeSharedConnection(
      (sharedConfig) => {
        if (sharedConfig) void authorize(sharedConfig)
        else {
          setConfig(null)
          setData(null)
        }
      },
      () => config,
    )
  }, [])

  if (!config || !data) {
    return (
      <>
        <Connection
          toolName="Admin"
          defaultRemember
          initialConfig={loadPersistedConnection() ?? undefined}
          onConnect={(nextConfig, remember) => void authorize(nextConfig, remember)}
        />
        {connecting && <p role="status">Opening the configuration workspace…</p>}
        {error && <p role="alert" className="error">{error}</p>}
      </>
    )
  }

  const setName = (value: string) => {
    setIdentity(value)
    sessionStorage.setItem('sparcd-admin-identity', value)
  }
  const actor = identity.trim() || config.accessKey

  const toggleTheme = () => {
    const nextTheme: Theme = theme === 'light' ? 'dark' : 'light'
    setTheme(nextTheme)
    saveSharedTheme(nextTheme)
  }

  return (
    <Chrome
      identity={actor}
      theme={theme}
      section={section}
      onSectionChange={setSection}
      onToggleTheme={toggleTheme}
      onDisconnect={() => {
        clearSharedConnection()
        setConfig(null)
        setData(null)
      }}
    >
      <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className={section === 'species' ? '' : 'hidden'}>
          <RegistryEditor title="Species" registry={data.species} client={data.client} actor={actor} reload={() => void authorize(config)} />
        </div>
        <div className={section === 'locations' ? '' : 'hidden'}>
          <RegistryEditor title="Locations" registry={data.locations} client={data.client} actor={actor} reload={() => void authorize(config)} />
        </div>
        <div className={section === 'collections' ? '' : 'hidden'}>
          <CollectionEditor collections={data.collections} client={data.client} actor={actor} reload={() => void authorize(config)} />
        </div>
        {section === 'settings' && <section className="max-w-2xl border border-rule bg-panel p-4" aria-labelledby="settings-heading">
          <h1 id="settings-heading" className="m-0 text-lg font-semibold text-ink">Settings</h1>
          <p className="mt-1 text-sm text-inkSoft">This identity is recorded with configuration changes.</p>
          <label className="block max-w-md font-medium text-ink">
            Administrator identity
            <input
              className="mt-1 block w-full border border-rule bg-paper px-3 py-2 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              value={identity}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {!identity.trim() && <p role="alert" className="mb-0">Identity is blank; audit records use login ID {config.accessKey}.</p>}
        </section>}
      </div>
    </Chrome>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
