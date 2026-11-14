export type StationLike = {
    status(): {
        [key: string]: any;
    };
    plugins(): {
        name: string;
        slug: string;
        descriptor: any;
    }[];
};
export type McpTool = {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: {
            [key: string]: any;
        };
    };
};
export type McpResult = {
    content: {
        type: 'text';
        text: string;
    }[];
    isError?: boolean;
};
export type Mcp = {
    tools(): McpTool[];
    call(name: string, args?: {
        [key: string]: any;
    }): McpResult;
};
export declare function makemcp(station: StationLike): Mcp;
export declare const StationMcp: {
    name: string;
    activate(inst: any): void;
};
