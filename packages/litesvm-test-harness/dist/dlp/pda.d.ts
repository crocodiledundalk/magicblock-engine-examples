import { PublicKey } from "@solana/web3.js";
/** All PDAs associated with a single delegated account. */
export interface DelegationPdas {
    delegationRecordPda: PublicKey;
    delegationMetadataPda: PublicKey;
    bufferPda: PublicKey;
    commitStatePda: PublicKey;
    commitRecordPda: PublicKey;
    undelegateBufferPda: PublicKey;
}
/**
 * Derive the delegation record PDA for a delegated account.
 * Seeds: ["delegation", delegatedAccount]
 */
export declare function deriveDelegationRecordPda(delegatedAccount: PublicKey): PublicKey;
/**
 * Derive the delegation metadata PDA for a delegated account.
 * Seeds: ["delegation-metadata", delegatedAccount]
 */
export declare function deriveDelegationMetadataPda(delegatedAccount: PublicKey): PublicKey;
/**
 * Derive the buffer PDA for a delegated account.
 * Seeds: ["buffer", delegatedAccount]
 */
export declare function deriveBufferPda(delegatedAccount: PublicKey): PublicKey;
/**
 * Derive the commit state PDA for a delegated account.
 * Seeds: ["commit-state", delegatedAccount]
 */
export declare function deriveCommitStatePda(delegatedAccount: PublicKey): PublicKey;
/**
 * Derive the commit record PDA for a delegated account.
 * Seeds: ["commit-record", delegatedAccount]
 */
export declare function deriveCommitRecordPda(delegatedAccount: PublicKey): PublicKey;
/**
 * Derive the undelegate buffer PDA for a delegated account.
 * Seeds: ["undelegate-buffer", delegatedAccount]
 */
export declare function deriveUndelegateBufferPda(delegatedAccount: PublicKey): PublicKey;
/**
 * Derive all PDAs for a delegated account in one call.
 */
export declare function deriveAllDelegationPdas(delegatedAccount: PublicKey): DelegationPdas;
//# sourceMappingURL=pda.d.ts.map