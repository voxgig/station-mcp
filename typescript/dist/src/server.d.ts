import type { McpResult, McpTool } from './tools';
export declare const PROTOCOL_VERSIONS: string[];
export declare const SERVER_INFO: {
    name: string;
    version: string;
};
export type ToolSurface = {
    tools(): McpTool[];
    has(name: string): boolean;
    call(name: string, args?: any): Promise<McpResult>;
    redact(text: string): string;
};
type Reply = {
    jsonrpc: '2.0';
    id: any;
    result?: any;
    error?: {
        code: number;
        message: string;
    };
};
export declare function handle(surface: ToolSurface, message: any): Promise<Reply | undefined>;
export type Stdio = {
    input: NodeJS.ReadableStream;
    output: {
        write(text: string): any;
    };
};
export declare function serve(surface: ToolSurface, io: Stdio): () => void;
export {};
