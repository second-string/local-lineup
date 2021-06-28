declare namespace sqlite3 {
    export interface Database {
        testnum: number;
        trace(): void;
    }
}
