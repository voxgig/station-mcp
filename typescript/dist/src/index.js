"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StationMcp = void 0;
exports.makemcp = makemcp;
// Two of the proxy daemon's tools, by the same names, answered in process.
const TOOLS = [
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
];
function text(value) {
    return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}
function entitiesof(descriptor) {
    const out = {};
    const entities = (descriptor && descriptor.entities) || {};
    for (const name of Object.keys(entities).sort()) {
        out[name] = Object.keys(entities[name].ops || {}).sort();
    }
    return out;
}
function makemcp(station) {
    const answer = new Map([
        ['station_status', () => ({ stub: true, ...station.status() })],
        ['station_integrations', () => ({
                stub: true,
                integrations: station.plugins().map((p) => ({
                    plugin: p.name, api: p.slug, entities: entitiesof(p.descriptor),
                })),
            })],
    ]);
    return {
        tools: () => TOOLS.map((t) => ({ ...t, inputSchema: { type: 'object', properties: {} } })),
        call(name) {
            const fn = answer.get(name);
            if (undefined === fn) {
                return { isError: true, content: [{ type: 'text', text: 'unknown tool: ' + name }] };
            }
            return text(fn());
        },
    };
}
// A voxgig/plugin definition. A Station loads it only when handed it:
// `station.use(StationMcp)`, then `station.extension('mcp/mcp')`.
exports.StationMcp = {
    name: 'mcp',
    activate(inst) {
        inst.export('mcp', makemcp(inst.host().exports('station/station')));
    },
};
//# sourceMappingURL=index.js.map