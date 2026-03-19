import { PublicKey } from "@solana/web3.js";
import {
  DELEGATION_PROGRAM_ID,
  DELEGATION_SEED,
  DELEGATION_METADATA_SEED,
  BUFFER_SEED,
  COMMIT_STATE_SEED,
  COMMIT_RECORD_SEED,
  UNDELEGATE_BUFFER_SEED,
} from "../constants";

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
export function deriveDelegationRecordPda(
  delegatedAccount: PublicKey,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [DELEGATION_SEED, delegatedAccount.toBuffer()],
    DELEGATION_PROGRAM_ID,
  );
  return pda;
}

/**
 * Derive the delegation metadata PDA for a delegated account.
 * Seeds: ["delegation-metadata", delegatedAccount]
 */
export function deriveDelegationMetadataPda(
  delegatedAccount: PublicKey,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [DELEGATION_METADATA_SEED, delegatedAccount.toBuffer()],
    DELEGATION_PROGRAM_ID,
  );
  return pda;
}

/**
 * Derive the buffer PDA for a delegated account.
 * Seeds: ["buffer", delegatedAccount]
 */
export function deriveBufferPda(delegatedAccount: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [BUFFER_SEED, delegatedAccount.toBuffer()],
    DELEGATION_PROGRAM_ID,
  );
  return pda;
}

/**
 * Derive the commit state PDA for a delegated account.
 * Seeds: ["commit-state", delegatedAccount]
 */
export function deriveCommitStatePda(delegatedAccount: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [COMMIT_STATE_SEED, delegatedAccount.toBuffer()],
    DELEGATION_PROGRAM_ID,
  );
  return pda;
}

/**
 * Derive the commit record PDA for a delegated account.
 * Seeds: ["commit-record", delegatedAccount]
 */
export function deriveCommitRecordPda(delegatedAccount: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [COMMIT_RECORD_SEED, delegatedAccount.toBuffer()],
    DELEGATION_PROGRAM_ID,
  );
  return pda;
}

/**
 * Derive the undelegate buffer PDA for a delegated account.
 * Seeds: ["undelegate-buffer", delegatedAccount]
 */
export function deriveUndelegateBufferPda(
  delegatedAccount: PublicKey,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [UNDELEGATE_BUFFER_SEED, delegatedAccount.toBuffer()],
    DELEGATION_PROGRAM_ID,
  );
  return pda;
}

/**
 * Derive all PDAs for a delegated account in one call.
 */
export function deriveAllDelegationPdas(
  delegatedAccount: PublicKey,
): DelegationPdas {
  return {
    delegationRecordPda: deriveDelegationRecordPda(delegatedAccount),
    delegationMetadataPda: deriveDelegationMetadataPda(delegatedAccount),
    bufferPda: deriveBufferPda(delegatedAccount),
    commitStatePda: deriveCommitStatePda(delegatedAccount),
    commitRecordPda: deriveCommitRecordPda(delegatedAccount),
    undelegateBufferPda: deriveUndelegateBufferPda(delegatedAccount),
  };
}
