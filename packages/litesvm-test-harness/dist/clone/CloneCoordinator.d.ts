import { LiteSVM } from "litesvm";
import { MirrorMetaStore } from "../metadata/MirrorMetaStore";
/**
 * CloneCoordinator manages the hydration of accounts from base into ER.
 *
 * Clone policy:
 *   - DELEGATED accounts: cloned once on first ER reference, then ER is
 *     authoritative until commit/undelegate.
 *   - UNDELEGATED accounts: cloned (or refreshed) from base on every ER
 *     transaction, according to HarnessConfig.refreshUndelegatedAccountsEveryTx.
 *   - Programs: cloned once from base on first ER reference (or deployed at
 *     setup via harness.loadProgram).
 */
export declare class CloneCoordinator {
    private readonly base;
    private readonly er;
    private readonly meta;
    private readonly refreshUndelegated;
    constructor(base: LiteSVM, er: LiteSVM, meta: MirrorMetaStore, refreshUndelegated: boolean);
    /**
     * Ensure the given accounts are available in ER according to clone policy.
     *
     * @param accountKeys Pubkey strings of all accounts referenced by an ER tx.
     */
    ensureInEr(accountKeys: string[]): void;
    private ensureAccountInEr;
    /** Hydrate a delegated account into ER with its original program owner. */
    private cloneDelegatedToEr;
    /** Clone or refresh an undelegated account into ER as a read cache. */
    private cloneUndelegatedToEr;
}
//# sourceMappingURL=CloneCoordinator.d.ts.map