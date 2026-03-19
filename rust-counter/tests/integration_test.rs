/**
 * rust-counter unit tests
 *
 * These tests exercise the counter logic in-process using direct processor
 * calls and mock AccountInfo objects — no live validator or SBF binary
 * required.
 *
 * Coverage:
 *   - Counter serialization / deserialization
 *   - ProgramInstruction::unpack correctness
 *   - process_initialize_counter (skipped: requires invoke_signed / system CPI)
 *   - process_increase_counter (tested with pre-populated mock accounts)
 *   - PDA derivation correctness (seeds = [b"counter", initializer.key])
 *
 * Note: Instructions that CPI into the delegation program or Magic Program
 * (Delegate, Commit, CommitAndUndelegate, IncrementAndCommit,
 * IncrementAndUndelegate, Undelegate) are tested at the TypeScript layer via
 * the DualLiteSvmHarness — see anchor-counter-litesvm for the equivalent
 * harness lifecycle tests.
 */
use std::cell::RefCell;
use std::rc::Rc;

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::AccountInfo,
    clock::Epoch,
    pubkey::Pubkey,
};

use rust_counter::{
    instruction::ProgramInstruction,
    processor::process_increase_counter,
    state::Counter,
};

// ── helpers ──────────────────────────────────────────────────────────────────

/// Build a mock AccountInfo for testing. Returns a tuple of
/// `(lamports_cell, data_cell, AccountInfo)`. The returned AccountInfo
/// borrows from the cells so all three must stay alive together.
struct MockAccount {
    key: Pubkey,
    lamports: u64,
    data: Vec<u8>,
    owner: Pubkey,
    is_signer: bool,
    is_writable: bool,
}

impl MockAccount {
    fn new(key: Pubkey, owner: Pubkey, is_signer: bool, is_writable: bool, data: Vec<u8>) -> Self {
        Self {
            key,
            lamports: 1_000_000,
            data,
            owner,
            is_signer,
            is_writable,
        }
    }

    fn counter(program_id: Pubkey, count: u64) -> Self {
        let counter = Counter { count };
        let mut data = vec![0u8; Counter::SIZE];
        counter.serialize(&mut &mut data[..]).unwrap();
        Self::new(Pubkey::new_unique(), program_id, false, true, data)
    }
}

// ── Counter state tests ───────────────────────────────────────────────────────

#[test]
fn test_counter_serialization_roundtrip() {
    let original = Counter { count: 42 };
    let mut buf = vec![0u8; Counter::SIZE];
    original.serialize(&mut &mut buf[..]).unwrap();
    let deserialized = Counter::try_from_slice(&buf).unwrap();
    assert_eq!(deserialized.count, 42);
}

#[test]
fn test_counter_size_is_8() {
    assert_eq!(Counter::SIZE, 8);
}

#[test]
fn test_counter_zero_serialization() {
    let c = Counter { count: 0 };
    let mut buf = vec![0u8; Counter::SIZE];
    c.serialize(&mut &mut buf[..]).unwrap();
    assert_eq!(buf, [0u8; 8]);
}

#[test]
fn test_counter_max_value() {
    let c = Counter { count: u64::MAX };
    let mut buf = vec![0u8; Counter::SIZE];
    c.serialize(&mut &mut buf[..]).unwrap();
    let d = Counter::try_from_slice(&buf).unwrap();
    assert_eq!(d.count, u64::MAX);
}

// ── ProgramInstruction::unpack tests ─────────────────────────────────────────

#[test]
fn test_unpack_initialize_counter() {
    let data = [0u8; 8];
    let ix = ProgramInstruction::unpack(&data).unwrap();
    assert!(matches!(ix, ProgramInstruction::InitializeCounter));
}

#[test]
fn test_unpack_increase_counter() {
    let mut data = [0u8; 16];
    data[0] = 1; // discriminator
    let amount: u64 = 99;
    data[8..16].copy_from_slice(&amount.to_le_bytes());
    let ix = ProgramInstruction::unpack(&data).unwrap();
    assert!(matches!(ix, ProgramInstruction::IncreaseCounter { increase_by: 99 }));
}

