"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeDelegationRecord = encodeDelegationRecord;
exports.decodeDelegationRecord = decodeDelegationRecord;
exports.encodeDelegationMetadata = encodeDelegationMetadata;
exports.decodeDelegationMetadata = decodeDelegationMetadata;
exports.readCounterValue = readCounterValue;
const web3_js_1 = require("@solana/web3.js");
// ---------------------------------------------------------------------------
// Encoding helpers
//
// The byte layouts below are simplified harness-internal representations.
// They do not need to match the real delegation program's Anchor discriminators
// exactly, because the StateMirrorBackend reads delegation state from the
// MirrorMetaStore rather than decoding on-chain PDAs.
// ---------------------------------------------------------------------------
/** 8-byte placeholder discriminator used for harness-managed accounts. */
const HARNESS_DISCRIMINATOR = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe]);
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
function encodeDelegationRecord(params) {
    const buf = Buffer.alloc(96);
    HARNESS_DISCRIMINATOR.copy(buf, 0);
    params.authority.toBuffer().copy(buf, 8);
    params.owner.toBuffer().copy(buf, 40);
    buf.writeBigUInt64LE(params.delegationSlot, 72);
    buf.writeBigUInt64LE(params.lamports, 80);
    buf.writeBigUInt64LE(params.commitFrequencyMs, 88);
    return new Uint8Array(buf);
}
/**
 * Decode a DelegationRecord from bytes.
 */
function decodeDelegationRecord(data) {
    const buf = Buffer.from(data);
    return {
        authority: new web3_js_1.PublicKey(buf.slice(8, 40)).toString(),
        owner: new web3_js_1.PublicKey(buf.slice(40, 72)).toString(),
        delegationSlot: buf.readBigUInt64LE(72),
        lamports: buf.readBigUInt64LE(80),
        commitFrequencyMs: buf.readBigUInt64LE(88),
    };
}
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
function encodeDelegationMetadata(params) {
    // Calculate total size
    let seedsSize = 4; // seedCount
    for (const s of params.seeds) {
        seedsSize += 4 + s.length;
    }
    const totalSize = 49 + seedsSize;
    const buf = Buffer.alloc(totalSize);
    HARNESS_DISCRIMINATOR.copy(buf, 0);
    buf.writeBigUInt64LE(params.lastUpdateNonce, 8);
    buf.writeUInt8(params.isUndelegatable ? 1 : 0, 16);
    params.rentPayer.toBuffer().copy(buf, 17);
    let offset = 49;
    buf.writeUInt32LE(params.seeds.length, offset);
    offset += 4;
    for (const seed of params.seeds) {
        buf.writeUInt32LE(seed.length, offset);
        offset += 4;
        Buffer.from(seed).copy(buf, offset);
        offset += seed.length;
    }
    return new Uint8Array(buf);
}
/**
 * Decode DelegationMetadata from bytes.
 */
function decodeDelegationMetadata(data) {
    const buf = Buffer.from(data);
    const lastUpdateNonce = buf.readBigUInt64LE(8);
    const isUndelegatable = buf.readUInt8(16) !== 0;
    const rentPayer = new web3_js_1.PublicKey(buf.slice(17, 49)).toString();
    let offset = 49;
    const seedCount = buf.readUInt32LE(offset);
    offset += 4;
    const seeds = [];
    for (let i = 0; i < seedCount; i++) {
        const len = buf.readUInt32LE(offset);
        offset += 4;
        seeds.push(new Uint8Array(buf.slice(offset, offset + len)));
        offset += len;
    }
    return { lastUpdateNonce, isUndelegatable, seeds, rentPayer };
}
/**
 * Read the count field from an Anchor-serialised Counter account.
 * Layout: [8 bytes discriminator][8 bytes count u64 LE]
 */
function readCounterValue(data) {
    if (data.length < 16) {
        throw new Error(`Account data too short to be a Counter account: ${data.length} bytes`);
    }
    const buf = Buffer.from(data);
    return buf.readBigUInt64LE(8);
}
//# sourceMappingURL=accountLayouts.js.map