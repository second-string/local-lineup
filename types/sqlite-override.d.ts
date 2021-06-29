import {Database} from "sqlite3";

declare module "sqlite3" {
    export interface Database {
        testnum: number;
        getAsync(sql: string, params?: any): Promise<any>;
        runAsync(sql: string, params?: any): Promise<any>;
        allAsync(sql: string, params?: any): Promise<any>;
        trace(): Promise<void>;
    }
}
