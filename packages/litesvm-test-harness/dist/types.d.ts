/**
 * Account residency describes where the account currently lives.
 *
 * - BASE_ONLY: exists only on the base layer (not yet cloned to ER)
 * - ER_DELEGATED: delegated, primary copy lives in ER
 * - ER_CACHE_UNDELEGATED: base-owned but cached in ER for reads
 * - ER_LOCAL_ONLY: created inside ER, not yet on base
 * - TOMBSTONED: removed from ER (e.g. after undelegation)
 */
export type AccountResidency = "BASE_ONLY" | "ER_DELEGATED" | "ER_CACHE_UNDELEGATED" | "ER_LOCAL_ONLY" | "TOMBSTONED";
/**
 * Delegation state from the delegation program's perspective.
 */
export type DelegationState = "UNDELEGATED" | "DELEGATED_TO_ER" | "UNDELEGATING";
/**
 * Which layer is the source of truth for account state.
 */
export type AuthoritativeLayer = "BASE" | "ER";
/**
 * Harness-level metadata tracked per account.
 *
 * This mirrors what the delegation program stores in its PDAs, plus extra
 * harness bookkeeping.
 */
export interface MirroredAccountMeta {
    pubkey: string;
    residency: AccountResidency;
    delegationState: DelegationState;
    authoritativeLayer: AuthoritativeLayer;
    /** Original Solana owner before delegation changed it. */
    originalOwner?: string;
    /** The ER validator that holds authority over this delegated account. */
    delegationAuthority?: string;
    /** Slot at which delegation was recorded on base. */
    delegationSlot?: bigint;
    /** Commit frequency (milliseconds). 0 = manual commit only. */
    commitFrequencyMs?: bigint;
    /** Account that paid rent for delegation PDAs. */
    rentPayer?: string;
    /** Seeds used to derive the delegated PDA. */
    seeds?: Uint8Array[];
    /**
     * Monotonically increasing nonce tracking successful commits.
     * Mirrors DelegationMetadata.lastUpdateNonce.
     */
    lastUpdateNonce: bigint;
    /** Version counter for base-layer state changes. */
    lastBaseVersion: bigint;
    /** Version counter for ER state changes. */
    lastErVersion?: bigint;
    /** True when ER has uncommitted mutations. */
    dirtyInEr: boolean;
    /** Whether this is a program account. */
    executable: boolean;
}
/**
 * Configuration for the DualLiteSvmHarness.
 */
export interface HarnessConfig {
    /** Pubkey of the ER validator (used to verify delegation authority). */
    erValidatorPubkey?: string;
    /** Delegation program ID override. */
    delegationProgramId?: string;
    /**
     * When true, protocol replay (real DLP CPI) is used for lifecycle events.
     * When false (default), the StateMirrorBackend handles state transitions.
     */
    strictProtocolReplay?: boolean;
    /**
     * When true, undelegated base-backed accounts in ER are refreshed from
     * base before every ER transaction.
     */
    refreshUndelegatedAccountsEveryTx?: boolean;
    /** When true, programs are re-checked before every ER transaction. */
    refreshProgramsEveryTx?: boolean;
    /**
     * When true, SPL Token, Token-2022, and associated token programs are loaded
     * into both SVMs, along with the native mint accounts. Required for any
     * program that CPIs into the SPL token program.
     * Default: false.
     */
    splTokenSupport?: boolean;
}
/**
 * Result of executing a transaction through the harness.
 */
export interface TxOutcome {
    ok: boolean;
    signature?: string;
    logs: string[];
    intents: LifecycleIntent[];
    scannedAccounts: string[];
    /** Error description when ok === false. */
    err?: string;
}
/**
 * Normalised lifecycle intent extracted from a transaction.
 */
export type LifecycleIntent = {
    kind: "DELEGATE";
    accounts: string[];
} | {
    kind: "COMMIT";
    accounts: string[];
} | {
    kind: "UNDELEGATE";
    accounts: string[];
} | {
    kind: "COMMIT_AND_UNDELEGATE";
    accounts: string[];
};
/**
 * Result of scanning a transaction for lifecycle events.
 */
export interface LifecycleScanResult {
    intents: LifecycleIntent[];
    verifiedEvents: VerifiedLifecycleEvent[];
    touchedAccounts: string[];
}
export type VerifiedLifecycleEvent = {
    kind: "DELEGATED";
    account: string;
} | {
    kind: "COMMIT_STAGED";
    account: string;
    nonce: bigint;
} | {
    kind: "COMMIT_FINALIZED";
    account: string;
    nonce: bigint;
} | {
    kind: "UNDELEGATE_READY";
    account: string;
    nonce: bigint;
} | {
    kind: "UNDELEGATED";
    account: string;
};
/**
 * Snapshot of an account's raw bytes at a point in time.
 * Used to compare pre/post state during lifecycle scanning.
 */
export interface AccountSnapshot {
    pubkey: string;
    lamports: bigint;
    data: Uint8Array;
    owner: string;
    exists: boolean;
}
/**
 * Context passed to the BaseProtocolReplayer for commit operations.
 */
export interface ReplayCommitContext {
    erAccountData: Uint8Array;
    erLamports: bigint;
    nonce: bigint;
    allowUndelegation: boolean;
}
/**
 * Context passed to the BaseProtocolReplayer for undelegate operations.
 */
export interface ReplayUndelegateContext {
    nonce: bigint;
}
/**
 * Context for combined commit+undelegate replay.
 */
export interface ReplayCommitAndUndelegateContext {
    erAccountData: Uint8Array;
    erLamports: bigint;
    nonce: bigint;
}
//# sourceMappingURL=types.d.ts.map