"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StationMcp = exports.BOUND_POINT = exports.toolprefix = exports.SERVER_INFO = exports.PROTOCOL_VERSIONS = void 0;
exports.makemcp = makemcp;
const server_1 = require("./server");
Object.defineProperty(exports, "PROTOCOL_VERSIONS", { enumerable: true, get: function () { return server_1.PROTOCOL_VERSIONS; } });
Object.defineProperty(exports, "SERVER_INFO", { enumerable: true, get: function () { return server_1.SERVER_INFO; } });
const tools_1 = require("./tools");
Object.defineProperty(exports, "toolprefix", { enumerable: true, get: function () { return tools_1.toolprefix; } });
// The station point that tells an extension of each client bound.
exports.BOUND_POINT = 'sdk.bound';
const STATION_TOOLS = [
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
];
function entitiesof(descriptor) {
    const out = {};
    const entities = (descriptor && descriptor.entities) || {};
    for (const name of Object.keys(entities).sort()) {
        out[name] = Object.keys(entities[name].ops || {}).sort();
    }
    return out;
}
function makemcp(station, sdks = [], options = {}) {
    const answers = new Map([
        ['station_status', () => station.status()],
        ['station_integrations', () => ({
                integrations: station.plugins().map((p) => ({
                    plugin: p.name, api: p.slug, entities: entitiesof(p.descriptor),
                })),
            })],
    ]);
    // Every result and every failure passes through the Station's redaction.
    const text = (value, isError) => ({
        content: [{ type: 'text', text: station.redact(JSON.stringify(value, null, 2)) }],
        ...(isError ? { isError: true } : {}),
    });
    const current = () => (0, tools_1.sdktools)(sdks, true === options.write);
    const surface = {
        tools: () => [...STATION_TOOLS.map((t) => ({ ...t })), ...current().map((t) => t.tool)],
        has: (name) => answers.has(name) || current().some((t) => name === t.tool.name),
        async call(name, args) {
            try {
                const answer = answers.get(name);
                if (undefined !== answer) {
                    return text(answer());
                }
                const found = current().find((t) => name === t.tool.name);
                if (undefined === found) {
                    return text({ error: 'unknown tool: ' + name }, true);
                }
                return text(await (0, tools_1.runtool)(found, args));
            }
            catch (err) {
                return text({ error: String(err?.message ?? err), code: err?.code }, true);
            }
        },
        redact: (raw) => station.redact(raw),
    };
    return {
        ...surface,
        handle: (message) => (0, server_1.handle)(surface, message),
        serve: (io) => (0, server_1.serve)(surface, io),
    };
}
// A voxgig/plugin definition. A Station loads it only when handed it:
// `station.use(StationMcp, { write })`, then `station.extension('mcp/mcp')`.
exports.StationMcp = {
    name: 'mcp',
    define(inst) {
        const sdks = [];
        inst.bind(exports.BOUND_POINT, (sdk) => { sdks.push(sdk); });
        inst.export('mcp', makemcp(inst.host().exports('station/station'), sdks, { write: true === inst.options?.write }));
    },
};
//# sourceMappingURL=index.js.map