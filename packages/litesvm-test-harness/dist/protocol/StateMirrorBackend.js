"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateMirrorBackend = void 0;
const web3_js_1 = require("@solana/web3.js");
const constants_1 = require("../constants");
/**
 * StateMirrorBackend performs direct account-data copies between base and ER.
 *
 * This is the default backend for the harness. It is suitable for:
 *   - Fixture setup
 *   - Simple program logic tests that don't validate DLP PDA correctness
 *   - Rapid integration tests
 *
 * It does NOT:
 *   - Invoke the real delegation program
 *   - Advance delegation PDAs (nonces, commit records, etc.)
 *   - Validate undelegatability state before undelegation
 *
 * For full delegation-semantic validation, pair with ProtocolReplayBackend
 * once the delegation program binary is available.
 */
class StateMirrorBackend {
    constructor(base, er, meta) {
        this.base = base;
        this.er = er;
        this.meta = meta;
    }
    /**
     * Copy the current ER account state to base, keeping the delegation
     * program as the base-layer owner (account remains delegated).
     */
    commitAccount(account) {
        const accountMeta = this.meta.get(account.toString());
        if (!accountMeta || accountMeta.delegationState !== "DELEGATED_TO_ER") {
            throw new Error(`commitAccount: ${account} is not tracked as DELEGATED_TO_ER`);
        }
        const erAccount = this.er.getAccount(account);
        if (!erAccount) {
            // Never accessed in ER — nothing to commit.
            return;
        }
        this.base.setAccount(account, {
            ...erAccount,
            owner: constants_1.DELEGATION_PROGRAM_ID,
        });
        accountMeta.dirtyInEr = false;
        accountMeta.lastUpdateNonce += 1n;
        accountMeta.lastBaseVersion += 1n;
    }
    /**
     * Commit ER state to base and then restore the original program owner,
     * effectively undelegating the account.
     */
    commitAndUndelegateAccount(account) {
        const accountMeta = this.meta.get(account.toString());
        if (!accountMeta || accountMeta.delegationState !== "DELEGATED_TO_ER") {
            throw new Error(`undelegateAccount: ${account} is not tracked as DELEGATED_TO_ER`);
        }
        const erAccount = this.er.getAccount(account);
        const baseAccount = this.base.getAccount(account);
        const source = erAccount ?? baseAccount;
        if (!source) {
            throw new Error(`undelegateAccount: ${account} not found in either SVM`);
        }
        // Restore original owner on base.
        this.base.setAccount(account, {
            ...source,
            owner: new web3_js_1.PublicKey(accountMeta.originalOwner),
        });
        // Update metadata.
        accountMeta.delegationState = "UNDELEGATED";
        accountMeta.residency = "BASE_ONLY";
        accountMeta.authoritativeLayer = "BASE";
        accountMeta.dirtyInEr = false;
        accountMeta.lastUpdateNonce += 1n;
        accountMeta.lastBaseVersion += 1n;
    }
}
exports.StateMirrorBackend = StateMirrorBackend;
//# sourceMappingURL=StateMirrorBackend.js.map