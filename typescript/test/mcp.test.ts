
import { test } from 'node:test'
import * as Assert from 'node:assert'

import { makecatalog, makehost } from '@voxgig/plugin'
import { Station } from '@voxgig/station'

import { StationMcp, makemcp } from '../src'

// The host a Station gives its extensions: its first instance is the
// Station, exported as `station/station`.
function hosted(station: Station) {
  const host = makehost({
    catalog: makecatalog([{ name: 'station', define: (inst: any) => inst.export('station', station) }]),
  })
  host.load('station')
  host.activate('station')
  host.define(StationMcp)
  host.load('mcp')
  host.activate('mcp')
  return host
}

function answer(result: any): any {
  Assert.strictEqual(result.isError, undefined)
  Assert.strictEqual(result.content[0].type, 'text')
  return JSON.parse(result.content[0].text)
}

test('the tools go live in a station host and answer from the station', () => {
  const station = new Station({ config: null, proxy: 'off', load: false })
  const host = hosted(station)
  const mcp = host.exports('mcp/mcp')

  Assert.deepStrictEqual(mcp.tools().map((t: any) => t.name), ['station_status', 'station_integrations'])
  Assert.deepStrictEqual(answer(mcp.call('station_status')), { stub: true, ...station.status() })
  Assert.deepStrictEqual(answer(mcp.call('station_integrations')), { stub: true, integrations: [] })

  host.close()
  station.close()
})

test('an unknown tool is an error result, not a throw', () => {
  const mcp = makemcp({ status: () => ({}), plugins: () => [] })
  const result = mcp.call('station_call')
  Assert.strictEqual(result.isError, true)
  Assert.strictEqual(result.content[0].text, 'unknown tool: station_call')
})

test('integrations summarise each bound plugin\'s entities and ops, sorted', () => {
  const mcp = makemcp({
    status: () => ({}),
    plugins: () => [{
      name: 'joplin$work', slug: 'joplin',
      descriptor: { entities: { note: { ops: { list: {}, load: {} } }, folder: { ops: { list: {} } } } },
    }],
  })
  Assert.deepStrictEqual(answer(mcp.call('station_integrations')), {
    stub: true,
    integrations: [{ plugin: 'joplin$work', api: 'joplin', entities: { folder: ['list'], note: ['list', 'load'] } }],
  })
})