#[test]
fn test_unpack_delegate() {
    let data = [2u8, 0, 0, 0, 0, 0, 0, 0];
    let ix = ProgramInstruction::unpack(&data).unwrap();
    assert!(matches!(ix, ProgramInstruction::Delegate));
}

#[test]
fn test_unpack_commit_and_undelegate() {
    let data = [3u8, 0, 0, 0, 0, 0, 0, 0];
    let ix = ProgramInstruction::unpack(&data).unwrap();
    assert!(matches!(ix, ProgramInstruction::CommitAndUndelegate));
}

#[test]
fn test_unpack_commit() {
    let data = [4u8, 0, 0, 0, 0, 0, 0, 0];
    let ix = ProgramInstruction::unpack(&data).unwrap();
    assert!(matches!(ix, ProgramInstruction::Commit));
}

#[test]
fn test_unpack_increment_and_commit() {
    let mut data = [0u8; 16];
    data[0] = 5;
    let amount: u64 = 7;
    data[8..16].copy_from_slice(&amount.to_le_bytes());
    let ix = ProgramInstruction::unpack(&data).unwrap();
    assert!(matches!(ix, ProgramInstruction::IncrementAndCommit { increase_by: 7 }));
}

#[test]
fn test_unpack_increment_and_undelegate() {
    let mut data = [0u8; 16];
    data[0] = 6;
    let amount: u64 = 3;
    data[8..16].copy_from_slice(&amount.to_le_bytes());
    let ix = ProgramInstruction::unpack(&data).unwrap();
    assert!(matches!(ix, ProgramInstruction::IncrementAndUndelegate { increase_by: 3 }));
}

#[test]
fn test_unpack_invalid_discriminator() {
    let data = [255u8; 8];
    assert!(ProgramInstruction::unpack(&data).is_err());
}

#[test]
fn test_unpack_too_short() {
    let data = [0u8; 4]; // less than 8 bytes
    assert!(ProgramInstruction::unpack(&data).is_err());
}

// ── PDA derivation tests ──────────────────────────────────────────────────────

#[test]
fn test_counter_pda_derivation_is_deterministic() {
    let program_id = Pubkey::new_unique();
    let user = Pubkey::new_unique();

    let (pda1, bump1) =
        Pubkey::find_program_address(&[b"counter", user.as_ref()], &program_id);
    let (pda2, bump2) =
        Pubkey::find_program_address(&[b"counter", user.as_ref()], &program_id);

    assert_eq!(pda1, pda2);
    assert_eq!(bump1, bump2);
}

#[test]
fn test_counter_pda_is_unique_per_user() {
    let program_id = Pubkey::new_unique();
    let user_a = Pubkey::new_unique();
    let user_b = Pubkey::new_unique();

    let (pda_a, _) =
        Pubkey::find_program_address(&[b"counter", user_a.as_ref()], &program_id);
    let (pda_b, _) =
        Pubkey::find_program_address(&[b"counter", user_b.as_ref()], &program_id);

    assert_ne!(pda_a, pda_b);
}

#[test]
fn test_counter_pda_is_unique_per_program() {
    let program_a = Pubkey::new_unique();
    let program_b = Pubkey::new_unique();
    let user = Pubkey::new_unique();

    let (pda_a, _) =
        Pubkey::find_program_address(&[b"counter", user.as_ref()], &program_a);
    let (pda_b, _) =
        Pubkey::find_program_address(&[b"counter", user.as_ref()], &program_b);

    assert_ne!(pda_a, pda_b);
}

// ── process_increase_counter in-process tests ─────────────────────────────────

/// Build a RefCell-based AccountInfo to avoid lifetime issues in tests.
fn make_account_info_cells(
    key: &Pubkey,
    owner: &Pubkey,
    is_signer: bool,
    is_writable: bool,
    lamports: u64,
    data: Vec<u8>,
) -> (Rc<RefCell<u64>>, Rc<RefCell<Vec<u8>>>, Pubkey, Pubkey, bool, bool) {
    (
        Rc::new(RefCell::new(lamports)),
        Rc::new(RefCell::new(data)),
        *key,
        *owner,
        is_signer,
        is_writable,
    )
}

