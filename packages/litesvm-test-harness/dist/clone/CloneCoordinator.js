"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloneCoordinator = void 0;
const web3_js_1 = require("@solana/web3.js");
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
class CloneCoordinator {
    constructor(base, er, meta, refreshUndelegated) {
        this.base = base;
        this.er = er;
        this.meta = meta;
        this.refreshUndelegated = refreshUndelegated;
    }
    /**
     * Ensure the given accounts are available in ER according to clone policy.
     *
     * @param accountKeys Pubkey strings of all accounts referenced by an ER tx.
     */
    ensureInEr(accountKeys) {
        for (const key of accountKeys) {
            this.ensureAccountInEr(key);
        }
    }
    ensureAccountInEr(key) {
        const pubkey = new web3_js_1.PublicKey(key);
        const existingMeta = this.meta.get(key);
        const erAccount = this.er.getAccount(pubkey);
        if (existingMeta?.delegationState === "DELEGATED_TO_ER") {
            if (!erAccount || existingMeta.residency === "BASE_ONLY") {
                // First use: hydrate from base with original owner.
                this.cloneDelegatedToEr(pubkey, existingMeta);
            }
            // Do NOT refresh if already in ER — ER is authoritative.
            return;
        }
        if (!erAccount) {
            // Not in ER yet — clone as undelegated cache.
            this.cloneUndelegatedToEr(pubkey, existingMeta);
            return;
        }
        if (this.refreshUndelegated &&
            existingMeta?.delegationState === "UNDELEGATED") {
            // Refresh from base.
            this.cloneUndelegatedToEr(pubkey, existingMeta);
        }
    }
    /** Hydrate a delegated account into ER with its original program owner. */
    cloneDelegatedToEr(pubkey, accountMeta) {
        const baseAccount = this.base.getAccount(pubkey);
        if (!baseAccount)
            return;
        // Restore original program owner so the program's constraints pass on ER.
        this.er.setAccount(pubkey, {
            ...baseAccount,
            owner: new web3_js_1.PublicKey(accountMeta.originalOwner),
        });
        accountMeta.residency = "ER_DELEGATED";
    }
    /** Clone or refresh an undelegated account into ER as a read cache. */
    cloneUndelegatedToEr(pubkey, existingMeta) {
        const baseAccount = this.base.getAccount(pubkey);
        if (!baseAccount)
            return;
        this.er.setAccount(pubkey, baseAccount);
        if (!existingMeta) {
            this.meta.set(pubkey.toString(), {
                pubkey: pubkey.toString(),
                residency: "ER_CACHE_UNDELEGATED",
                delegationState: "UNDELEGATED",
                authoritativeLayer: "BASE",
                lastUpdateNonce: 0n,
                lastBaseVersion: 0n,
                dirtyInEr: false,
                executable: baseAccount.executable,
            });
        }
        else {
            existingMeta.residency = "ER_CACHE_UNDELEGATED";
        }
    }
}
exports.CloneCoordinator = CloneCoordinator;
//# sourceMappingURL=CloneCoordinator.js.map