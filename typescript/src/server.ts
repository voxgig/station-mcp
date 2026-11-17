
import { StringDecoder } from 'string_decoder'

import type { McpResult, McpTool } from './tools'

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

export const SERVER_INFO = { name: 'station-mcp', version: '0.0.1' }

export type ToolSurface = {
  tools(): McpTool[]
  has(name: string): boolean
  call(name: string, args?: any): Promise<McpResult>
  redact(text: string): string
}

type Reply = { jsonrpc: '2.0', id: any, result?: any, error?: { code: number, message: string } }

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
const INTERNAL_ERROR = -32603

function fail(id: any, code: number, message: string): Reply {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

// One JSON-RPC message in, its reply out. A notification has no reply.
export async function handle(surface: ToolSurface, message: any): Promise<Reply | undefined> {
  if (null == message || 'object' !== typeof message || Array.isArray(message) ||
    '2.0' !== message.jsonrpc || 'string' !== typeof message.method) {
    return fail(message?.id ?? null, INVALID_REQUEST, 'Invalid Request')
  }
  const notification = !Object.prototype.hasOwnProperty.call(message, 'id')
  if (notification) { return undefined }

  const id = message.id
  const params = message.params || {}
  switch (message.method) {
    case 'initialize': {
      const asked = String(params.protocolVersion ?? '')
      return {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        },
      }
    }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} }
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: surface.tools() } }
    case 'tools/call': {
      const name = String(params.name ?? '')
      if (!surface.has(name)) { return fail(id, INVALID_PARAMS, 'Unknown tool: ' + name) }
      try {
        return { jsonrpc: '2.0', id, result: await surface.call(name, params.arguments) }
      }
      catch (err: any) {
        return fail(id, INTERNAL_ERROR, surface.redact(String(err?.message ?? err)))
      }
    }
    default:
      return fail(id, METHOD_NOT_FOUND, 'Method not found: ' + message.method)
  }
}

export type Stdio = {
  input: NodeJS.ReadableStream
  output: { write(text: string): any }
}

// Newline-delimited JSON-RPC, MCP's stdio transport. Nothing but frames
// is written to the output. Returns the function that stops reading.
export function serve(surface: ToolSurface, io: Stdio): () => void {
  const decoder = new StringDecoder('utf8')
  let pending = ''
  const write = (reply: Reply) => io.output.write(JSON.stringify(reply) + '\n')

  const read = (chunk: any) => {
    pending += 'string' === typeof chunk ? chunk : decoder.write(chunk)
    let at = pending.indexOf('\n')
    while (-1 !== at) {
      const line = pending.slice(0, at).trim()
      pending = pending.slice(at + 1)
      at = pending.indexOf('\n')
      if ('' === line) { continue }
      let message: any
      try { message = JSON.parse(line) }
      catch (_err) {
        write(fail(null, PARSE_ERROR, 'Parse error'))
        continue
      }
      handle(surface, message).then(
        (reply) => { if (undefined !== reply) { write(reply) } },
        (err) => write(fail(message?.id ?? null, INTERNAL_ERROR,
          surface.redact(String(err?.message ?? err)))))
    }
  }

  io.input.on('data', read)
  return () => { io.input.removeListener('data', read) }
}
