// Types for package-key-guard.js, which stays plain JavaScript because
// electron-builder loads its beforePack hook with require()/import(), not
// through a TypeScript loader. Only the tests import these. It is .js + .d.ts,
// not .mjs + .d.mts: `npm run lint` (--ext ts,tsx) never reads a .d.mts, and
// type-laundering-guard.test.ts refuses one for that reason.

export interface AdminKey {
    /** The JWT's `role` claim, or `sb_secret` for a new-style secret key. */
    kind: 'service_role' | 'sb_secret';
    /** At most the first 4 characters of the key: never more. */
    prefix: string;
}

export interface AdminKeyHit extends AdminKey {
    /** Project-relative path with forward slashes. */
    file: string;
}

/** The folders electron-builder.json5 packages (`files`): what the guard scans. */
export declare const PACKAGED_ROOTS: readonly string[];

export declare function findAdminKeys(text: string): AdminKey[];

export declare function scanProject(projectDir: string): { files: number; hits: AdminKeyHit[] };

/** The part of electron-builder's BeforePackContext the hook reads. */
export interface PackContext {
    packager: { projectDir: string; config: { files?: unknown } };
}

export declare function beforePack(context: PackContext): Promise<void>;
