# station-mcp

A [voxgig/station](https://github.com/voxgig/station) extension: an MCP
tool surface over a Station. **It is a stub for now.** It answers two of
the tools station's proxy daemon serves, `station_status` and
`station_integrations`, from one process's Station, and it has no
transport: nothing listens, and an application calls the tools itself.

Where the real surface runs is open (station's decision D-2026-11-14-1).
Station's design serves MCP from its proxy, where no SDK code runs and an
agent cannot reach a secret. An extension runs in the application's own
process, so it does not have that property.

## Use

```ts
import { Station } from '@voxgig/station'
import { StationMcp } from '@voxgig/station-mcp'

const station = new Station({ profile: 'default' }).use(StationMcp)
const mcp = station.extension('mcp/mcp')

mcp.tools()                 // [{ name: 'station_status', ... }, { name: 'station_integrations', ... }]
mcp.call('station_status')  // { content: [{ type: 'text', text: '{"stub":true,"mode":"solo",...}' }] }
mcp.call('station_call')    // { isError: true, content: [{ type: 'text', text: 'unknown tool: station_call' }] }
```

A Station loads it only when handed it. It needs a Station that hosts
extensions, with `Station.use()`, which no released `@voxgig/station` has
yet. The tools read only the Station's public API: its status, and each
bound SDK's name, api and entity/op summary.

The package is not on npm. Take it from this repository: `typescript/`
holds it, with `dist/src/` committed, so a checkout needs no build step.

## Layout

`typescript/` is the canonical port, and the only one so far. It has no
runtime dependencies.

## Develop

```sh
make test      # build, test, comment gate, and a stale dist/ check
```
