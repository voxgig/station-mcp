import type { ToolSurface } from './server';
export type HttpOptions = {
    port?: number;
    host?: string;
    path?: string;
    token?: string;
    maxSessions?: number;
};
export type Listening = {
    url: string;
    port: number;
    token: string;
    close(): Promise<void>;
};
export declare function listen(surface: ToolSurface, opts?: HttpOptions): Promise<Listening>;
export declare function reachable(host: string | undefined, port: number): boolean;
export declare function originok(origin: string | undefined, port: number): boolean;
