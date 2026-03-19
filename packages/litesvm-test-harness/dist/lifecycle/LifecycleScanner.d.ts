import { Transaction } from "@solana/web3.js";
import { LifecycleScanResult } from "../types";
/**
 * LifecycleScanner orchestrates lifecycle detection after a successful
 * transaction.
 *
 * It combines results from IntentExtractor (instruction-level fast signal)
 * with an optional PDA state scan (source-of-truth verifier).
 *
 * For the StateMirrorBackend, only intent extraction is used. PDA scanning
 * is reserved for the ProtocolReplayBackend.
 */
export declare class LifecycleScanner {
    private extractor;
    /**
     * Scan a successfully executed transaction for lifecycle intents.
     *
     * @param layer  "BASE" or "ER" — which SVM ran the transaction.
     * @param tx     The transaction that was executed.
     * @param logs   Log lines returned by LiteSVM.
     */
    scan(layer: "BASE" | "ER", tx: Transaction, logs: string[]): LifecycleScanResult;
}
//# sourceMappingURL=LifecycleScanner.d.ts.map