#[test]
fn test_process_increase_counter_increments_by_amount() {
    let program_id = Pubkey::new_unique();
    let initializer_key = Pubkey::new_unique();

    let (counter_pda, _) =
        Pubkey::find_program_address(&[b"counter", initializer_key.as_ref()], &program_id);

    // Counter starts at 10.
    let initial_count: u64 = 10;
    let mut counter_data = vec![0u8; Counter::SIZE];
    Counter { count: initial_count }
        .serialize(&mut &mut counter_data[..])
        .unwrap();

    // Create lamport cells (must outlive AccountInfo).
    let mut init_lamports: u64 = 1_000_000;
    let mut counter_lamports: u64 = 10_000;

    // Create data cells.
    let mut init_data: Vec<u8> = vec![];
    let system_program_id = solana_program::system_program::id();
    let mut system_data: Vec<u8> = vec![];
    let mut sys_lamports: u64 = 0;

    let initializer_info = AccountInfo::new(
        &initializer_key,
        true,
        false,
        &mut init_lamports,
        &mut init_data,
        &system_program_id,
        false,
        Epoch::default(),
    );

    let counter_info = AccountInfo::new(
        &counter_pda,
        false,
        true,
        &mut counter_lamports,
        &mut counter_data,
        &program_id,
        false,
        Epoch::default(),
    );

    let accounts = [initializer_info, counter_info];

    process_increase_counter(&program_id, &accounts, 5).unwrap();

    let result = Counter::try_from_slice(&accounts[1].data.borrow()).unwrap();
    assert_eq!(result.count, 15);
}

#[test]
fn test_process_increase_counter_multiple_times() {
    let program_id = Pubkey::new_unique();
    let initializer_key = Pubkey::new_unique();

    let (counter_pda, _) =
        Pubkey::find_program_address(&[b"counter", initializer_key.as_ref()], &program_id);

    let mut counter_data = vec![0u8; Counter::SIZE];
    Counter { count: 0 }
        .serialize(&mut &mut counter_data[..])
        .unwrap();

    let mut init_lamports: u64 = 1_000_000;
    let mut counter_lamports: u64 = 10_000;
    let mut init_data: Vec<u8> = vec![];
    let system_program_id = solana_program::system_program::id();

    let initializer_info = AccountInfo::new(
        &initializer_key,
        true, false, &mut init_lamports, &mut init_data,
        &system_program_id, false, Epoch::default(),
    );
    let counter_info = AccountInfo::new(
        &counter_pda,
        false, true, &mut counter_lamports, &mut counter_data,
        &program_id, false, Epoch::default(),
    );

    let accounts = [initializer_info, counter_info];

    for amount in [1u64, 1, 1, 7] {
        process_increase_counter(&program_id, &accounts, amount).unwrap();
    }

    let result = Counter::try_from_slice(&accounts[1].data.borrow()).unwrap();
    assert_eq!(result.count, 10);
}

#[test]
fn test_process_increase_counter_rejects_wrong_pda() {
    let program_id = Pubkey::new_unique();
    let initializer_key = Pubkey::new_unique();

    // Use a wrong PDA (not derived from initializer_key).
    let wrong_pda = Pubkey::new_unique();

    let mut counter_data = vec![0u8; Counter::SIZE];
    Counter { count: 0 }.serialize(&mut &mut counter_data[..]).unwrap();

    let mut init_lamports: u64 = 1_000_000;
    let mut counter_lamports: u64 = 10_000;
    let mut init_data: Vec<u8> = vec![];
    let system_program_id = solana_program::system_program::id();

    let initializer_info = AccountInfo::new(
        &initializer_key,
        true, false, &mut init_lamports, &mut init_data,
        &system_program_id, false, Epoch::default(),
    );
    let counter_info = AccountInfo::new(
        &wrong_pda,
        false, true, &mut counter_lamports, &mut counter_data,
        &program_id, false, Epoch::default(),
    );

    let accounts = [initializer_info, counter_info];
    let result = process_increase_counter(&program_id, &accounts, 1);
    assert!(result.is_err(), "Should reject wrong PDA");
}
