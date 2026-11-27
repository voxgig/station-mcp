import { test } from 'node:test'
import * as Assert from 'node:assert'
import { request } from 'node:http'

import { StationMcp } from '../src'
import type { Listening } from '../src'
import { originok, reachable } from '../src/http'

import { agentwrite, fakeSDK, station } from './support'

type Got = { status: number, headers: any, body: string, json: any }

function send(live: Listening, opts: { method?: string, body?: any, headers?: any, path?: string } = {}): Promise<Got> {
  const text = undefined === opts.body ? '' : ('string' === typeof opts.body ? opts.body : JSON.stringify(opts.body))
  const headers: any = {
    host: '127.0.0.1:' + live.port,
    authorization: 'Bearer ' + live.token,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...opts.headers,
  }
  for (const key of Object.keys(headers)) {
    if (undefined === headers[key]) { delete headers[key] }
  }
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1', port: live.port, path: opts.path ?? '/mcp', method: opts.method ?? 'POST', headers,
    }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => { body += c })
      res.on('end', () => {
        let json: any
        try { json = JSON.parse(body) }
        catch (_err) { json = undefined }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body, json })
      })
    })
    req.on('error', reject)
    req.end(text)
  })
}

const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }

async function session(live: Listening): Promise<string> {
  const got = await send(live, { body: INIT })
  Assert.strictEqual(got.status, 200)
  return got.headers['mcp-session-id']
}

async function serving(write: boolean, opts: any = {}): Promise<{ st: any, live: Listening }> {
  const st = station(agentwrite(write)).use(StationMcp, { write })
  st.connect(fakeSDK('solar'), { instance: 'solar' })
  return { st, live: await st.extension('mcp/mcp').listen(opts) }
}

test('over streamable HTTP a client initializes, takes its session, and calls the tools', async () => {
  const { st, live } = await serving(true)
  try {
    Assert.match(live.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/)
    const init = await send(live, { body: INIT })
    Assert.strictEqual(init.status, 200)
    Assert.match(init.headers['content-type'], /^application\/json/)
    Assert.strictEqual(init.json.result.protocolVersion, '2025-06-18')
    Assert.ok(init.json.result.instructions.includes('external data'))
    const sid = init.headers['mcp-session-id']
    Assert.match(sid, /^[0-9a-f]{32}$/)
    const inside = { 'mcp-session-id': sid, 'mcp-protocol-version': '2025-06-18' }

    const ready = await send(live, { body: { jsonrpc: '2.0', method: 'notifications/initialized' }, headers: inside })
    Assert.deepStrictEqual([ready.status, ready.body], [202, ''])

    const list = await send(live, { body: { jsonrpc: '2.0', id: 2, method: 'tools/list' }, headers: inside })
    const names = list.json.result.tools.map((t: any) => t.name)
    Assert.ok(names.includes('station_status') && names.includes('solar_list') && names.includes('solar_create'))

    const call = await send(live, {
      body: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'solar_list', arguments: { entity: 'planet' } } },
      headers: inside,
    })
    Assert.ok(call.json.result.content[0].text.includes('Early Raven'))
    Assert.deepStrictEqual(call.json.result._meta, { contentOrigin: 'upstream-external' })

    const unknown = await send(live, { body: { jsonrpc: '2.0', id: 4, method: 'nope' }, headers: inside })
    Assert.deepStrictEqual([unknown.status, unknown.json.error.code], [200, -32601])

    const gone = await send(live, { method: 'DELETE', headers: inside })
    Assert.strictEqual(gone.status, 204)
    const after = await send(live, { body: { jsonrpc: '2.0', id: 5, method: 'ping' }, headers: inside })
    Assert.strictEqual(after.status, 404)
  }
  finally {
    await live.close()
    st.close()
  }
})

test('a message without its session, or with one that ended, is refused', async () => {
  const { st, live } = await serving(false)
  try {
    const ping = { jsonrpc: '2.0', id: 1, method: 'ping' }
    Assert.strictEqual((await send(live, { body: ping })).status, 400)
    Assert.strictEqual((await send(live, { body: ping, headers: { 'mcp-session-id': 'f'.repeat(32) } })).status, 404)
    Assert.strictEqual((await send(live, { method: 'DELETE' })).status, 400)
    Assert.strictEqual((await send(live, { method: 'DELETE', headers: { 'mcp-session-id': 'f'.repeat(32) } })).status, 404)
    const sid = await session(live)
    const ok = await send(live, { body: ping, headers: { 'mcp-session-id': sid } })
    Assert.deepStrictEqual([ok.status, ok.json.result], [200, {}])
    const reply = { jsonrpc: '2.0', id: 9, result: {} }
    Assert.strictEqual((await send(live, { body: reply, headers: { 'mcp-session-id': sid } })).status, 202)
  }
  finally {
    await live.close()
    st.close()
  }
})

