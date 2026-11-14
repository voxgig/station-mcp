
// The slice of a voxgig/station Station that the tools read.
export type StationLike = {
  status(): { [key: string]: any }
  plugins(): { name: string, slug: string, descriptor: any }[]
}

export type McpTool = {
  name: string
  description: string
  inputSchema: { type: 'object', properties: { [key: string]: any } }
}

export type McpResult = {
  content: { type: 'text', text: string }[]
  isError?: boolean
}

export type Mcp = {
  tools(): McpTool[]
  call(name: string, args?: { [key: string]: any }): McpResult
}

// Two of the proxy daemon's tools, by the same names, answered in process.
const TOOLS: McpTool[] = [
  {
    name: 'station_status',
    description: 'Is station healthy: mode, profile, each bound plugin and its isolation rung, and the event counters.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'station_integrations',
    description: 'List bound plugins with a compact entity/op summary.',
    inputSchema: { type: 'object', properties: {} },
  },
]

function text(value: any): McpResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
}

function entitiesof(descriptor: any): { [entity: string]: string[] } {
  const out: { [entity: string]: string[] } = {}
  const entities = (descriptor && descriptor.entities) || {}
  for (const name of Object.keys(entities).sort()) {
    out[name] = Object.keys(entities[name].ops || {}).sort()
  }
  return out
}

export function makemcp(station: StationLike): Mcp {
  const answer: { [name: string]: () => any } = {
    station_status: () => ({ stub: true, ...station.status() }),
    station_integrations: () => ({
      stub: true,
      integrations: station.plugins().map((p) => ({
        plugin: p.name, api: p.slug, entities: entitiesof(p.descriptor),
      })),
    }),
  }

  return {
    tools: () => TOOLS.map((t) => ({ ...t, inputSchema: { type: 'object', properties: {} } })),
    call(name) {
      const fn = answer[name]
      if (undefined === fn) {
        return { isError: true, content: [{ type: 'text', text: 'unknown tool: ' + name }] }
      }
      return text(fn())
    },
  }
}

// A voxgig/plugin definition. A Station loads it only when handed it:
// `station.use(StationMcp)`, then `station.extension('mcp/mcp')`.
export const StationMcp = {
  name: 'mcp',
  activate(inst: any): void {
    inst.export('mcp', makemcp(inst.host().exports('station/station')))
  },
}
