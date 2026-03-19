"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveDelegationRecordPda = deriveDelegationRecordPda;
exports.deriveDelegationMetadataPda = deriveDelegationMetadataPda;
exports.deriveBufferPda = deriveBufferPda;
exports.deriveCommitStatePda = deriveCommitStatePda;
exports.deriveCommitRecordPda = deriveCommitRecordPda;
exports.deriveUndelegateBufferPda = deriveUndelegateBufferPda;
exports.deriveAllDelegationPdas = deriveAllDelegationPdas;
const web3_js_1 = require("@solana/web3.js");
const constants_1 = require("../constants");
/**
 * Derive the delegation record PDA for a delegated account.
 * Seeds: ["delegation", delegatedAccount]
 */
function deriveDelegationRecordPda(delegatedAccount) {
    const [pda] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.DELEGATION_SEED, delegatedAccount.toBuffer()], constants_1.DELEGATION_PROGRAM_ID);
    return pda;
}
/**
 * Derive the delegation metadata PDA for a delegated account.
 * Seeds: ["delegation-metadata", delegatedAccount]
 */
function deriveDelegationMetadataPda(delegatedAccount) {
    const [pda] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.DELEGATION_METADATA_SEED, delegatedAccount.toBuffer()], constants_1.DELEGATION_PROGRAM_ID);
    return pda;
}
/**
 * Derive the buffer PDA for a delegated account.
 * Seeds: ["buffer", delegatedAccount]
 */
function deriveBufferPda(delegatedAccount) {
    const [pda] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.BUFFER_SEED, delegatedAccount.toBuffer()], constants_1.DELEGATION_PROGRAM_ID);
    return pda;
}
/**
 * Derive the commit state PDA for a delegated account.
 * Seeds: ["commit-state", delegatedAccount]
 */
function deriveCommitStatePda(delegatedAccount) {
    const [pda] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.COMMIT_STATE_SEED, delegatedAccount.toBuffer()], constants_1.DELEGATION_PROGRAM_ID);
    return pda;
}
/**
 * Derive the commit record PDA for a delegated account.
 * Seeds: ["commit-record", delegatedAccount]
 */
function deriveCommitRecordPda(delegatedAccount) {
    const [pda] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.COMMIT_RECORD_SEED, delegatedAccount.toBuffer()], constants_1.DELEGATION_PROGRAM_ID);
    return pda;
}
/**
 * Derive the undelegate buffer PDA for a delegated account.
 * Seeds: ["undelegate-buffer", delegatedAccount]
 */
function deriveUndelegateBufferPda(delegatedAccount) {
    const [pda] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.UNDELEGATE_BUFFER_SEED, delegatedAccount.toBuffer()], constants_1.DELEGATION_PROGRAM_ID);
    return pda;
}
/**
 * Derive all PDAs for a delegated account in one call.
 */
function deriveAllDelegationPdas(delegatedAccount) {
    return {
        delegationRecordPda: deriveDelegationRecordPda(delegatedAccount),
        delegationMetadataPda: deriveDelegationMetadataPda(delegatedAccount),
        bufferPda: deriveBufferPda(delegatedAccount),
        commitStatePda: deriveCommitStatePda(delegatedAccount),
        commitRecordPda: deriveCommitRecordPda(delegatedAccount),
        undelegateBufferPda: deriveUndelegateBufferPda(delegatedAccount),
    };
}
//# sourceMappingURL=pda.js.map