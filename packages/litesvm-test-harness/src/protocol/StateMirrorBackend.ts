import { LiteSVM } from "litesvm";
import { PublicKey } from "@solana/web3.js";
import { MirrorMetaStore } from "../metadata/MirrorMetaStore";
import { DELEGATION_PROGRAM_ID } from "../constants";

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
export class StateMirrorBackend {
  constructor(
    private readonly base: LiteSVM,
    private readonly er: LiteSVM,
    private readonly meta: MirrorMetaStore,
  ) {}

  /**
   * Copy the current ER account state to base, keeping the delegation
   * program as the base-layer owner (account remains delegated).
   */
  commitAccount(account: PublicKey): void {
    const accountMeta = this.meta.get(account.toString());
    if (!accountMeta || accountMeta.delegationState !== "DELEGATED_TO_ER") {
      throw new Error(
        `commitAccount: ${account} is not tracked as DELEGATED_TO_ER`,
      );
    }

    const erAccount = this.er.getAccount(account);
    if (!erAccount) {
      // Never accessed in ER — nothing to commit.
      return;
    }

    this.base.setAccount(account, {
      ...erAccount,
      owner: DELEGATION_PROGRAM_ID,
    });

    accountMeta.dirtyInEr = false;
    accountMeta.lastUpdateNonce += 1n;
    accountMeta.lastBaseVersion += 1n;
  }

  /**
   * Commit ER state to base and then restore the original program owner,
   * effectively undelegating the account.
   */
  commitAndUndelegateAccount(account: PublicKey): void {
    const accountMeta = this.meta.get(account.toString());
    if (!accountMeta || accountMeta.delegationState !== "DELEGATED_TO_ER") {
      throw new Error(
        `undelegateAccount: ${account} is not tracked as DELEGATED_TO_ER`,
      );
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
      owner: new PublicKey(accountMeta.originalOwner!),
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
