import { LiteSVM } from "litesvm";
import { PublicKey } from "@solana/web3.js";
import { MirrorMetaStore } from "../metadata/MirrorMetaStore";
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
export declare class StateMirrorBackend {
    private readonly base;
    private readonly er;
    private readonly meta;
    constructor(base: LiteSVM, er: LiteSVM, meta: MirrorMetaStore);
    /**
     * Copy the current ER account state to base, keeping the delegation
     * program as the base-layer owner (account remains delegated).
     */
    commitAccount(account: PublicKey): void;
    /**
     * Commit ER state to base and then restore the original program owner,
     * effectively undelegating the account.
     */
    commitAndUndelegateAccount(account: PublicKey): void;
}
//# sourceMappingURL=StateMirrorBackend.d.ts.map