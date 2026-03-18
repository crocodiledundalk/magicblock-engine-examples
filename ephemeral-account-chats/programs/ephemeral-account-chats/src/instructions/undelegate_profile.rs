use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{anchor::commit, ephem::commit_and_undelegate_accounts};

use crate::state::Profile;

pub fn undelegate_profile(ctx: Context<UndelegateProfile>) -> Result<()> {
    commit_and_undelegate_accounts(
        &ctx.accounts.authority,
        vec![&ctx.accounts.profile.to_account_info()],
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
    )?;

    Ok(())
}

#[commit]
#[derive(Accounts)]
pub struct UndelegateProfile<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"profile", profile.handle.as_bytes()],
        bump = profile.bump,
        has_one = authority,
    )]
    pub profile: Account<'info, Profile>,
}
