"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntentExtractor = void 0;
const constants_1 = require("../constants");
/**
 * Known instruction discriminators for detecting lifecycle intents.
 *
 * These are derived from the ephemeral-rollups-sdk instruction handlers and
 * are used as a fast-path signal before PDA scanning.
 */
const MAGIC_COMMIT_DISC = Buffer.from([0xde, 0xad, 0x00, 0x01]); // placeholder
const MAGIC_UNDELEGATE_DISC = Buffer.from([0xde, 0xad, 0x00, 0x02]); // placeholder
/**
 * Log patterns emitted by the delegation program and magic program.
 * Scan these to detect lifecycle events when instruction decoding is
 * insufficient (e.g. CPI inner instructions).
 */
const LOG_PATTERNS = {
    COMMIT: [
        "commit_accounts",
        "MagicBlock: commit",
        "Committing account",
    ],
    UNDELEGATE: [
        "commit_and_undelegate_accounts",
        "MagicBlock: undelegate",
        "Undelegating account",
    ],
    DELEGATE: ["Program log: Delegating account", "delegate_account"],
};
/**
 * IntentExtractor derives LifecycleIntents from a transaction and its logs.
 *
 * Extraction order (fast path first):
 *   1. Instruction discriminator decoding
 *   2. Log scanning
 *
 * The caller (LifecycleScanner) may then validate these against PDA state.
 */
class IntentExtractor {
    /**
     * Extract lifecycle intents from a transaction and its execution logs.
     */
    extractFromTransaction(tx, logs) {
        const intents = [];
        // 1. Instruction-level detection
        for (const ix of tx.instructions) {
            const accounts = ix.keys.map((k) => k.pubkey.toString());
            if (ix.programId.equals(constants_1.MAGIC_PROGRAM_ID)) {
                // Direct call to magic program — could be commit or commit+undelegate
                const detected = this.detectMagicIntent(ix.data, accounts);
                if (detected)
                    intents.push(detected);
            }
            if (ix.programId.equals(constants_1.DELEGATION_PROGRAM_ID)) {
                intents.push({ kind: "DELEGATE", accounts });
            }
        }
        // 2. Log-based detection (catches CPI-driven lifecycle events)
        const logIntents = this.extractFromLogs(logs, tx);
        for (const li of logIntents) {
            // Avoid duplicating intents already found via instruction decoding
            const alreadyFound = intents.some((i) => i.kind === li.kind);
            if (!alreadyFound) {
                intents.push(li);
            }
        }
        return intents;
    }
    detectMagicIntent(data, accounts) {
        if (data.length < 4)
            return null;
        const disc = data.slice(0, 4);
        if (disc.equals(MAGIC_COMMIT_DISC)) {
            return { kind: "COMMIT", accounts };
        }
        if (disc.equals(MAGIC_UNDELEGATE_DISC)) {
            return { kind: "COMMIT_AND_UNDELEGATE", accounts };
        }
        return null;
    }
    extractFromLogs(logs, tx) {
        const intents = [];
        const allAccounts = tx.instructions
            .flatMap((ix) => ix.keys)
            .filter((k) => k.isWritable)
            .map((k) => k.pubkey.toString());
        let hasCommit = false;
        let hasUndelegate = false;
        let hasDelegate = false;
        for (const log of logs) {
            if (!hasCommit && LOG_PATTERNS.COMMIT.some((p) => log.includes(p))) {
                hasCommit = true;
            }
            if (!hasUndelegate &&
                LOG_PATTERNS.UNDELEGATE.some((p) => log.includes(p))) {
                hasUndelegate = true;
            }
            if (!hasDelegate && LOG_PATTERNS.DELEGATE.some((p) => log.includes(p))) {
                hasDelegate = true;
            }
        }
        if (hasUndelegate) {
            intents.push({ kind: "COMMIT_AND_UNDELEGATE", accounts: allAccounts });
        }
        else if (hasCommit) {
            intents.push({ kind: "COMMIT", accounts: allAccounts });
        }
        if (hasDelegate) {
            intents.push({ kind: "DELEGATE", accounts: allAccounts });
        }
        return intents;
    }
}
exports.IntentExtractor = IntentExtractor;
//# sourceMappingURL=IntentExtractor.js.map