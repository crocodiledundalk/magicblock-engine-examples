import { LiteSVM } from "litesvm";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { MirrorMetaStore } from "../metadata/MirrorMetaStore";
import { HarnessConfig, TxOutcome, MirroredAccountMeta } from "../types";
/**
 * DualLiteSvmHarness is the main entry point for in-process MagicBlock ER
 * testing.
 *
 * It holds two LiteSVM instances — `base` and `er` — and orchestrates:
 *   - Account hydration (base → ER) according to clone policy
 *   - Delegation state tracking via MirrorMetaStore
 *   - Lifecycle detection (delegate / commit / undelegate)
 *   - Base-side reconciliation via StateMirrorBackend
 *
 * ## Quick-start
 *
 * ```ts
 * const harness = new DualLiteSvmHarness();
 * const payer = Keypair.generate();
 * harness.base.airdrop(payer.publicKey, BigInt(10e9));
 * harness.er.airdrop(payer.publicKey, BigInt(10e9));
 *
 * harness.loadProgramFromFile(PROGRAM_ID, "target/deploy/my_program.so");
 *
 * // Initialize on base
 * const initTx = await program.methods.initialize().transaction();
 * await harness.sendBaseTransaction(initTx, [payer]);
 *
 * // Delegate account to ER
 * await harness.delegateToEr(myPda, PROGRAM_ID, payer);
 *
 * // Execute ER transaction (account auto-cloned)
 * const erTx = await program.methods.myAction().transaction();
 * await harness.sendErTransaction(erTx, [payer]);
 *
 * // Commit ER state back to base
 * await harness.commitAccount(myPda);
 * ```
 *
 * ## Protocol replay vs StateMirrorBackend
 *
 * By default the harness uses StateMirrorBackend (direct state copies) for
 * reconciliation. This avoids the need for the delegation program binary and
 * is suitable for most program-logic tests.
 *
 * Set `strictProtocolReplay: true` in config to require the ProtocolReplay-
 * Backend (real DLP CPI), which validates delegation PDAs, nonces, and
 * undelegatability. That backend requires the delegation program .so to be
 * loaded into both SVMs.
 */
export declare class DualLiteSvmHarness {
    /** Base-layer LiteSVM instance. */
    readonly base: LiteSVM;
    /** Ephemeral rollup LiteSVM instance. */
    readonly er: LiteSVM;
    /** Delegation metadata store. */
    readonly meta: MirrorMetaStore;
    private readonly config;
    private readonly cloner;
    private readonly scanner;
    private readonly mirror;
    constructor(config?: HarnessConfig);
    /**
     * Load a program into BOTH base and ER SVMs from raw bytes.
     *
     * Call this once during test setup for every program that will be invoked
     * on either layer.
     */
    loadProgram(programId: PublicKey, programBytes: Uint8Array): void;
    /**
     * Load a program into BOTH base and ER SVMs from a .so file path.
     */
    loadProgramFromFile(programId: PublicKey, filePath: string): void;
    /**
     * Load a program into ONLY the base SVM.
     */
    loadProgramOnBase(programId: PublicKey, programBytes: Uint8Array): void;
    /**
     * Load a program into ONLY the ER SVM.
     */
    loadProgramOnEr(programId: PublicKey, programBytes: Uint8Array): void;
    /**
     * Sign and execute a transaction on the BASE layer.
     *
     * @param tx      Pre-built transaction (no blockhash/feePayer required).
     * @param signers Keypairs to sign with; first signer is the fee payer.
     * @returns       TxOutcome with ok, logs, and detected lifecycle intents.
     */
    sendBaseTransaction(tx: Transaction, signers: Keypair[]): Promise<TxOutcome>;
    /**
     * Preflight, sign, and execute a transaction on the ER layer.
     *
     * Before executing:
     *   1. Delegated accounts not yet in ER are cloned from base.
     *   2. Undelegated accounts not in ER are cached from base.
     *   3. All programs referenced by the tx must be available in ER.
     *
     * After executing:
     *   1. Writable delegated accounts are marked dirty.
     *   2. Lifecycle intents are extracted and, if auto-apply is enabled,
     *      applied immediately (e.g. detected commit → mirror to base).
     *
     * @param tx          Pre-built transaction.
     * @param signers     Keypairs to sign with; first signer is the fee payer.
     * @param autoApply   When true (default), apply detected lifecycle intents
     *                    immediately after the transaction.
     */
    sendErTransaction(tx: Transaction, signers: Keypair[], autoApply?: boolean): Promise<TxOutcome>;
    /**
     * Delegate an account to the ER.
     *
     * This is the harness-managed equivalent of calling the delegation program's
     * `delegate` instruction on base. It:
     *   1. Changes the account's owner to the delegation program on base.
     *   2. Creates delegation record and metadata PDAs on base.
     *   3. Records delegation metadata in MirrorMetaStore.
     *
     * No SVM transaction is executed. Call this after confirming on-chain
     * delegation (or as the sole delegation step in StateMirrorBackend tests).
     *
     * @param account          The PDA to delegate.
     * @param ownerProgram     The program that currently owns the account.
     * @param payer            Keypair that pays for delegation PDAs.
     * @param seeds            Optional PDA seeds (for process_undelegation CPI).
     * @param commitFrequencyMs Commit interval (0 = manual only).
     */
    delegateToEr(account: PublicKey, ownerProgram: PublicKey, payer: Keypair, seeds?: Uint8Array[], commitFrequencyMs?: bigint): Promise<void>;
    /**
     * Commit the current ER state for a delegated account to base.
     *
     * The account remains delegated (ER stays authoritative).
     *
     * Equivalent to the ER-side `commit_accounts()` → base-side finalization
     * flow in production.
     */
    commitAccount(account: PublicKey): Promise<void>;
    /**
     * Undelegate an account: commit ER state to base and restore the original
     * program owner. After this call the account is BASE-authoritative again.
     *
     * Equivalent to `commit_and_undelegate_accounts()` → base-side undelegate
     * flow in production.
     */
    undelegateAccount(account: PublicKey): Promise<void>;
    /**
     * Convenience alias for undelegateAccount (commit + undelegate in one step).
     */
    commitAndUndelegateAccount(account: PublicKey): Promise<void>;
    /**
     * Return the raw AccountInfo for an account on the base layer, or null.
     */
    getBaseAccount(pubkey: PublicKey): import("litesvm").AccountInfoBytes | null;
    /**
     * Return the raw AccountInfo for an account on the ER, or null.
     */
    getErAccount(pubkey: PublicKey): import("litesvm").AccountInfoBytes | null;
    /**
     * Return the delegation metadata for an account, or undefined.
     */
    getAccountMeta(pubkey: PublicKey): MirroredAccountMeta | undefined;
    private failedOutcome;
    private applyErIntents;
}
//# sourceMappingURL=DualLiteSvmHarness.d.ts.map