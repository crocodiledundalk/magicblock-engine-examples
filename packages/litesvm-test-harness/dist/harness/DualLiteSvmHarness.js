"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DualLiteSvmHarness = void 0;
const litesvm_1 = require("litesvm");
const web3_js_1 = require("@solana/web3.js");
const constants_1 = require("../constants");
const MirrorMetaStore_1 = require("../metadata/MirrorMetaStore");
const CloneCoordinator_1 = require("../clone/CloneCoordinator");
const LifecycleScanner_1 = require("../lifecycle/LifecycleScanner");
const StateMirrorBackend_1 = require("../protocol/StateMirrorBackend");
const pda_1 = require("../dlp/pda");
const accountLayouts_1 = require("../dlp/accountLayouts");
const txUtils_1 = require("../solana/txUtils");
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
class DualLiteSvmHarness {
    constructor(config = {}) {
        // Disable transaction history so that semantically-identical transactions
        // (same instruction, same accounts, same blockhash) can be sent repeatedly
        // without hitting duplicate-transaction errors.
        const makeSvm = () => {
            let svm = new litesvm_1.LiteSVM().withTransactionHistory(0n);
            if (config.splTokenSupport) {
                svm = svm.withDefaultPrograms().withNativeMints();
            }
            return svm;
        };
        this.base = makeSvm();
        this.er = makeSvm();
        this.meta = new MirrorMetaStore_1.MirrorMetaStore();
        this.config = {
            erValidatorPubkey: config.erValidatorPubkey ?? constants_1.DEFAULT_ER_VALIDATOR.toString(),
            delegationProgramId: config.delegationProgramId ?? constants_1.DELEGATION_PROGRAM_ID.toString(),
            strictProtocolReplay: config.strictProtocolReplay ?? false,
            refreshUndelegatedAccountsEveryTx: config.refreshUndelegatedAccountsEveryTx ?? true,
            refreshProgramsEveryTx: config.refreshProgramsEveryTx ?? false,
            splTokenSupport: config.splTokenSupport ?? false,
        };
        this.cloner = new CloneCoordinator_1.CloneCoordinator(this.base, this.er, this.meta, this.config.refreshUndelegatedAccountsEveryTx);
        this.scanner = new LifecycleScanner_1.LifecycleScanner();
        this.mirror = new StateMirrorBackend_1.StateMirrorBackend(this.base, this.er, this.meta);
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
    loadProgram(programId, programBytes) {
        this.base.addProgram(programId, programBytes);
        this.er.addProgram(programId, programBytes);
    }
    /**
     * Load a program into BOTH base and ER SVMs from a .so file path.
     */
    loadProgramFromFile(programId, filePath) {
        this.base.addProgramFromFile(programId, filePath);
        this.er.addProgramFromFile(programId, filePath);
    }
    /**
     * Load a program into ONLY the base SVM.
     */
    loadProgramOnBase(programId, programBytes) {
        this.base.addProgram(programId, programBytes);
    }
    /**
     * Load a program into ONLY the ER SVM.
     */
    loadProgramOnEr(programId, programBytes) {
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
    async sendBaseTransaction(tx, signers) {
        (0, txUtils_1.prepareTransaction)(tx, signers, this.base.latestBlockhash());
        const result = this.base.sendTransaction(tx);
        if (result instanceof litesvm_1.FailedTransactionMetadata) {
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
    async sendErTransaction(tx, signers, autoApply = false) {
        // Preflight: hydrate accounts into ER.
        const accountKeys = (0, txUtils_1.extractAccountKeys)(tx);
        this.cloner.ensureInEr(accountKeys);
        (0, txUtils_1.prepareTransaction)(tx, signers, this.er.latestBlockhash());
        const result = this.er.sendTransaction(tx);
        if (result instanceof litesvm_1.FailedTransactionMetadata) {
            return this.failedOutcome(result);
        }
        const logs = result.logs() ?? [];
        // Mark writable delegated accounts as dirty.
        for (const key of (0, txUtils_1.extractWritableAccountKeys)(tx)) {
            const m = this.meta.get(key);
            if (m?.delegationState === "DELEGATED_TO_ER") {
                m.dirtyInEr = true;
                if (m.lastErVersion !== undefined) {
                    m.lastErVersion += 1n;
                }
                else {
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
    async delegateToEr(account, ownerProgram, payer, seeds, commitFrequencyMs = 0n) {
        const baseAccount = this.base.getAccount(account);
        if (!baseAccount) {
            throw new Error(`delegateToEr: account ${account} not found on base. ` +
                `Make sure to initialize it first.`);
        }
        const erValidator = new web3_js_1.PublicKey(this.config.erValidatorPubkey);
        // 1. Change base account owner to delegation program.
        this.base.setAccount(account, {
            ...baseAccount,
            owner: constants_1.DELEGATION_PROGRAM_ID,
        });
        // 2. Create delegation record PDA on base.
        const delegationRecordPda = (0, pda_1.deriveDelegationRecordPda)(account);
        const delegationRecordData = (0, accountLayouts_1.encodeDelegationRecord)({
            authority: erValidator,
            owner: ownerProgram,
            delegationSlot: 0n,
            lamports: BigInt(baseAccount.lamports),
            commitFrequencyMs,
        });
        const recordRent = Number(this.base.minimumBalanceForRentExemption(BigInt(delegationRecordData.length)));
        this.base.setAccount(delegationRecordPda, {
            executable: false,
            owner: constants_1.DELEGATION_PROGRAM_ID,
            lamports: recordRent,
            data: delegationRecordData,
        });
        // 3. Create delegation metadata PDA on base.
        const delegationMetadataPda = (0, pda_1.deriveDelegationMetadataPda)(account);
        const delegationMetadataData = (0, accountLayouts_1.encodeDelegationMetadata)({
            lastUpdateNonce: 0n,
            isUndelegatable: false,
            seeds: seeds ?? [],
            rentPayer: payer.publicKey,
        });
        const metaRent = Number(this.base.minimumBalanceForRentExemption(BigInt(delegationMetadataData.length)));
        this.base.setAccount(delegationMetadataPda, {
            executable: false,
            owner: constants_1.DELEGATION_PROGRAM_ID,
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
    async commitAccount(account) {
        this.mirror.commitAccount(account);
    }
    /**
     * Undelegate an account: commit ER state to base and restore the original
     * program owner. After this call the account is BASE-authoritative again.
     *
     * Equivalent to `commit_and_undelegate_accounts()` → base-side undelegate
     * flow in production.
     */
    async undelegateAccount(account) {
        this.mirror.commitAndUndelegateAccount(account);
    }
    /**
     * Convenience alias for undelegateAccount (commit + undelegate in one step).
     */
    async commitAndUndelegateAccount(account) {
        await this.undelegateAccount(account);
    }
    // -------------------------------------------------------------------------
    // Account inspection helpers
    // -------------------------------------------------------------------------
    /**
     * Return the raw AccountInfo for an account on the base layer, or null.
     */
    getBaseAccount(pubkey) {
        return this.base.getAccount(pubkey);
    }
    /**
     * Return the raw AccountInfo for an account on the ER, or null.
     */
    getErAccount(pubkey) {
        return this.er.getAccount(pubkey);
    }
    /**
     * Return the delegation metadata for an account, or undefined.
     */
    getAccountMeta(pubkey) {
        return this.meta.get(pubkey.toString());
    }
    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------
    failedOutcome(result) {
        return {
            ok: false,
            logs: result.meta().logs() ?? [],
            intents: [],
            scannedAccounts: [],
            err: String(result.err()),
        };
    }
    async applyErIntents(intents) {
        for (const intent of intents) {
            if (intent.kind === "COMMIT") {
                for (const acc of intent.accounts) {
                    const m = this.meta.get(acc);
                    if (m?.delegationState === "DELEGATED_TO_ER") {
                        await this.commitAccount(new web3_js_1.PublicKey(acc));
                    }
                }
            }
            else if (intent.kind === "UNDELEGATE" ||
                intent.kind === "COMMIT_AND_UNDELEGATE") {
                for (const acc of intent.accounts) {
                    const m = this.meta.get(acc);
                    if (m?.delegationState === "DELEGATED_TO_ER") {
                        await this.undelegateAccount(new web3_js_1.PublicKey(acc));
                    }
                }
            }
        }
    }
}
exports.DualLiteSvmHarness = DualLiteSvmHarness;
//# sourceMappingURL=DualLiteSvmHarness.js.map