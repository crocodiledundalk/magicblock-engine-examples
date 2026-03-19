import { MirroredAccountMeta } from "../types";

/**
 * In-memory store for per-account delegation metadata.
 *
 * The store is the single source of truth for delegation state during a test.
 * It mirrors what the delegation program would track on-chain in its PDAs,
 * but is managed by the harness to avoid requiring the delegation program
 * binary to be present.
 */
export class MirrorMetaStore {
  private store = new Map<string, MirroredAccountMeta>();

  get(pubkey: string): MirroredAccountMeta | undefined {
    return this.store.get(pubkey);
  }

  set(pubkey: string, meta: MirroredAccountMeta): void {
    this.store.set(pubkey, meta);
  }

  has(pubkey: string): boolean {
    return this.store.has(pubkey);
  }

  delete(pubkey: string): void {
    this.store.delete(pubkey);
  }

  /** Return all metadata entries. */
  all(): MirroredAccountMeta[] {
    return [...this.store.values()];
  }

  /** Return all delegated accounts. */
  allDelegated(): MirroredAccountMeta[] {
    return this.all().filter((m) => m.delegationState === "DELEGATED_TO_ER");
  }

  /** Return all accounts that are dirty in ER. */
  allDirty(): MirroredAccountMeta[] {
    return this.all().filter((m) => m.dirtyInEr);
  }

  /** Reset the store (useful between test suites). */
  clear(): void {
    this.store.clear();
  }

  /** Number of tracked accounts. */
  get size(): number {
    return this.store.size;
  }
}
