"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareTransaction = prepareTransaction;
exports.extractAccountKeys = extractAccountKeys;
exports.extractProgramIds = extractProgramIds;
exports.extractWritableAccountKeys = extractWritableAccountKeys;
/**
 * Prepare a Transaction for submission to LiteSVM.
 *
 * Sets the recent blockhash and fee payer, then signs with all provided
 * signers. The first signer is used as the fee payer if none is already set.
 *
 * @param tx       The transaction to prepare (mutated in place).
 * @param signers  Keypairs that should sign the transaction.
 * @param blockhash Recent blockhash from LiteSVM.latestBlockhash().
 * @param feePayer Optional override for the fee payer.
 */
function prepareTransaction(tx, signers, blockhash, feePayer) {
    if (signers.length === 0) {
        throw new Error("At least one signer is required");
    }
    tx.recentBlockhash = blockhash;
    tx.feePayer = (feePayer ?? signers[0]).publicKey;
    tx.sign(...signers);
}
/**
 * Extract all unique account public keys referenced by a transaction's
 * instructions (excluding the program IDs themselves).
 */
function extractAccountKeys(tx) {
    const keys = new Set();
    for (const ix of tx.instructions) {
        for (const meta of ix.keys) {
            keys.add(meta.pubkey.toString());
        }
    }
    return [...keys];
}
/**
 * Extract all program IDs invoked by a transaction's instructions.
 */
function extractProgramIds(tx) {
    const ids = new Set();
    for (const ix of tx.instructions) {
        ids.add(ix.programId.toString());
    }
    return [...ids];
}
/**
 * Extract all writable account keys referenced by a transaction's instructions.
 */
function extractWritableAccountKeys(tx) {
    const keys = new Set();
    for (const ix of tx.instructions) {
        for (const meta of ix.keys) {
            if (meta.isWritable) {
                keys.add(meta.pubkey.toString());
            }
        }
    }
    return [...keys];
}
//# sourceMappingURL=txUtils.js.map