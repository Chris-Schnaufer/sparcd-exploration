import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RegistryEditor } from './RegistryEditor'
import {
  Connection,
  loadPersistedConnection,
  loadSessionConnection,
  saveSharedConnection,
  subscribeSharedConnection,
} from '@sparcd/auth-ui'
import type { S3Config } from '@sparcd/types'
import { SafeS3Client } from '@sparcd/s3-safe'
import './style.css'

const LOCATIONS_KEY = 'Settings/locations.json'
const SPECIES_KEY = 'Settings/species.json'

type Registry = { key: string; value: unknown[]; etag: string; bucket: string }

const json = (value: unknown) => JSON.stringify(value, null, 2)
const id = () => crypto.randomUUID()

async function settingsBucket(client: SafeS3Client) {
  for (const bucket of await client.listBuckets()) {
    try {
      await client.statObject(bucket, LOCATIONS_KEY)
      return bucket
    } catch {
      // Try the next bucket. A settings bucket must contain locations.json.
    }
  }
  throw Error('No readable settings bucket.')
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
  return { client, species: await read(SPECIES_KEY), locations: await read(LOCATIONS_KEY) }
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

  return (
    <main>
      <h1>SPARC'd · Admin</h1>
      <p>Connected credentials have configuration-write access.</p>
      <label>
        Administrator identity
        <input value={identity} onChange={(event) => setName(event.target.value)} />
      </label>
      {!identity.trim() && <p role="alert">Identity is blank; audit records use login ID {config.accessKey}.</p>}
      <RegistryEditor title="Species" registry={data.species} client={data.client} actor={actor} reload={() => void authorize(config)} />
      <RegistryEditor title="Locations" registry={data.locations} client={data.client} actor={actor} reload={() => void authorize(config)} />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
