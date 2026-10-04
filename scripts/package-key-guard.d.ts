// Types for package-key-guard.js, which stays plain JavaScript because
// electron-builder loads its beforePack hook with require()/import(), not
// through a TypeScript loader. Only the tests import these. It is .js + .d.ts,
// not .mjs + .d.mts: `npm run lint` (--ext ts,tsx) never reads a .d.mts, and
// type-laundering-guard.test.ts refuses one for that reason. Neither tsc nor
// ESLint checks the .js itself; package-key-guard-wiring.test.ts keeps this
// file's exports and the .js's in step.

export interface AdminKey {
    /** The JWT's `role` claim, or `sb_secret` for a new-style secret key. */
    kind: 'service_role' | 'sb_secret';
    /** At most the first 4 characters of the key: never more. */
    prefix: string;
}

export interface AdminKeyHit extends AdminKey {
    /** Path relative to the scanned folder, with forward slashes. */
    file: string;
}

export interface ScanOptions {
    /** Files larger than this are refused, not read. Defaults to MAX_FILE_BYTES. */
    maxFileBytes?: number;
}

export interface Scan {
    files: number;
    hits: AdminKeyHit[];
    /** Files too large to read. */
    unread: Array<{ file: string; bytes: number }>;
}

/** The folders electron-builder.json5 packages (`files`): what the guard scans. */
export declare const PACKAGED_ROOTS: readonly string[];

export declare const MAX_FILE_BYTES: number;

export declare function findAdminKeys(text: string): AdminKey[];

export declare function scanProject(appDir: string, options?: ScanOptions): Scan;

/** The refusal for the build in `appDir`, or a null problem. */
export declare function checkProject(appDir: string, options?: ScanOptions): { files: number; problem: string | null };

/** The options the hook reads at either level: the config and the platform's (win, mac, linux). */
export interface PackOptions {
    files?: unknown;
    extraResources?: unknown;
    extraFiles?: unknown;
}

/** The part of electron-builder's BeforePackContext the hook reads. */
export interface PackContext {
    packager: {
        projectDir: string;
        info?: { appDir?: string };
        config: PackOptions;
        platformSpecificBuildOptions?: PackOptions;
    };
}

export declare function beforePack(context: PackContext): Promise<void>;

/** Whether the module at `moduleUrl` is the entry Node was started with
 *  (`process.argv[1]`), compared by real path. The fallback for a Node without
 *  `import.meta.main`. */
export declare function invokedDirectly(moduleUrl: string, entry: string | undefined): boolean;
