declare namespace sqlite3 {
    export interface Database {
        testnum: number;
        getAsync(sql: string, params: any): Promise<void>;
        runAsync(sql: string, params: any): Promise<void>;
        allAsync(sql: string, params: any): Promise<void>;
        trace(): Promise<void>;
    }
}
