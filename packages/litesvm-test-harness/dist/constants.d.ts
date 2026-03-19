import { PublicKey } from "@solana/web3.js";
/** The MagicBlock delegation program on Solana. */
export declare const DELEGATION_PROGRAM_ID: PublicKey;
/** The magic program that orchestrates ER commits on the ephemeral rollup. */
export declare const MAGIC_PROGRAM_ID: PublicKey;
/** The magic context account used by the magic program. */
export declare const MAGIC_CONTEXT_ID: PublicKey;
/** The Solana system program. */
export declare const SYSTEM_PROGRAM_ID: PublicKey;
/** Default local ER validator identity (used in localnet setups). */
export declare const DEFAULT_ER_VALIDATOR: PublicKey;
export declare const DELEGATION_SEED: Buffer<ArrayBuffer>;
export declare const DELEGATION_METADATA_SEED: Buffer<ArrayBuffer>;
export declare const BUFFER_SEED: Buffer<ArrayBuffer>;
export declare const COMMIT_STATE_SEED: Buffer<ArrayBuffer>;
export declare const COMMIT_RECORD_SEED: Buffer<ArrayBuffer>;
export declare const UNDELEGATE_BUFFER_SEED: Buffer<ArrayBuffer>;
//# sourceMappingURL=constants.d.ts.map