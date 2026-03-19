import { Keypair, Transaction } from "@solana/web3.js";
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
export declare function prepareTransaction(tx: Transaction, signers: Keypair[], blockhash: string, feePayer?: Keypair): void;
/**
 * Extract all unique account public keys referenced by a transaction's
 * instructions (excluding the program IDs themselves).
 */
export declare function extractAccountKeys(tx: Transaction): string[];
/**
 * Extract all program IDs invoked by a transaction's instructions.
 */
export declare function extractProgramIds(tx: Transaction): string[];
/**
 * Extract all writable account keys referenced by a transaction's instructions.
 */
export declare function extractWritableAccountKeys(tx: Transaction): string[];
//# sourceMappingURL=txUtils.d.ts.map