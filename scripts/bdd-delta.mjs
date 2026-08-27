#!/usr/bin/env node
// Advisory report of scenario-level BDD changes in a branch. Never fails a build.
import { execFileSync } from 'node:child_process'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

const baseArg = (() => {
  const i = process.argv.indexOf('--base')
  return i === -1 ? 'main' : process.argv[i + 1]
})()

const base = git('merge-base', baseArg, 'HEAD').trim()

const changes = []
{
  const fields = git('diff', '--name-status', '-z', base, 'HEAD').split('\0')
  for (let i = 0; i < fields.length; i++) {
    const status = fields[i]
    if (!status) continue
    if (status[0] === 'R' || status[0] === 'C') {
      changes.push({ status: 'D', path: fields[++i] })
      changes.push({ status: 'A', path: fields[++i] })
    } else {
      changes.push({ status: status[0], path: fields[++i] })
    }
  }
}

const FEATURE = /^apps\/([^/]+)\/features\/.*\.feature$/
const SOURCE = /^(apps\/[^/]+\/src\/|packages\/|apps\/[^/]+\/index\.html$)/

const sourceChanged = changes.some((c) => SOURCE.test(c.path))

const apps = [...new Set(git('ls-files', 'apps/*/features/*.feature').split('\n').filter(Boolean).map((p) => p.match(FEATURE)[1]))].sort()

function parseScenarios(text) {
  const scenarios = new Map()
  let current = null
  let tags = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('@')) {
      tags.push(line)
      continue
    }
    const title = /^Scenario(?: Outline)?:\s*(.*)$/.exec(line)
    if (title) {
      current = title[1]
      scenarios.set(current, tags)
      tags = []
      continue
    }
    if (/^(Background|Rule):/.test(line)) {
      current = null
      tags = []
      continue
    }
    if (current && line) scenarios.get(current).push(line)
  }
  return new Map([...scenarios].map(([title, body]) => [title, body.join('\n')]))
}

const at = (rev, path) => parseScenarios(git('show', `${rev}:${path}`))

const added = []
const modified = []
const deleted = []

for (const { status, path } of changes) {
  const match = FEATURE.exec(path)
  if (!match) continue
  const app = match[1]
  const file = path.split('/').pop()
  const before = status === 'A' ? new Map() : at(base, path)
  const after = status === 'D' ? new Map() : at('HEAD', path)
  for (const [title, body] of after) {
    if (!before.has(title)) added.push({ app, file, title })
    else if (before.get(title) !== body) modified.push({ app, file, title })
  }
  for (const title of before.keys()) {
    if (!after.has(title)) deleted.push({ app, file, title })
  }
}

const blocks = [`<!-- bdd-delta -->\n### BDD delta vs \`${baseArg.replace(/^origin\//, '')}\``]

const anyScenarioChange = added.length + modified.length + deleted.length > 0

if (!anyScenarioChange && !sourceChanged) blocks.push('No BDD or app-source changes.')

if (anyScenarioChange) {
  for (const app of apps) {
    const rows = [
      ...added.filter((r) => r.app === app).map((r) => ({ ...r, mark: '➕' })),
      ...modified.filter((r) => r.app === app).map((r) => ({ ...r, mark: '✏️' })),
      ...deleted.filter((r) => r.app === app).map((r) => ({ ...r, mark: '➖' })),
    ]
    if (rows.length === 0) {
      blocks.push(`**${app}** — no scenario changes`)
      continue
    }
    const counts = [
      [rows.filter((r) => r.mark === '➕').length, 'added'],
      [rows.filter((r) => r.mark === '✏️').length, 'modified'],
      [rows.filter((r) => r.mark === '➖').length, 'deleted'],
    ]
      .filter(([n]) => n > 0)
      .map(([n, label]) => `${n} ${label}`)
      .join(' · ')
    blocks.push([`**${app}** — ${counts}`, ...rows.map((r) => `- ${r.mark} \`${r.title}\` — ${r.file}`)].join('\n'))
  }
}

const notes = []
if (sourceChanged && added.length + modified.length === 0) {
  notes.push('⚠️ App source changed but no scenarios were added or modified. If this change is untestable, say why (or add the `no-bdd` label).')
}
if (deleted.length > 0) notes.push('⚠️ Scenarios were deleted — worth a sentence in the PR description.')
if (notes.length) blocks.push(notes.join('\n'))

console.log(blocks.join('\n\n'))
