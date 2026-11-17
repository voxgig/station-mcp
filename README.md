# station-mcp

A [voxgig/station](https://github.com/voxgig/station) extension: an MCP
server over a Station, in the application's own process. For each SDK
the Station binds it serves the tools sdkgen's `go-mcp` target serves
for one SDK, and two tools about the Station itself.

## Use

```ts
import { Station } from '@voxgig/station'
import { StationMcp } from '@voxgig/station-mcp'

const station = new Station({ profile: 'default' }).use(StationMcp)
const solar = station.connect(SolardemoSDK, { instance: 'solar' })

const mcp = station.extension('mcp/mcp')
mcp.serve({ input: process.stdin, output: process.stdout })
```

A Station loads the extension only when handed it, and tells it of each
SDK bound after that. So hand it over before connecting the SDKs.

## The tools

For an SDK bound as `solar`, whose entities are `moon` and `planet`:

| tool | arguments | returns |
| --- | --- | --- |
| `solar_list` | `entity`, and an optional `query` map | the first page of records |
| `solar_load` | `entity` and a `query` map naming the record | the record |
| `solar_create` | `entity` and the new record's `data` | the created record |
| `solar_update`, `solar_patch` | `entity` and the record's `data` | the changed record |
| `solar_remove` | `entity` and a `query` map naming the record | the removed record |

- `entity` is one of the SDK's entities that has the operation.
- The four write tools exist only with `station.use(StationMcp, { write: true })`.
- A tool's prefix is the instance name, with any character outside
  `A-Z`, `a-z`, `0-9`, `_` and `-` written as `_`. So `solar$b` becomes
  `solar_b_list`.
- A result is one text item holding indented JSON. A failure is an
  error result carrying the message.
- Every result passes through the Station's `redact()`.

`station_status` and `station_integrations` answer from the Station's
public API, as station's proxy daemon answers the tools of those names.

## The transport

`serve()` speaks MCP's stdio transport: one JSON-RPC message per line,
in and out. It writes nothing but replies to its output, so an SDK
feature that logs to standard output must log somewhere else.

`handle(message)` answers one JSON-RPC message in process. It serves:

- `initialize`, which takes the client's protocol version when it is
  one this server knows;
- `ping`, `tools/list` and `tools/call`.

A notification gets no reply. An unknown method is `-32601`, an
unknown tool `-32602`, and a message that is not a JSON-RPC request
`-32600`.

## Develop

The package is not on npm, and has no runtime dependencies. Its tests
run against a voxgig/station checkout, `STATION_HOME` or a sibling
`../station`, which `make build` links into `node_modules`. That
checkout carries the extension points this package needs ahead of their
release, and it must be built first.

```sh
make test      # install, link station, build, test, comment gate, stale dist/ check
```
