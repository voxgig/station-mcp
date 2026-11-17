export type BoundSdk = {
    name: string;
    api: string;
    descriptor: any;
    client: any;
};
export type McpTool = {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: {
            [key: string]: any;
        };
        required?: string[];
    };
    annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
    };
};
export type McpResult = {
    content: {
        type: 'text';
        text: string;
    }[];
    isError?: boolean;
};
export type SdkTool = {
    tool: McpTool;
    sdk: BoundSdk;
    op: string;
    entities: string[];
};
export declare function toolprefix(name: string): string;
export declare function sdktools(sdks: BoundSdk[], write: boolean): SdkTool[];
export declare function runtool(sdkTool: SdkTool, args: any): Promise<any>;
