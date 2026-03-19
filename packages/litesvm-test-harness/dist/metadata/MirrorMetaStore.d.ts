import { MirroredAccountMeta } from "../types";
/**
 * In-memory store for per-account delegation metadata.
 *
 * The store is the single source of truth for delegation state during a test.
 * It mirrors what the delegation program would track on-chain in its PDAs,
 * but is managed by the harness to avoid requiring the delegation program
 * binary to be present.
 */
export declare class MirrorMetaStore {
    private store;
    get(pubkey: string): MirroredAccountMeta | undefined;
    set(pubkey: string, meta: MirroredAccountMeta): void;
    has(pubkey: string): boolean;
    delete(pubkey: string): void;
    /** Return all metadata entries. */
    all(): MirroredAccountMeta[];
    /** Return all delegated accounts. */
    allDelegated(): MirroredAccountMeta[];
    /** Return all accounts that are dirty in ER. */
    allDirty(): MirroredAccountMeta[];
    /** Reset the store (useful between test suites). */
    clear(): void;
    /** Number of tracked accounts. */
    get size(): number;
}
//# sourceMappingURL=MirrorMetaStore.d.ts.map