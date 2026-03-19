"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_PROGRAM_ID = exports.DEFAULT_ER_VALIDATOR = exports.MAGIC_CONTEXT_ID = exports.MAGIC_PROGRAM_ID = exports.DELEGATION_PROGRAM_ID = exports.extractWritableAccountKeys = exports.extractProgramIds = exports.extractAccountKeys = exports.prepareTransaction = exports.readCounterValue = exports.decodeDelegationMetadata = exports.encodeDelegationMetadata = exports.decodeDelegationRecord = exports.encodeDelegationRecord = exports.deriveAllDelegationPdas = exports.deriveUndelegateBufferPda = exports.deriveCommitRecordPda = exports.deriveCommitStatePda = exports.deriveBufferPda = exports.deriveDelegationMetadataPda = exports.deriveDelegationRecordPda = exports.StateMirrorBackend = exports.IntentExtractor = exports.LifecycleScanner = exports.CloneCoordinator = exports.MirrorMetaStore = exports.DualLiteSvmHarness = void 0;
// Main harness
var DualLiteSvmHarness_1 = require("./harness/DualLiteSvmHarness");
Object.defineProperty(exports, "DualLiteSvmHarness", { enumerable: true, get: function () { return DualLiteSvmHarness_1.DualLiteSvmHarness; } });
// Supporting classes
var MirrorMetaStore_1 = require("./metadata/MirrorMetaStore");
Object.defineProperty(exports, "MirrorMetaStore", { enumerable: true, get: function () { return MirrorMetaStore_1.MirrorMetaStore; } });
var CloneCoordinator_1 = require("./clone/CloneCoordinator");
Object.defineProperty(exports, "CloneCoordinator", { enumerable: true, get: function () { return CloneCoordinator_1.CloneCoordinator; } });
var LifecycleScanner_1 = require("./lifecycle/LifecycleScanner");
Object.defineProperty(exports, "LifecycleScanner", { enumerable: true, get: function () { return LifecycleScanner_1.LifecycleScanner; } });
var IntentExtractor_1 = require("./lifecycle/IntentExtractor");
Object.defineProperty(exports, "IntentExtractor", { enumerable: true, get: function () { return IntentExtractor_1.IntentExtractor; } });
var StateMirrorBackend_1 = require("./protocol/StateMirrorBackend");
Object.defineProperty(exports, "StateMirrorBackend", { enumerable: true, get: function () { return StateMirrorBackend_1.StateMirrorBackend; } });
// DLP helpers
var pda_1 = require("./dlp/pda");
Object.defineProperty(exports, "deriveDelegationRecordPda", { enumerable: true, get: function () { return pda_1.deriveDelegationRecordPda; } });
Object.defineProperty(exports, "deriveDelegationMetadataPda", { enumerable: true, get: function () { return pda_1.deriveDelegationMetadataPda; } });
Object.defineProperty(exports, "deriveBufferPda", { enumerable: true, get: function () { return pda_1.deriveBufferPda; } });
Object.defineProperty(exports, "deriveCommitStatePda", { enumerable: true, get: function () { return pda_1.deriveCommitStatePda; } });
Object.defineProperty(exports, "deriveCommitRecordPda", { enumerable: true, get: function () { return pda_1.deriveCommitRecordPda; } });
Object.defineProperty(exports, "deriveUndelegateBufferPda", { enumerable: true, get: function () { return pda_1.deriveUndelegateBufferPda; } });
Object.defineProperty(exports, "deriveAllDelegationPdas", { enumerable: true, get: function () { return pda_1.deriveAllDelegationPdas; } });
var accountLayouts_1 = require("./dlp/accountLayouts");
Object.defineProperty(exports, "encodeDelegationRecord", { enumerable: true, get: function () { return accountLayouts_1.encodeDelegationRecord; } });
Object.defineProperty(exports, "decodeDelegationRecord", { enumerable: true, get: function () { return accountLayouts_1.decodeDelegationRecord; } });
Object.defineProperty(exports, "encodeDelegationMetadata", { enumerable: true, get: function () { return accountLayouts_1.encodeDelegationMetadata; } });
Object.defineProperty(exports, "decodeDelegationMetadata", { enumerable: true, get: function () { return accountLayouts_1.decodeDelegationMetadata; } });
Object.defineProperty(exports, "readCounterValue", { enumerable: true, get: function () { return accountLayouts_1.readCounterValue; } });
// Transaction utilities
var txUtils_1 = require("./solana/txUtils");
Object.defineProperty(exports, "prepareTransaction", { enumerable: true, get: function () { return txUtils_1.prepareTransaction; } });
Object.defineProperty(exports, "extractAccountKeys", { enumerable: true, get: function () { return txUtils_1.extractAccountKeys; } });
Object.defineProperty(exports, "extractProgramIds", { enumerable: true, get: function () { return txUtils_1.extractProgramIds; } });
Object.defineProperty(exports, "extractWritableAccountKeys", { enumerable: true, get: function () { return txUtils_1.extractWritableAccountKeys; } });
// Constants
var constants_1 = require("./constants");
Object.defineProperty(exports, "DELEGATION_PROGRAM_ID", { enumerable: true, get: function () { return constants_1.DELEGATION_PROGRAM_ID; } });
Object.defineProperty(exports, "MAGIC_PROGRAM_ID", { enumerable: true, get: function () { return constants_1.MAGIC_PROGRAM_ID; } });
Object.defineProperty(exports, "MAGIC_CONTEXT_ID", { enumerable: true, get: function () { return constants_1.MAGIC_CONTEXT_ID; } });
Object.defineProperty(exports, "DEFAULT_ER_VALIDATOR", { enumerable: true, get: function () { return constants_1.DEFAULT_ER_VALIDATOR; } });
Object.defineProperty(exports, "SYSTEM_PROGRAM_ID", { enumerable: true, get: function () { return constants_1.SYSTEM_PROGRAM_ID; } });
//# sourceMappingURL=index.js.map