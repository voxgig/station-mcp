"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERVER_INFO = exports.PROTOCOL_VERSIONS = void 0;
exports.handle = handle;
exports.serve = serve;
const string_decoder_1 = require("string_decoder");
exports.PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
exports.SERVER_INFO = { name: 'station-mcp', version: '0.0.1' };
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;
function fail(id, code, message) {
    return { jsonrpc: '2.0', id, error: { code, message } };
}
// One JSON-RPC message in, its reply out. A notification has no reply.
async function handle(surface, message) {
    if (null == message || 'object' !== typeof message || Array.isArray(message) ||
        '2.0' !== message.jsonrpc || 'string' !== typeof message.method) {
        return fail(message?.id ?? null, INVALID_REQUEST, 'Invalid Request');
    }
    const notification = !Object.prototype.hasOwnProperty.call(message, 'id');
    if (notification) {
        return undefined;
    }
    const id = message.id;
    const params = message.params || {};
    switch (message.method) {
        case 'initialize': {
            const asked = String(params.protocolVersion ?? '');
            return {
                jsonrpc: '2.0', id,
                result: {
                    protocolVersion: exports.PROTOCOL_VERSIONS.includes(asked) ? asked : exports.PROTOCOL_VERSIONS[0],
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: exports.SERVER_INFO,
                },
            };
        }
        case 'ping':
            return { jsonrpc: '2.0', id, result: {} };
        case 'tools/list':
            return { jsonrpc: '2.0', id, result: { tools: surface.tools() } };
        case 'tools/call': {
            const name = String(params.name ?? '');
            if (!surface.has(name)) {
                return fail(id, INVALID_PARAMS, 'Unknown tool: ' + name);
            }
            try {
                return { jsonrpc: '2.0', id, result: await surface.call(name, params.arguments) };
            }
            catch (err) {
                return fail(id, INTERNAL_ERROR, surface.redact(String(err?.message ?? err)));
            }
        }
        default:
            return fail(id, METHOD_NOT_FOUND, 'Method not found: ' + message.method);
    }
}
// Newline-delimited JSON-RPC, MCP's stdio transport. Nothing but frames
// is written to the output. Returns the function that stops reading.
function serve(surface, io) {
    const decoder = new string_decoder_1.StringDecoder('utf8');
    let pending = '';
    const write = (reply) => io.output.write(JSON.stringify(reply) + '\n');
    const read = (chunk) => {
        pending += 'string' === typeof chunk ? chunk : decoder.write(chunk);
        let at = pending.indexOf('\n');
        while (-1 !== at) {
            const line = pending.slice(0, at).trim();
            pending = pending.slice(at + 1);
            at = pending.indexOf('\n');
            if ('' === line) {
                continue;
            }
            let message;
            try {
                message = JSON.parse(line);
            }
            catch (_err) {
                write(fail(null, PARSE_ERROR, 'Parse error'));
                continue;
            }
            handle(surface, message).then((reply) => { if (undefined !== reply) {
                write(reply);
            } }, (err) => write(fail(message?.id ?? null, INTERNAL_ERROR, surface.redact(String(err?.message ?? err)))));
        }
    };
    io.input.on('data', read);
    return () => { io.input.removeListener('data', read); };
}
//# sourceMappingURL=server.js.map