"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UNDELEGATE_BUFFER_SEED = exports.COMMIT_RECORD_SEED = exports.COMMIT_STATE_SEED = exports.BUFFER_SEED = exports.DELEGATION_METADATA_SEED = exports.DELEGATION_SEED = exports.DEFAULT_ER_VALIDATOR = exports.SYSTEM_PROGRAM_ID = exports.MAGIC_CONTEXT_ID = exports.MAGIC_PROGRAM_ID = exports.DELEGATION_PROGRAM_ID = void 0;
const web3_js_1 = require("@solana/web3.js");
/** The MagicBlock delegation program on Solana. */
exports.DELEGATION_PROGRAM_ID = new web3_js_1.PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
/** The magic program that orchestrates ER commits on the ephemeral rollup. */
exports.MAGIC_PROGRAM_ID = new web3_js_1.PublicKey("Magic11111111111111111111111111111111111111");
/** The magic context account used by the magic program. */
exports.MAGIC_CONTEXT_ID = new web3_js_1.PublicKey("MagicContext1111111111111111111111111111111");
/** The Solana system program. */
exports.SYSTEM_PROGRAM_ID = new web3_js_1.PublicKey("11111111111111111111111111111111");
/** Default local ER validator identity (used in localnet setups). */
exports.DEFAULT_ER_VALIDATOR = new web3_js_1.PublicKey("mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev");
// Delegation PDA seed prefixes (must match the delegation program).
exports.DELEGATION_SEED = Buffer.from("delegation");
exports.DELEGATION_METADATA_SEED = Buffer.from("delegation-metadata");
exports.BUFFER_SEED = Buffer.from("buffer");
exports.COMMIT_STATE_SEED = Buffer.from("commit-state");
exports.COMMIT_RECORD_SEED = Buffer.from("commit-record");
exports.UNDELEGATE_BUFFER_SEED = Buffer.from("undelegate-buffer");
//# sourceMappingURL=constants.js.map