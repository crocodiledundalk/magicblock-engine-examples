/**
 * @magicblock-labs/litesvm-test-harness
 *
 * In-process test harness for MagicBlock Ephemeral Rollup flows using LiteSVM.
 *
 * Provides two LiteSVM instances (`base` and `er`) and orchestrates the full
 * delegation lifecycle — delegate, commit, undelegate — without requiring
 * external validators.
 *
 * @example
 * ```ts
 * import { DualLiteSvmHarness } from "@magicblock-labs/litesvm-test-harness";
 * import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
 *
 * const harness = new DualLiteSvmHarness();
 * const payer = Keypair.generate();
 * harness.base.airdrop(payer.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
 * harness.er.airdrop(payer.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
 *
 * harness.loadProgramFromFile(PROGRAM_ID, "target/deploy/my_program.so");
 *
 * // Delegate
 * await harness.delegateToEr(myPda, PROGRAM_ID, payer);
 *
 * // Execute on ER (auto-clones delegated account)
 * await harness.sendErTransaction(myTx, [payer]);
 *
 * // Commit to base
 * await harness.commitAccount(myPda);
 * ```
 */
export { DualLiteSvmHarness } from "./harness/DualLiteSvmHarness";
export { MirrorMetaStore } from "./metadata/MirrorMetaStore";
export { CloneCoordinator } from "./clone/CloneCoordinator";
export { LifecycleScanner } from "./lifecycle/LifecycleScanner";
export { IntentExtractor } from "./lifecycle/IntentExtractor";
export { StateMirrorBackend } from "./protocol/StateMirrorBackend";
export { deriveDelegationRecordPda, deriveDelegationMetadataPda, deriveBufferPda, deriveCommitStatePda, deriveCommitRecordPda, deriveUndelegateBufferPda, deriveAllDelegationPdas, } from "./dlp/pda";
export type { DelegationPdas } from "./dlp/pda";
export { encodeDelegationRecord, decodeDelegationRecord, encodeDelegationMetadata, decodeDelegationMetadata, readCounterValue, } from "./dlp/accountLayouts";
export type { DelegationRecord, DelegationMetadata, CommitRecord, } from "./dlp/accountLayouts";
export { prepareTransaction, extractAccountKeys, extractProgramIds, extractWritableAccountKeys, } from "./solana/txUtils";
export type { AccountResidency, DelegationState, AuthoritativeLayer, MirroredAccountMeta, HarnessConfig, TxOutcome, LifecycleIntent, LifecycleScanResult, VerifiedLifecycleEvent, AccountSnapshot, ReplayCommitContext, ReplayUndelegateContext, ReplayCommitAndUndelegateContext, } from "./types";
export { DELEGATION_PROGRAM_ID, MAGIC_PROGRAM_ID, MAGIC_CONTEXT_ID, DEFAULT_ER_VALIDATOR, SYSTEM_PROGRAM_ID, } from "./constants";
//# sourceMappingURL=index.d.ts.map