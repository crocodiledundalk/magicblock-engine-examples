"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LifecycleScanner = void 0;
const IntentExtractor_1 = require("./IntentExtractor");
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
class LifecycleScanner {
    constructor() {
        this.extractor = new IntentExtractor_1.IntentExtractor();
    }
    /**
     * Scan a successfully executed transaction for lifecycle intents.
     *
     * @param layer  "BASE" or "ER" — which SVM ran the transaction.
     * @param tx     The transaction that was executed.
     * @param logs   Log lines returned by LiteSVM.
     */
    scan(layer, tx, logs) {
        const intents = this.extractor.extractFromTransaction(tx, logs);
        const touchedAccounts = [];
        for (const ix of tx.instructions) {
            for (const meta of ix.keys) {
                if (meta.isWritable) {
                    touchedAccounts.push(meta.pubkey.toString());
                }
            }
        }
        return {
            intents,
            verifiedEvents: [], // PDA scanning not yet implemented
            touchedAccounts: [...new Set(touchedAccounts)],
        };
    }
}
exports.LifecycleScanner = LifecycleScanner;
//# sourceMappingURL=LifecycleScanner.js.map