import { PublicKey } from "@solana/web3.js";
/**
 * Decoded delegation record (stored in the delegation record PDA).
 */
export interface DelegationRecord {
    authority: string;
    owner: string;
    delegationSlot: bigint;
    lamports: bigint;
    commitFrequencyMs: bigint;
}
/**
 * Decoded delegation metadata (stored in the delegation metadata PDA).
 */
export interface DelegationMetadata {
    lastUpdateNonce: bigint;
    isUndelegatable: boolean;
    seeds: Uint8Array[];
    rentPayer: string;
}
/**
 * Decoded commit record.
 */
export interface CommitRecord {
    identity: string;
    account: string;
    nonce: bigint;
    lamports: bigint;
}
/**
 * Encode a DelegationRecord into bytes suitable for setAccount().
 *
 * Layout:
 *   [0..8]   discriminator
 *   [8..40]  authority (pubkey)
 *   [40..72] owner (pubkey)
 *   [72..80] delegationSlot (u64 LE)
 *   [80..88] lamports (u64 LE)
 *   [88..96] commitFrequencyMs (u64 LE)
 */
export declare function encodeDelegationRecord(params: {
    authority: PublicKey;
    owner: PublicKey;
    delegationSlot: bigint;
    lamports: bigint;
    commitFrequencyMs: bigint;
}): Uint8Array;
/**
 * Decode a DelegationRecord from bytes.
 */
export declare function decodeDelegationRecord(data: Uint8Array): DelegationRecord;
/**
 * Encode a DelegationMetadata into bytes.
 *
 * Layout:
 *   [0..8]   discriminator
 *   [8..16]  lastUpdateNonce (u64 LE)
 *   [16]     isUndelegatable (u8 bool)
 *   [17..49] rentPayer (pubkey)
 *   [49..53] seedCount (u32 LE)
 *   [53+]    seeds (each: u32 len + bytes)
 */
export declare function encodeDelegationMetadata(params: {
    lastUpdateNonce: bigint;
    isUndelegatable: boolean;
    seeds: Uint8Array[];
    rentPayer: PublicKey;
}): Uint8Array;
/**
 * Decode DelegationMetadata from bytes.
 */
export declare function decodeDelegationMetadata(data: Uint8Array): DelegationMetadata;
/**
 * Read the count field from an Anchor-serialised Counter account.
 * Layout: [8 bytes discriminator][8 bytes count u64 LE]
 */
export declare function readCounterValue(data: Uint8Array): bigint;
//# sourceMappingURL=accountLayouts.d.ts.map