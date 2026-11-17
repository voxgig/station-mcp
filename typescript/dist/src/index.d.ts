import { PROTOCOL_VERSIONS, SERVER_INFO } from './server';
import type { Stdio, ToolSurface } from './server';
import { toolprefix } from './tools';
import type { BoundSdk, McpResult, McpTool } from './tools';
export { PROTOCOL_VERSIONS, SERVER_INFO, toolprefix };
export type { BoundSdk, McpResult, McpTool, Stdio };
export type StationLike = {
    status(): {
        [key: string]: any;
    };
    plugins(): {
        name: string;
        slug: string;
        descriptor: any;
    }[];
    redact(text: string): string;
};
export type McpOptions = {
    write?: boolean;
};
export type Mcp = ToolSurface & {
    handle(message: any): Promise<any>;
    serve(io: Stdio): () => void;
};
export declare const BOUND_POINT = "sdk.bound";
export declare function makemcp(station: StationLike, sdks?: BoundSdk[], options?: McpOptions): Mcp;
export declare const StationMcp: {
    name: string;
    define(inst: any): void;
};
