# Agent guide

station-mcp is a plugin for [voxgig/station](https://github.com/voxgig/station):
station loads it when a caller hands it the definition, and never otherwise.
It follows station's family layout: one directory per language, TypeScript
canonical. Only `typescript/` exists so far.

It serves MCP in the application's process, over the clients the Station
tells it of through station's `sdk.bound` point. Its tools take the shape
sdkgen's `go-mcp` target gives its own, and that shape is the contract:
change it there first. Every result passes through the Station's `redact()`,
and `serve()` writes nothing but JSON-RPC frames.

Its tests run against npm's station, 0.4.0 or later, the first release that
carries station's extension points.

## Building and testing

```sh
make test      # build the typescript package, run its tests, check dist/ is fresh
make comments  # the comment gate
```

`typescript/dist/` is committed, as the generated SDKs commit theirs, so a
consumer can take the package from a checkout with no build step. A change to
`typescript/src/` is not done until `make build` has been run and `dist/`
committed with it; `make test` fails on a stale `dist/`.

## Source code comments

Follow [COMMENT-POLICY.md](COMMENT-POLICY.md): comments are sparse and terse,
only for intricate or surprising code. Names carry intent; documents carry
requirements. Run `make comments comments-test` after editing source.

## Workflows

A session cannot push a change under `.github/workflows/`. A workflow change
is written as a `git format-patch` file instead, for a maintainer to apply.