test('only a loopback Host and Origin, with the bearer token, are answered', async () => {
  const { st, live } = await serving(false)
  try {
    const host = await send(live, { body: INIT, headers: { host: 'evil.example:' + live.port } })
    Assert.strictEqual(host.status, 403)
    for (const origin of ['http://evil.example', 'null', 'https://127.0.0.1:' + live.port]) {
      Assert.strictEqual((await send(live, { body: INIT, headers: { origin } })).status, 403, origin)
    }
    Assert.strictEqual((await send(live, { body: INIT, headers: { origin: 'http://localhost:' + live.port } })).status, 200)

    const none = await send(live, { body: INIT, headers: { authorization: undefined } })
    Assert.strictEqual(none.status, 401)
    Assert.strictEqual(none.headers['www-authenticate'], 'Bearer realm="station-mcp"')
    Assert.strictEqual(none.headers['mcp-session-id'], undefined)
    for (const authorization of ['Bearer ' + live.token.slice(1), 'Bearer x' + live.token, 'Basic ' + live.token]) {
      Assert.strictEqual((await send(live, { body: INIT, headers: { authorization } })).status, 401, authorization)
    }
  }
  finally {
    await live.close()
    st.close()
  }
})

test('what is not one JSON-RPC message POSTed as JSON is refused with the status MCP names', async () => {
  const { st, live } = await serving(false)
  try {
    const get = await send(live, { method: 'GET' })
    Assert.deepStrictEqual([get.status, get.headers.allow], [405, 'POST, DELETE'])
    Assert.strictEqual((await send(live, { method: 'PUT', body: INIT })).status, 405)
    Assert.strictEqual((await send(live, { body: INIT, path: '/other' })).status, 404)
    Assert.strictEqual((await send(live, { body: INIT, headers: { 'content-type': 'text/plain' } })).status, 415)

    const torn = await send(live, { body: '{"jsonrpc":' })
    Assert.deepStrictEqual([torn.status, torn.json.error.code], [400, -32700])
    const sid = await session(live)
    for (const body of [[INIT], { id: 1, method: 'ping' }, { jsonrpc: '2.0', id: 1 }]) {
      const bad = await send(live, { body, headers: { 'mcp-session-id': sid } })
      Assert.deepStrictEqual([bad.status, bad.json.error.code], [400, -32600], JSON.stringify(body))
    }
    const version = await send(live, { body: INIT, headers: { 'mcp-protocol-version': '1999-01-01' } })
    Assert.strictEqual(version.status, 400)
    const big = await send(live, { body: '{"jsonrpc":"2.0","pad":"' + 'x'.repeat(4 << 20) + '"}' })
    Assert.strictEqual(big.status, 413)
  }
  finally {
    await live.close()
    st.close()
  }
})

test('past its cap the server drops the session used longest ago', async () => {
  const { st, live } = await serving(false, { maxSessions: 2 })
  try {
    const ping = (sid: string) => send(live, { body: { jsonrpc: '2.0', id: 1, method: 'ping' }, headers: { 'mcp-session-id': sid } })
    const a = await session(live)
    const b = await session(live)
    Assert.strictEqual((await ping(a)).status, 200)
    const c = await session(live)
    Assert.deepStrictEqual([(await ping(b)).status, (await ping(a)).status, (await ping(c)).status], [404, 200, 200])
  }
  finally {
    await live.close()
    st.close()
  }
})

test('it listens on loopback only, with a token it makes or one it is given', async () => {
  const st = station().use(StationMcp)
  const mcp = st.extension('mcp/mcp')
  try {
    await Assert.rejects(mcp.listen({ host: '0.0.0.0' }), /loopback only/)
    await Assert.rejects(mcp.listen({ token: 'short' }), /at least 16/)
    await Assert.rejects(mcp.listen({ token: 'has a space in it' }), /at least 16/)
    const given = await mcp.listen({ token: 't'.repeat(24) })
    Assert.strictEqual(given.token, 't'.repeat(24))
    await given.close()
    const made = await mcp.listen()
    Assert.match(made.token, /^[A-Za-z0-9_-]{43}$/)
    await made.close()
  }
  finally {
    st.close()
  }
})

test('a Host or Origin must name this server on loopback', () => {
  Assert.strictEqual(reachable('127.0.0.1:8080', 8080), true)
  Assert.strictEqual(reachable('LOCALHOST:8080', 8080), true)
  Assert.strictEqual(reachable('[::1]:8080', 8080), true)
  Assert.strictEqual(reachable('127.0.0.1:8081', 8080), false)
  Assert.strictEqual(reachable('127.0.0.1', 8080), false)
  Assert.strictEqual(reachable('localhost', 80), true)
  Assert.strictEqual(reachable(undefined, 8080), false)
  Assert.strictEqual(originok(undefined, 8080), true)
  Assert.strictEqual(originok('http://127.0.0.1:8080', 8080), true)
  Assert.strictEqual(originok('http://127.0.0.1:8081', 8080), false)
  Assert.strictEqual(originok('http://evil.example:8080', 8080), false)
  Assert.strictEqual(originok('file://', 8080), false)
})
