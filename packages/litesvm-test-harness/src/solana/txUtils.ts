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
export function prepareTransaction(
  tx: Transaction,
  signers: Keypair[],
  blockhash: string,
  feePayer?: Keypair,
): void {
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
export function extractAccountKeys(tx: Transaction): string[] {
  const keys = new Set<string>();
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
export function extractProgramIds(tx: Transaction): string[] {
  const ids = new Set<string>();
  for (const ix of tx.instructions) {
    ids.add(ix.programId.toString());
  }
  return [...ids];
}

/**
 * Extract all writable account keys referenced by a transaction's instructions.
 */
export function extractWritableAccountKeys(tx: Transaction): string[] {
  const keys = new Set<string>();
  for (const ix of tx.instructions) {
    for (const meta of ix.keys) {
      if (meta.isWritable) {
        keys.add(meta.pubkey.toString());
      }
    }
  }
  return [...keys];
}
