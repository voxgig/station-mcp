
// A client a Station has bound, as its `sdk.bound` point tells it.
export type BoundSdk = { name: string, api: string, descriptor: any, client: any }

export type McpTool = {
  name: string
  description: string
  inputSchema: { type: 'object', properties: { [key: string]: any }, required?: string[] }
  annotations?: { readOnlyHint?: boolean, destructiveHint?: boolean }
}

export type McpResult = {
  content: { type: 'text', text: string }[]
  isError?: boolean
}

type OpSpec = {
  key: 'query' | 'data'
  optional: boolean
  help: string
  verb: string
  returns: string
  annotations: { readOnlyHint?: boolean, destructiveHint?: boolean }
}

// The shape sdkgen's go-mcp target gives each of its tools.
const OPS: { [op: string]: OpSpec } = {
  list: {
    key: 'query', optional: true, help: 'optional filter map; omit it for the first page',
    verb: 'List records from', returns: 'the first page of records',
    annotations: { readOnlyHint: true },
  },
  load: {
    key: 'query', optional: false, help: 'match map naming the record, such as {"id":1}',
    verb: 'Load one record from', returns: 'the record',
    annotations: { readOnlyHint: true },
  },
  create: {
    key: 'data', optional: false, help: 'the new record\'s fields',
    verb: 'Create a record in', returns: 'the created record',
    annotations: { destructiveHint: false },
  },
  update: {
    key: 'data', optional: false, help: 'the record\'s id and the fields to change',
    verb: 'Update a record in', returns: 'the updated record',
    annotations: { destructiveHint: true },
  },
  patch: {
    key: 'data', optional: false, help: 'the record\'s id and only the fields to change',
    verb: 'Patch a record in', returns: 'the patched record',
    annotations: { destructiveHint: true },
  },
  remove: {
    key: 'query', optional: false, help: 'match map naming the record, such as {"id":1}',
    verb: 'Remove a record from', returns: 'the removed record',
    annotations: { destructiveHint: true },
  },
}

const READS = ['list', 'load']
const WRITES = ['create', 'update', 'patch', 'remove']

export type SdkTool = { tool: McpTool, sdk: BoundSdk, op: string, entities: string[] }

export function toolprefix(name: string): string {
  return String(name).replace(/[^A-Za-z0-9_-]/g, '_')
}

// One tool per operation an entity of the SDK has. A later SDK whose
// prefix is taken adds none, so a name always means one client.
export function sdktools(sdks: BoundSdk[], write: boolean): SdkTool[] {
  const ops = write ? [...READS, ...WRITES] : READS
  const out: SdkTool[] = []
  const taken = new Set<string>()
  for (const sdk of sdks) {
    const prefix = toolprefix(sdk.name)
    if (taken.has(prefix)) { continue }
    taken.add(prefix)
    const entities = sdk.descriptor?.entities || {}
    for (const op of ops) {
      const names = Object.keys(entities).filter((e) => null != entities[e]?.ops?.[op])
        .map((e) => e.toLowerCase()).sort()
      if (0 === names.length) { continue }
      out.push({ tool: describe(sdk, prefix, op, names), sdk, op, entities: names })
    }
  }
  return out
}

function describe(sdk: BoundSdk, prefix: string, op: string, entities: string[]): McpTool {
  const spec = OPS[op]
  const title = String(sdk.descriptor?.name || sdk.api) +
    (sdk.name === sdk.api ? '' : ' (' + sdk.name + ')')
  return {
    name: prefix + '_' + op,
    description: spec.verb + ' ' + title + '. Args: entity, ' + spec.key + ' (' + spec.help +
      '). Returns ' + spec.returns + ' as JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        entity: { type: 'string', enum: entities, description: 'one of: ' + entities.join(' | ') },
        [spec.key]: { type: 'object', description: spec.help },
      },
      required: spec.optional ? ['entity'] : ['entity', spec.key],
    },
    annotations: { ...spec.annotations },
  }
}

export async function runtool(sdkTool: SdkTool, args: any): Promise<any> {
  const entity = String(args?.entity ?? '')
  if (!sdkTool.entities.includes(entity)) {
    throw new Error('entity must be one of: ' + sdkTool.entities.join(' | '))
  }
  const spec = OPS[sdkTool.op]
  const arg = args?.[spec.key]
  if (!spec.optional && (null == arg || 'object' !== typeof arg)) {
    throw new Error(spec.key + ' is required: ' + spec.help)
  }
  const client = sdkTool.sdk.client
  const make = accessor(client, entity)
  if (undefined === make) {
    throw new Error(sdkTool.sdk.name + ' has no entity ' + entity)
  }
  const out = await make.call(client)[sdkTool.op](null == arg ? {} : arg)
  return Array.isArray(out) ? out.map(record) : record(out)
}

// A generated SDK names its entity accessors in PascalCase.
function accessor(client: any, entity: string): ((...args: any[]) => any) | undefined {
  const want = entity.replace(/_/g, '').toLowerCase()
  for (let proto = client; null != proto && Object.prototype !== proto;
    proto = Object.getPrototypeOf(proto)) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if ('constructor' !== key && want === key.toLowerCase() &&
        'function' === typeof client[key]) {
        return client[key]
      }
    }
  }
  return undefined
}

function record(value: any): any {
  return null != value && 'function' === typeof value.data ? value.data() : value
}
