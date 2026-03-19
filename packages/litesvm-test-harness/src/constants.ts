import { PublicKey } from "@solana/web3.js";

/** The MagicBlock delegation program on Solana. */
export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh",
);

/** The magic program that orchestrates ER commits on the ephemeral rollup. */
export const MAGIC_PROGRAM_ID = new PublicKey(
  "Magic11111111111111111111111111111111111111",
);

/** The magic context account used by the magic program. */
export const MAGIC_CONTEXT_ID = new PublicKey(
  "MagicContext1111111111111111111111111111111",
);

/** The Solana system program. */
export const SYSTEM_PROGRAM_ID = new PublicKey(
  "11111111111111111111111111111111",
);

/** Default local ER validator identity (used in localnet setups). */
export const DEFAULT_ER_VALIDATOR = new PublicKey(
  "mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev",
);

// Delegation PDA seed prefixes (must match the delegation program).
export const DELEGATION_SEED = Buffer.from("delegation");
export const DELEGATION_METADATA_SEED = Buffer.from("delegation-metadata");
export const BUFFER_SEED = Buffer.from("buffer");
export const COMMIT_STATE_SEED = Buffer.from("commit-state");
export const COMMIT_RECORD_SEED = Buffer.from("commit-record");
export const UNDELEGATE_BUFFER_SEED = Buffer.from("undelegate-buffer");
