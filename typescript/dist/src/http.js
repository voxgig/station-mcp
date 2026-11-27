"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listen = listen;
exports.reachable = reachable;
exports.originok = originok;
const crypto_1 = require("crypto");
const http_1 = require("http");
const server_1 = require("./server");
const LOOPBACK = ['127.0.0.1', 'localhost', '::1'];
const MAX_BODY = 4 << 20;
// MCP's streamable HTTP transport, each request answered with JSON. It
// listens on loopback only, answers only a Host and Origin it is
// reachable as, so a page elsewhere cannot rebind a name onto it, and
// asks every request for its bearer token, as the proxy does (§8.1).
function listen(surface, opts = {}) {
    const host = opts.host ?? '127.0.0.1';
    if (!LOOPBACK.includes(host)) {
        return Promise.reject(new Error('station-mcp listens on loopback only, not ' + host));
    }
    const token = opts.token ?? (0, crypto_1.randomBytes)(32).toString('base64url');
    if ('string' !== typeof token || token.length < 16 || /\s/.test(token)) {
        return Promise.reject(new Error('station-mcp needs a token of at least 16 characters, without spaces'));
    }
    const path = opts.path ?? '/mcp';
    const maxSessions = opts.maxSessions ?? 64;
    const sessions = new Map();
    let port = 0;
    const open = () => {
        const id = (0, crypto_1.randomBytes)(16).toString('hex');
        sessions.set(id, true);
        for (const old of sessions.keys()) {
            if (sessions.size <= maxSessions) {
                break;
            }
            sessions.delete(old);
        }
        return id;
    };
    // The least recently used session is the one a full table drops.
    const touch = (id) => {
        if (!sessions.delete(id)) {
            return false;
        }
        sessions.set(id, true);
        return true;
    };
    const post = async (req, res) => {
        if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) {
            return refuse(res, 415, 'Content-Type must be application/json');
        }
        const version = req.headers['mcp-protocol-version'];
        if (undefined !== version && !server_1.PROTOCOL_VERSIONS.includes(String(version))) {
            return refuse(res, 400, 'unsupported MCP-Protocol-Version: ' + version);
        }
        const body = await read(req);
        if (undefined === body) {
            return refuse(res, 413, 'message over 4 MiB');
        }
        let message;
        try {
            message = JSON.parse(body);
        }
        catch (_err) {
            return refuse(res, 400, 'Parse error', -32700);
        }
        if (null == message || 'object' !== typeof message || Array.isArray(message) || '2.0' !== message.jsonrpc) {
            return refuse(res, 400, 'Invalid Request');
        }
        const request = 'string' === typeof message.method;
        const response = !request && has(message, 'id') && (has(message, 'result') || has(message, 'error'));
        if (!request && !response) {
            return refuse(res, 400, 'Invalid Request');
        }
        if (request && 'initialize' === message.method && has(message, 'id')) {
            const reply = await (0, server_1.handle)(surface, message);
            if (undefined !== reply?.result) {
                res.setHeader('Mcp-Session-Id', open());
            }
            return send(res, 200, reply);
        }
        const session = req.headers['mcp-session-id'];
        if ('string' !== typeof session) {
            return refuse(res, 400, 'Mcp-Session-Id is required after initialize');
        }
        if (!touch(session)) {
            return refuse(res, 404, 'unknown or ended session');
        }
        if (!request) {
            return accepted(res);
        }
        const reply = await (0, server_1.handle)(surface, message);
        return undefined === reply ? accepted(res) : send(res, 200, reply);
    };
    const end = (req, res) => {
        const session = req.headers['mcp-session-id'];
        if ('string' !== typeof session) {
            return refuse(res, 400, 'Mcp-Session-Id is required');
        }
        if (!sessions.delete(session)) {
            return refuse(res, 404, 'unknown or ended session');
        }
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        res.end();
    };
    const server = (0, http_1.createServer)((req, res) => {
        if (!reachable(req.headers.host, port)) {
            return refuse(res, 403, 'forbidden host');
        }
        if (!originok(req.headers.origin, port)) {
            return refuse(res, 403, 'forbidden origin');
        }
        if (!authorized(req.headers.authorization, token)) {
            res.setHeader('WWW-Authenticate', 'Bearer realm="station-mcp"');
            return refuse(res, 401, 'missing or invalid bearer token');
        }
        if (path !== (req.url ?? '').replace(/\?.*$/, '')) {
            return refuse(res, 404, 'no such endpoint');
        }
        if ('DELETE' === req.method) {
            return end(req, res);
        }
        if ('POST' !== req.method) {
            res.setHeader('Allow', 'POST, DELETE');
            return refuse(res, 405, 'POST a JSON-RPC message, or DELETE a session');
        }
        post(req, res).catch((err) => {
            if (!res.headersSent) {
                refuse(res, 500, surface.redact(String(err?.message ?? err)), -32603);
            }
        });
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(opts.port ?? 0, host, () => {
            server.removeListener('error', reject);
            port = server.address().port;
            resolve({
                url: 'http://' + (host.includes(':') ? '[' + host + ']' : host) + ':' + port + path,
                port,
                token,
                close: () => new Promise((done) => {
                    sessions.clear();
                    server.close(() => done());
                    server.closeAllConnections?.();
                }),
            });
        });
    });
}
function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}
function authorities(port) {
    return ['127.0.0.1', 'localhost', '[::1]'].flatMap((name) => 80 === port ? [name, name + ':80'] : [name + ':' + port]);
}
function reachable(host, port) {
    return 'string' === typeof host && authorities(port).includes(host.toLowerCase());
}
// A client outside a browser sends no Origin. A page's must be this server.
function originok(origin, port) {
    if (undefined === origin) {
        return true;
    }
    try {
        const url = new URL(origin);
        return 'http:' === url.protocol && authorities(port).includes(url.host.toLowerCase());
    }
    catch (_err) {
        return false;
    }
}
function authorized(header, token) {
    const found = /^Bearer[ \t]+(\S+)$/i.exec(header ?? '');
    if (null == found) {
        return false;
    }
    const given = Buffer.from(found[1]);
    const want = Buffer.from(token);
    return given.length === want.length && (0, crypto_1.timingSafeEqual)(given, want);
}
function read(req) {
    return new Promise((resolve, reject) => {
        if (MAX_BODY < Number(req.headers['content-length'] ?? 0)) {
            req.resume();
            return resolve(undefined);
        }
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (MAX_BODY < size) {
                req.removeAllListeners('data');
                req.resume();
                return resolve(undefined);
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}
function send(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(text),
    });
    res.end(text);
}
function accepted(res) {
    res.writeHead(202, { 'Cache-Control': 'no-store' });
    res.end();
}
function refuse(res, status, message, code = -32600) {
    send(res, status, { jsonrpc: '2.0', id: null, error: { code, message } });
}
//# sourceMappingURL=http.js.map