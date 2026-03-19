"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MirrorMetaStore = void 0;
/**
 * In-memory store for per-account delegation metadata.
 *
 * The store is the single source of truth for delegation state during a test.
 * It mirrors what the delegation program would track on-chain in its PDAs,
 * but is managed by the harness to avoid requiring the delegation program
 * binary to be present.
 */
class MirrorMetaStore {
    constructor() {
        this.store = new Map();
    }
    get(pubkey) {
        return this.store.get(pubkey);
    }
    set(pubkey, meta) {
        this.store.set(pubkey, meta);
    }
    has(pubkey) {
        return this.store.has(pubkey);
    }
    delete(pubkey) {
        this.store.delete(pubkey);
    }
    /** Return all metadata entries. */
    all() {
        return [...this.store.values()];
    }
    /** Return all delegated accounts. */
    allDelegated() {
        return this.all().filter((m) => m.delegationState === "DELEGATED_TO_ER");
    }
    /** Return all accounts that are dirty in ER. */
    allDirty() {
        return this.all().filter((m) => m.dirtyInEr);
    }
    /** Reset the store (useful between test suites). */
    clear() {
        this.store.clear();
    }
    /** Number of tracked accounts. */
    get size() {
        return this.store.size;
    }
}
exports.MirrorMetaStore = MirrorMetaStore;
//# sourceMappingURL=MirrorMetaStore.js.map