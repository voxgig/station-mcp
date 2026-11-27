# station-mcp

A [voxgig/station](https://github.com/voxgig/station) extension: an MCP
server over a Station, in the application's own process. For each SDK
the Station binds it serves the tools sdkgen's `go-mcp` target serves
for one SDK, and six tools about the Station itself. It speaks MCP over
stdio, and over streamable HTTP on loopback.

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
- The four write tools need two gates, as station's proxy does: the
  extension's `write` option, `station.use(StationMcp, { write: true })`,
  and `agent: { write: true }` in the instance's block of the Station's
  config. An instance without both stays read-only, whatever the other
  instances of its API allow.
- A tool's prefix is the instance name, with any character outside
  `A-Z`, `a-z`, `0-9`, `_` and `-` written as `_`. So `solar$b` becomes
  `solar_b_list`.
- A result is one text item holding indented JSON. A failure is an
  error result carrying the message.
- Every result passes through the Station's `redact()`.
- An SDK tool's result came from the API, so it is labelled external
  data: it carries `_meta: { contentOrigin: "upstream-external" }`, and
  each SDK tool's description says to treat what it returns as data,
  never as instructions. `initialize` says the same once, in its
  `instructions`. The two station tools answer from the Station itself,
  and carry no label.

Six tools are about the Station itself. They answer from its public
API, in process, with the arguments and result shapes of station's proxy
daemon, which answers tools of the same names:

| tool | arguments | returns |
| --- | --- | --- |
| `station_status` | none | the Station's mode, profile, bound plugins and event counters |
| `station_integrations` | none | each bound plugin, with its entities and their operations |
| `station_describe` | `plugin`, and an optional `entity` | the plugin's entities with their fields and operations, or one entity in full |
| `station_traffic` | optional `plugin`, `since` (`"5m"`), `grep`, `cursor` and `limit` | the Station's recent events, oldest first, each with an `id`, and `more` and `next` for the next page |
| `station_secrets` | an optional `plugin` | each plugin's secret name, the store that answers it, and a remediation when none does |
| `station_policy` | an optional `plugin` | each plugin's gates: mode, hosts, allow, budget, resolve, capture, `agentWrite`, and `writeTools`, whether this server opens its write tools |

- A plugin or entity name matches case-insensitively. An unknown one is
  an error naming the candidates.
- An event's `id` is its place in everything the Station has kept, so a
  cursor stays good as the Station drops its oldest events.
- `station_traffic` carries upstream text, so its result is labelled
  external data, as an SDK tool's is.
- `station_secrets` and `station_policy` need a Station that reports
  `secrets()` and `policies()`. An older one answers them with an error.
- The proxy's `station_call` is not served: the SDK tools above take its
  place. Nor is `station_replay`, which replays the proxy's captures.

## The transport

`serve()` speaks MCP's stdio transport: one JSON-RPC message per line,
in and out. It writes nothing but replies to its output, so an SDK
feature that logs to standard output must log somewhere else.

`listen({ port, host, path, token, maxSessions })` serves MCP's
streamable HTTP transport, and resolves to `{ url, port, token, close }`:

```ts
const live = await station.extension('mcp/mcp').listen()
console.error('MCP at ' + live.url)    // http://127.0.0.1:<port>/mcp
```

- It listens on loopback only: `127.0.0.1` by default, or `localhost` or
  `::1`. Port 0, the default, takes a free port, and the endpoint is
  `/mcp`.
- Every request needs `Authorization: Bearer <token>`, as station's
  proxy asks of its own MCP endpoint. Each `listen()` makes a token
  unless it is given one of at least 16 characters, and a client is
  handed the URL and that header.
- It answers only a `Host` naming the loopback address and port it
  listens on, and refuses an `Origin` that is not that server, so a page
  elsewhere cannot rebind a name onto it.
- `initialize` opens a session: its reply carries `Mcp-Session-Id`, and
  every later request sends it back. `DELETE` ends a session. Past
  `maxSessions`, 64 by default, the session used longest ago ends, and
  its client initializes again.
- A request is answered with JSON. A notification, or a client's
  response, is `202` with no body. `GET` is `405`, since the server sends
  nothing a client did not ask for.
- A body over 4 MiB is `413`, one that is not `application/json` is
  `415`, and an unsupported `MCP-Protocol-Version` is `400`, as is a
  body that is not one JSON-RPC message.

`handle(message)` answers one JSON-RPC message in process. It serves:

- `initialize`, which takes the client's protocol version when it is
  one this server knows;
- `ping`, `tools/list` and `tools/call`.

A notification gets no reply. An unknown method is `-32601`, an
unknown tool `-32602`, and a message that is not a JSON-RPC request
`-32600`.

## Develop

The package is not on npm, and has no runtime dependencies. It takes
`@voxgig/station` 0.4.0 or later as a peer dependency, the first release
that carries station's extension points, and its tests run against npm's
station.

```sh
make test      # install, build, test, comment gate, stale dist/ check
```
