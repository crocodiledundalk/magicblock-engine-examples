import { LiteSVM, FailedTransactionMetadata } from "litesvm";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  DELEGATION_PROGRAM_ID,
  DEFAULT_ER_VALIDATOR,
} from "../constants";
import { MirrorMetaStore } from "../metadata/MirrorMetaStore";
import { CloneCoordinator } from "../clone/CloneCoordinator";
import { LifecycleScanner } from "../lifecycle/LifecycleScanner";
import { StateMirrorBackend } from "../protocol/StateMirrorBackend";
import {
  deriveDelegationRecordPda,
  deriveDelegationMetadataPda,
} from "../dlp/pda";
import {
  encodeDelegationRecord,
  encodeDelegationMetadata,
} from "../dlp/accountLayouts";
import {
  HarnessConfig,
  TxOutcome,
  LifecycleIntent,
  MirroredAccountMeta,
} from "../types";
import {
  prepareTransaction,
  extractAccountKeys,
  extractWritableAccountKeys,
} from "../solana/txUtils";

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
export class DualLiteSvmHarness {
  /** Base-layer LiteSVM instance. */
  readonly base: LiteSVM;
  /** Ephemeral rollup LiteSVM instance. */
  readonly er: LiteSVM;
  /** Delegation metadata store. */
  readonly meta: MirrorMetaStore;

  private readonly config: Required<HarnessConfig>;
  private readonly cloner: CloneCoordinator;
  private readonly scanner: LifecycleScanner;
  private readonly mirror: StateMirrorBackend;

  constructor(config: HarnessConfig = {}) {
    // Disable transaction history so that semantically-identical transactions
    // (same instruction, same accounts, same blockhash) can be sent repeatedly
    // without hitting duplicate-transaction errors.
    this.base = new LiteSVM().withTransactionHistory(0n);
    this.er = new LiteSVM().withTransactionHistory(0n);
    this.meta = new MirrorMetaStore();

    this.config = {
      erValidatorPubkey:
        config.erValidatorPubkey ?? DEFAULT_ER_VALIDATOR.toString(),
      delegationProgramId:
        config.delegationProgramId ?? DELEGATION_PROGRAM_ID.toString(),
      strictProtocolReplay: config.strictProtocolReplay ?? false,
      refreshUndelegatedAccountsEveryTx:
        config.refreshUndelegatedAccountsEveryTx ?? true,
      refreshProgramsEveryTx: config.refreshProgramsEveryTx ?? false,
    };

    this.cloner = new CloneCoordinator(
      this.base,
      this.er,
      this.meta,
      this.config.refreshUndelegatedAccountsEveryTx,
    );
    this.scanner = new LifecycleScanner();
    this.mirror = new StateMirrorBackend(this.base, this.er, this.meta);
  }

  // -------------------------------------------------------------------------
  // Program loading
  // -------------------------------------------------------------------------

  /**
   * Load a program into BOTH base and ER SVMs from raw bytes.
   *
   * Call this once during test setup for every program that will be invoked
   * on either layer.
   */
  loadProgram(programId: PublicKey, programBytes: Uint8Array): void {
    this.base.addProgram(programId, programBytes);
    this.er.addProgram(programId, programBytes);
  }

  /**
   * Load a program into BOTH base and ER SVMs from a .so file path.
   */
  loadProgramFromFile(programId: PublicKey, filePath: string): void {
    this.base.addProgramFromFile(programId, filePath);
    this.er.addProgramFromFile(programId, filePath);
  }

  /**
   * Load a program into ONLY the base SVM.
   */
  loadProgramOnBase(programId: PublicKey, programBytes: Uint8Array): void {
    this.base.addProgram(programId, programBytes);
  }

  /**
   * Load a program into ONLY the ER SVM.
   */
  loadProgramOnEr(programId: PublicKey, programBytes: Uint8Array): void {
    this.er.addProgram(programId, programBytes);
  }

  // -------------------------------------------------------------------------
  // Transaction execution
  // -------------------------------------------------------------------------

  /**
   * Sign and execute a transaction on the BASE layer.
   *
   * @param tx      Pre-built transaction (no blockhash/feePayer required).
   * @param signers Keypairs to sign with; first signer is the fee payer.
   * @returns       TxOutcome with ok, logs, and detected lifecycle intents.
   */
  async sendBaseTransaction(
    tx: Transaction,
    signers: Keypair[],
  ): Promise<TxOutcome> {
    prepareTransaction(tx, signers, this.base.latestBlockhash());

    const result = this.base.sendTransaction(tx);

    if (result instanceof FailedTransactionMetadata) {
      return this.failedOutcome(result);
    }

    const logs = result.logs() ?? [];
    const scanResult = this.scanner.scan("BASE", tx, logs);

    return {
      ok: true,
      logs,
      intents: scanResult.intents,
      scannedAccounts: scanResult.touchedAccounts,
    };
  }

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
  async sendErTransaction(
    tx: Transaction,
    signers: Keypair[],
    autoApply = false,
  ): Promise<TxOutcome> {
    // Preflight: hydrate accounts into ER.
    const accountKeys = extractAccountKeys(tx);
    this.cloner.ensureInEr(accountKeys);

    prepareTransaction(tx, signers, this.er.latestBlockhash());

    const result = this.er.sendTransaction(tx);

    if (result instanceof FailedTransactionMetadata) {
      return this.failedOutcome(result);
    }

    const logs = result.logs() ?? [];

    // Mark writable delegated accounts as dirty.
    for (const key of extractWritableAccountKeys(tx)) {
      const m = this.meta.get(key);
      if (m?.delegationState === "DELEGATED_TO_ER") {
        m.dirtyInEr = true;
        if (m.lastErVersion !== undefined) {
          m.lastErVersion += 1n;
        } else {
          m.lastErVersion = 1n;
        }
      }
    }

    const scanResult = this.scanner.scan("ER", tx, logs);

    if (autoApply) {
      await this.applyErIntents(scanResult.intents);
    }

    return {
      ok: true,
      logs,
      intents: scanResult.intents,
      scannedAccounts: scanResult.touchedAccounts,
    };
  }

