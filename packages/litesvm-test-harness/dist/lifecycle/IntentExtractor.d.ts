import { Transaction } from "@solana/web3.js";
import { LifecycleIntent } from "../types";
/**
 * IntentExtractor derives LifecycleIntents from a transaction and its logs.
 *
 * Extraction order (fast path first):
 *   1. Instruction discriminator decoding
 *   2. Log scanning
 *
 * The caller (LifecycleScanner) may then validate these against PDA state.
 */
export declare class IntentExtractor {
    /**
     * Extract lifecycle intents from a transaction and its execution logs.
     */
    extractFromTransaction(tx: Transaction, logs: string[]): LifecycleIntent[];
    private detectMagicIntent;
    private extractFromLogs;
}
//# sourceMappingURL=IntentExtractor.d.ts.map