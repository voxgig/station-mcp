
import { INSTRUCTIONS, PROTOCOL_VERSIONS, SERVER_INFO, handle, serve } from './server'
import type { Stdio, ToolSurface } from './server'
import { listen } from './http'
import type { HttpOptions, Listening } from './http'
import { AGENT_TOOLS, describe, policy, secrets, traffic } from './agent'
import type { AgentStation } from './agent'
import { runtool, sdktools, toolprefix } from './tools'
import type { BoundSdk, McpResult, McpTool } from './tools'

export { INSTRUCTIONS, PROTOCOL_VERSIONS, SERVER_INFO, toolprefix }
export type { BoundSdk, HttpOptions, Listening, McpResult, McpTool, Stdio }

// The slice of a voxgig/station Station that the tools read.
export type StationLike = AgentStation & {
  redact(text: string): string
  instances?(): { name: string, block?: { agent?: { write?: boolean } } }[]
}

export type McpOptions = { write?: boolean }

export type Mcp = ToolSurface & {
  handle(message: any): Promise<any>
  serve(io: Stdio): () => void
  listen(opts?: HttpOptions): Promise<Listening>
}

// The station point that tells an extension of each client bound.
export const BOUND_POINT = 'sdk.bound'

const STATION_TOOLS: McpTool[] = [
  {
    name: 'station_status',
    description: 'Is station healthy: mode, profile, each bound plugin and its isolation rung, and the event counters.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'station_integrations',
    description: 'List bound plugins with a compact entity/op summary.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  ...AGENT_TOOLS,
]

// The station tool whose result can carry upstream text.
const UPSTREAM = new Set(['station_traffic'])

function entitiesof(descriptor: any): { [entity: string]: string[] } {
  const out: { [entity: string]: string[] } = {}
  const entities = (descriptor && descriptor.entities) || {}
  for (const name of Object.keys(entities).sort()) {
    out[name] = Object.keys(entities[name].ops || {}).sort()
  }
  return out
}

export function makemcp(station: StationLike, sdks: BoundSdk[] = [], options: McpOptions = {}): Mcp {
  const answers = new Map<string, (args: any) => any>([
    ['station_status', () => station.status()],
    ['station_integrations', () => ({
      integrations: station.plugins().map((p) => ({
        plugin: p.name, api: p.slug, entities: entitiesof(p.descriptor),
      })),
    })],
    ['station_describe', (args) => describe(station, args)],
    ['station_traffic', (args) => traffic(station, args)],
    ['station_secrets', (args) => secrets(station, args)],
    ['station_policy', (args) => policy(station, args, true === options.write)],
  ])

  // Every result and every failure passes through the Station's redaction.
  // What an SDK tool returns came from the upstream, and says so.
  const text = (value: any, isError?: boolean, upstream?: boolean): McpResult => ({
    content: [{ type: 'text', text: station.redact(JSON.stringify(value, null, 2)) }],
    ...(isError ? { isError: true } : {}),
    ...(upstream ? { _meta: { contentOrigin: 'upstream-external' } } : {}),
  })

  // A write needs both gates, as on the proxy: this server's `write`
  // option and the instance's `agent.write` (station.md §7).
  const writable = (sdk: BoundSdk) => true === options.write &&
    true === station.instances?.().find((i) => sdk.name === i.name)?.block?.agent?.write

  const current = () => sdktools(sdks, writable)

  const surface: ToolSurface = {
    tools: () => [...STATION_TOOLS.map((t) => ({ ...t })), ...current().map((t) => t.tool)],

    has: (name) => answers.has(name) || current().some((t) => name === t.tool.name),

    async call(name, args) {
      try {
        const answer = answers.get(name)
        if (undefined !== answer) {
          try { return text(await answer(args), false, UPSTREAM.has(name)) }
          catch (err: any) {
            return text({ error: String(err?.message ?? err), code: err?.code,
              ...(null == err?.candidates ? {} : { candidates: err.candidates }) },
            true, UPSTREAM.has(name))
          }
        }
        const found = current().find((t) => name === t.tool.name)
        if (undefined === found) { return text({ error: 'unknown tool: ' + name }, true) }
        try { return text(await runtool(found, args), false, true) }
        catch (err: any) {
          return text({ error: String(err?.message ?? err), code: err?.code }, true, true)
        }
      }
      catch (err: any) {
        return text({ error: String(err?.message ?? err), code: err?.code }, true)
      }
    },

    redact: (raw) => station.redact(raw),
  }

  return {
    ...surface,
    handle: (message) => handle(surface, message),
    serve: (io) => serve(surface, io),
    listen: (opts) => listen(surface, opts),
  }
}

// A voxgig/plugin definition. A Station loads it only when handed it:
// `station.use(StationMcp, { write })`, then `station.extension('mcp/mcp')`.
// A write tool also needs its instance's `agent.write` in the Station's config.
export const StationMcp = {
  name: 'mcp',
  define(inst: any): void {
    const sdks: BoundSdk[] = []
    inst.bind(BOUND_POINT, (sdk: BoundSdk) => { sdks.push(sdk) })
    inst.export('mcp', makemcp(inst.host().exports('station/station'), sdks,
      { write: true === inst.options?.write }))
  },
}