  // -------------------------------------------------------------------------
  // Delegation lifecycle (StateMirrorBackend)
  // -------------------------------------------------------------------------

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
  async delegateToEr(
    account: PublicKey,
    ownerProgram: PublicKey,
    payer: Keypair,
    seeds?: Uint8Array[],
    commitFrequencyMs = 0n,
  ): Promise<void> {
    const baseAccount = this.base.getAccount(account);
    if (!baseAccount) {
      throw new Error(
        `delegateToEr: account ${account} not found on base. ` +
          `Make sure to initialize it first.`,
      );
    }

    const erValidator = new PublicKey(this.config.erValidatorPubkey);

    // 1. Change base account owner to delegation program.
    this.base.setAccount(account, {
      ...baseAccount,
      owner: DELEGATION_PROGRAM_ID,
    });

    // 2. Create delegation record PDA on base.
    const delegationRecordPda = deriveDelegationRecordPda(account);
    const delegationRecordData = encodeDelegationRecord({
      authority: erValidator,
      owner: ownerProgram,
      delegationSlot: 0n,
      lamports: BigInt(baseAccount.lamports),
      commitFrequencyMs,
    });
    const recordRent = Number(
      this.base.minimumBalanceForRentExemption(
        BigInt(delegationRecordData.length),
      ),
    );
    this.base.setAccount(delegationRecordPda, {
      executable: false,
      owner: DELEGATION_PROGRAM_ID,
      lamports: recordRent,
      data: delegationRecordData,
    });

    // 3. Create delegation metadata PDA on base.
    const delegationMetadataPda = deriveDelegationMetadataPda(account);
    const delegationMetadataData = encodeDelegationMetadata({
      lastUpdateNonce: 0n,
      isUndelegatable: false,
      seeds: seeds ?? [],
      rentPayer: payer.publicKey,
    });
    const metaRent = Number(
      this.base.minimumBalanceForRentExemption(
        BigInt(delegationMetadataData.length),
      ),
    );
    this.base.setAccount(delegationMetadataPda, {
      executable: false,
      owner: DELEGATION_PROGRAM_ID,
      lamports: metaRent,
      data: delegationMetadataData,
    });

    // 4. Record delegation in metadata store.
    this.meta.set(account.toString(), {
      pubkey: account.toString(),
      residency: "BASE_ONLY",
      delegationState: "DELEGATED_TO_ER",
      authoritativeLayer: "ER",
      originalOwner: ownerProgram.toString(),
      delegationAuthority: erValidator.toString(),
      commitFrequencyMs,
      seeds,
      lastUpdateNonce: 0n,
      lastBaseVersion: 0n,
      dirtyInEr: false,
      executable: false,
    });
  }

  /**
   * Commit the current ER state for a delegated account to base.
   *
   * The account remains delegated (ER stays authoritative).
   *
   * Equivalent to the ER-side `commit_accounts()` → base-side finalization
   * flow in production.
   */
  async commitAccount(account: PublicKey): Promise<void> {
    this.mirror.commitAccount(account);
  }

  /**
   * Undelegate an account: commit ER state to base and restore the original
   * program owner. After this call the account is BASE-authoritative again.
   *
   * Equivalent to `commit_and_undelegate_accounts()` → base-side undelegate
   * flow in production.
   */
  async undelegateAccount(account: PublicKey): Promise<void> {
    this.mirror.commitAndUndelegateAccount(account);
  }

  /**
   * Convenience alias for undelegateAccount (commit + undelegate in one step).
   */
  async commitAndUndelegateAccount(account: PublicKey): Promise<void> {
    await this.undelegateAccount(account);
  }

  // -------------------------------------------------------------------------
  // Account inspection helpers
  // -------------------------------------------------------------------------

  /**
   * Return the raw AccountInfo for an account on the base layer, or null.
   */
  getBaseAccount(pubkey: PublicKey) {
    return this.base.getAccount(pubkey);
  }

  /**
   * Return the raw AccountInfo for an account on the ER, or null.
   */
  getErAccount(pubkey: PublicKey) {
    return this.er.getAccount(pubkey);
  }

  /**
   * Return the delegation metadata for an account, or undefined.
   */
  getAccountMeta(pubkey: PublicKey): MirroredAccountMeta | undefined {
    return this.meta.get(pubkey.toString());
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private failedOutcome(result: FailedTransactionMetadata): TxOutcome {
    return {
      ok: false,
      logs: result.meta().logs() ?? [],
      intents: [],
      scannedAccounts: [],
      err: String(result.err()),
    };
  }

  private async applyErIntents(intents: LifecycleIntent[]): Promise<void> {
    for (const intent of intents) {
      if (intent.kind === "COMMIT") {
        for (const acc of intent.accounts) {
          const m = this.meta.get(acc);
          if (m?.delegationState === "DELEGATED_TO_ER") {
            await this.commitAccount(new PublicKey(acc));
          }
        }
      } else if (
        intent.kind === "UNDELEGATE" ||
        intent.kind === "COMMIT_AND_UNDELEGATE"
      ) {
        for (const acc of intent.accounts) {
          const m = this.meta.get(acc);
          if (m?.delegationState === "DELEGATED_TO_ER") {
            await this.undelegateAccount(new PublicKey(acc));
          }
        }
      }
    }
  }
}
