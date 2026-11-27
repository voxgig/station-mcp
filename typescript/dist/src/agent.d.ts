import type { McpTool } from './tools';
export type AgentStation = {
    status(): {
        [key: string]: any;
    };
    plugins(): {
        name: string;
        slug: string;
        descriptor: any;
    }[];
    events?(): any[];
    secrets?(): Promise<any[]>;
    policies?(): any[];
};
export declare class ToolError extends Error {
    readonly code?: string | undefined;
    readonly candidates?: string[] | undefined;
    constructor(message: string, code?: string | undefined, candidates?: string[] | undefined);
}
export declare const AGENT_TOOLS: McpTool[];
export declare function describe(station: AgentStation, args: any): any;
export declare function traffic(station: AgentStation, args: any, now?: number): any;
export declare function secrets(station: AgentStation, args: any): Promise<any>;
export declare function policy(station: AgentStation, args: any, write: boolean): any;
