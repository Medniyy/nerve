use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

declare_id!("DzhHCeBfB66VCTdeiVCfYM9DuE9pNmsHeFLpUdWEbpFD");

const BPS: u128 = 10_000;
const STATE_OPEN: u8 = 0;
const STATE_LOCKED: u8 = 1;
const STATE_SETTLED: u8 = 2;
const STATE_VOID: u8 = 3;
const STATE_CLOSED: u8 = 4;
const OUTCOME_GOAL: u8 = 1;
const OUTCOME_NO_GOAL: u8 = 2;

#[program]
pub mod nerve_sides {
    use super::*;

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        room_id: [u8; 32],
        round_id: u64,
        price_bps: u16,
        fee_bps: u16,
        commit_close_ts: i64,
        resolve_after_ts: i64,
    ) -> Result<()> {
        require!(price_bps > 0 && price_bps < 10_000, SidesError::InvalidPrice);
        require!(fee_bps <= 1_000, SidesError::InvalidFee);
        require!(commit_close_ts > Clock::get()?.unix_timestamp, SidesError::InvalidWindow);
        require!(resolve_after_ts > commit_close_ts, SidesError::InvalidWindow);

        let market = &mut ctx.accounts.market;
        market.authority = ctx.accounts.authority.key();
        market.mint = ctx.accounts.mint.key();
        market.room_id = room_id;
        market.round_id = round_id;
        market.price_bps = price_bps;
        market.fee_bps = fee_bps;
        market.commit_close_ts = commit_close_ts;
        market.resolve_after_ts = resolve_after_ts;
        market.state = STATE_OPEN;
        market.outcome = 0;
        market.total_goal = 0;
        market.total_no_goal = 0;
        market.matched_goal = 0;
        market.matched_no_goal = 0;
        market.position_count = 0;
        market.claimed_count = 0;
        market.bump = ctx.bumps.market;
        Ok(())
    }

    pub fn deposit_position(
        ctx: Context<DepositPosition>,
        side: u8,
        amount: u64,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(market.state == STATE_OPEN, SidesError::MarketNotOpen);
        require!(Clock::get()?.unix_timestamp < market.commit_close_ts, SidesError::MarketLocked);
        require!(side == OUTCOME_GOAL || side == OUTCOME_NO_GOAL, SidesError::InvalidSide);
        require!(amount > 0, SidesError::InvalidAmount);

        let transfer_accounts = TransferChecked {
            from: ctx.accounts.player_tokens.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.player.to_account_info(),
        };
        token::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_accounts),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        if side == OUTCOME_GOAL {
            market.total_goal = market
                .total_goal
                .checked_add(amount)
                .ok_or(SidesError::MathOverflow)?;
        } else {
            market.total_no_goal = market
                .total_no_goal
                .checked_add(amount)
                .ok_or(SidesError::MathOverflow)?;
        }
        market.position_count = market
            .position_count
            .checked_add(1)
            .ok_or(SidesError::MathOverflow)?;

        let position = &mut ctx.accounts.position;
        position.market = market.key();
        position.owner = ctx.accounts.player.key();
        position.side = side;
        position.stake = amount;
        position.claimed = false;
        position.claimed_amount = 0;
        position.bump = ctx.bumps.position;
        Ok(())
    }

    pub fn lock_market(ctx: Context<LockMarket>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(market.state == STATE_OPEN, SidesError::MarketNotOpen);
        require!(Clock::get()?.unix_timestamp >= market.commit_close_ts, SidesError::MarketStillOpen);
        lock(market)?;
        Ok(())
    }

    pub fn settle_market(ctx: Context<SettleMarket>, outcome: u8) -> Result<()> {
        require!(
            outcome == 0 || outcome == OUTCOME_GOAL || outcome == OUTCOME_NO_GOAL,
            SidesError::InvalidOutcome
        );
        let market = &mut ctx.accounts.market;
        require!(
            market.state == STATE_OPEN || market.state == STATE_LOCKED,
            SidesError::AlreadyResolved
        );
        require!(Clock::get()?.unix_timestamp >= market.commit_close_ts, SidesError::MarketStillOpen);
        if market.state == STATE_OPEN {
            lock(market)?;
        }
        if outcome == 0 || market.matched_goal == 0 || market.matched_no_goal == 0 {
            market.state = STATE_VOID;
            market.outcome = 0;
        } else {
            market.state = STATE_SETTLED;
            market.outcome = outcome;
        }
        Ok(())
    }

    pub fn void_market(ctx: Context<VoidMarket>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(
            market.state == STATE_OPEN || market.state == STATE_LOCKED,
            SidesError::AlreadyResolved
        );
        require!(
            Clock::get()?.unix_timestamp >= market.resolve_after_ts + 900,
            SidesError::ResolutionGraceActive
        );
        market.state = STATE_VOID;
        market.outcome = 0;
        Ok(())
    }

    pub fn claim_position(ctx: Context<ClaimPosition>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let position = &mut ctx.accounts.position;
        require!(
            market.state == STATE_SETTLED || market.state == STATE_VOID,
            SidesError::NotResolved
        );
        require!(!position.claimed, SidesError::AlreadyClaimed);

        let amount = if market.state == STATE_VOID {
            position.stake
        } else {
            claim_amount(market, position)?
        };

        position.claimed = true;
        position.claimed_amount = amount;
        market.claimed_count = market
            .claimed_count
            .checked_add(1)
            .ok_or(SidesError::MathOverflow)?;

        let round_bytes = market.round_id.to_le_bytes();
        let bump = [market.bump];
        let signer_seeds: &[&[u8]] = &[
            b"market",
            market.room_id.as_ref(),
            round_bytes.as_ref(),
            bump.as_ref(),
        ];
        let transfer_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.player_tokens.to_account_info(),
            authority: market.to_account_info(),
        };
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                transfer_accounts,
                &[signer_seeds],
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;
        Ok(())
    }

    pub fn collect_remaining(ctx: Context<CollectRemaining>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(
            market.state == STATE_SETTLED || market.state == STATE_VOID,
            SidesError::NotResolved
        );
        require!(market.claimed_count == market.position_count, SidesError::ClaimsOutstanding);

        let amount = ctx.accounts.vault.amount;
        if amount > 0 {
            let round_bytes = market.round_id.to_le_bytes();
            let bump = [market.bump];
            let signer_seeds: &[&[u8]] = &[
                b"market",
                market.room_id.as_ref(),
                round_bytes.as_ref(),
                bump.as_ref(),
            ];
            let transfer_accounts = TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.treasury_tokens.to_account_info(),
                authority: market.to_account_info(),
            };
            token::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    transfer_accounts,
                    &[signer_seeds],
                ),
                amount,
                ctx.accounts.mint.decimals,
            )?;
        }
        market.state = STATE_CLOSED;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(room_id: [u8; 32], round_id: u64)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", room_id.as_ref(), round_id.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositPosition<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        mut,
        seeds = [b"market", market.room_id.as_ref(), market.round_id.to_le_bytes().as_ref()],
        bump = market.bump,
        has_one = mint
    )]
    pub market: Account<'info, Market>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = player
    )]
    pub player_tokens: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = player,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", market.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LockMarket<'info> {
    pub keeper: Signer<'info>,
    #[account(
        mut,
        seeds = [b"market", market.room_id.as_ref(), market.round_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"market", market.room_id.as_ref(), market.round_id.to_le_bytes().as_ref()],
        bump = market.bump,
        has_one = authority
    )]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct VoidMarket<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [b"market", market.room_id.as_ref(), market.round_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct ClaimPosition<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(
        mut,
        seeds = [b"market", market.room_id.as_ref(), market.round_id.to_le_bytes().as_ref()],
        bump = market.bump,
        has_one = mint
    )]
    pub market: Account<'info, Market>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), player.key().as_ref()],
        bump = position.bump,
        has_one = market,
        constraint = position.owner == player.key() @ SidesError::WrongPositionOwner
    )]
    pub position: Account<'info, Position>,
    #[account(
        init_if_needed,
        payer = player,
        associated_token::mint = mint,
        associated_token::authority = player
    )]
    pub player_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CollectRemaining<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"market", market.room_id.as_ref(), market.round_id.to_le_bytes().as_ref()],
        bump = market.bump,
        has_one = authority,
        has_one = mint
    )]
    pub market: Account<'info, Market>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = authority
    )]
    pub treasury_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub room_id: [u8; 32],
    pub round_id: u64,
    pub price_bps: u16,
    pub fee_bps: u16,
    pub commit_close_ts: i64,
    pub resolve_after_ts: i64,
    pub state: u8,
    pub outcome: u8,
    pub total_goal: u64,
    pub total_no_goal: u64,
    pub matched_goal: u64,
    pub matched_no_goal: u64,
    pub position_count: u32,
    pub claimed_count: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub side: u8,
    pub stake: u64,
    pub claimed: bool,
    pub claimed_amount: u64,
    pub bump: u8,
}

fn lock(market: &mut Account<Market>) -> Result<()> {
    let (matched_goal, matched_no_goal) = matching(
        market.total_goal,
        market.total_no_goal,
        market.price_bps,
    )?;
    market.matched_goal = matched_goal;
    market.matched_no_goal = matched_no_goal;
    market.state = STATE_LOCKED;
    Ok(())
}

fn matching(goal: u64, no_goal: u64, price_bps: u16) -> Result<(u64, u64)> {
    if goal == 0 || no_goal == 0 {
        return Ok((0, 0));
    }
    let price = price_bps as u128;
    let goal_capacity = (goal as u128)
        .checked_mul(BPS)
        .ok_or(SidesError::MathOverflow)?
        / price;
    let no_capacity = (no_goal as u128)
        .checked_mul(BPS)
        .ok_or(SidesError::MathOverflow)?
        / (BPS - price);
    let contracts = goal_capacity.min(no_capacity);
    let matched_goal = contracts
        .checked_mul(price)
        .ok_or(SidesError::MathOverflow)?
        / BPS;
    let matched_no = contracts
        .checked_mul(BPS - price)
        .ok_or(SidesError::MathOverflow)?
        / BPS;
    Ok((
        u64::try_from(matched_goal).map_err(|_| SidesError::MathOverflow)?,
        u64::try_from(matched_no).map_err(|_| SidesError::MathOverflow)?,
    ))
}

fn claim_amount(market: &Market, position: &Position) -> Result<u64> {
    let (side_total, side_matched) = if position.side == OUTCOME_GOAL {
        (market.total_goal, market.matched_goal)
    } else {
        (market.total_no_goal, market.matched_no_goal)
    };
    require!(side_total > 0, SidesError::MathOverflow);
    let matched = (position.stake as u128)
        .checked_mul(side_matched as u128)
        .ok_or(SidesError::MathOverflow)?
        / side_total as u128;
    let matched = u64::try_from(matched).map_err(|_| SidesError::MathOverflow)?;
    let refund = position
        .stake
        .checked_sub(matched)
        .ok_or(SidesError::MathOverflow)?;
    if position.side != market.outcome {
        return Ok(refund);
    }

    let pot = market
        .matched_goal
        .checked_add(market.matched_no_goal)
        .ok_or(SidesError::MathOverflow)?;
    let fee = (pot as u128)
        .checked_mul(market.fee_bps as u128)
        .ok_or(SidesError::MathOverflow)?
        / BPS;
    let distributable = (pot as u128)
        .checked_sub(fee)
        .ok_or(SidesError::MathOverflow)?;
    let winner_matched = if market.outcome == OUTCOME_GOAL {
        market.matched_goal
    } else {
        market.matched_no_goal
    };
    let payout = distributable
        .checked_mul(matched as u128)
        .ok_or(SidesError::MathOverflow)?
        / winner_matched as u128;
    let total = (refund as u128)
        .checked_add(payout)
        .ok_or(SidesError::MathOverflow)?;
    u64::try_from(total).map_err(|_| SidesError::MathOverflow.into())
}

#[error_code]
pub enum SidesError {
    #[msg("The market price must be between 0% and 100%")]
    InvalidPrice,
    #[msg("The fee cannot exceed 10%")]
    InvalidFee,
    #[msg("The market time window is invalid")]
    InvalidWindow,
    #[msg("The market is not open")]
    MarketNotOpen,
    #[msg("The market is already locked")]
    MarketLocked,
    #[msg("The market is still accepting entries")]
    MarketStillOpen,
    #[msg("Choose a valid side")]
    InvalidSide,
    #[msg("The deposit must be greater than zero")]
    InvalidAmount,
    #[msg("This market has already been resolved")]
    AlreadyResolved,
    #[msg("Choose a valid outcome")]
    InvalidOutcome,
    #[msg("The resolver grace period is still active")]
    ResolutionGraceActive,
    #[msg("The market has not resolved yet")]
    NotResolved,
    #[msg("This position has already been claimed")]
    AlreadyClaimed,
    #[msg("This position belongs to a different wallet")]
    WrongPositionOwner,
    #[msg("Some positions still need to be claimed")]
    ClaimsOutstanding,
    #[msg("An arithmetic operation overflowed")]
    MathOverflow,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_fixed_price_sides() {
        let (goal, no_goal) = matching(3_000_000, 7_000_000, 3_000).unwrap();
        assert_eq!(goal, 3_000_000);
        assert_eq!(no_goal, 7_000_000);
    }

    #[test]
    fn caps_the_overfunded_side() {
        let (goal, no_goal) = matching(30_000_000, 7_000_000, 3_000).unwrap();
        assert_eq!(goal, 3_000_000);
        assert_eq!(no_goal, 7_000_000);
    }

    #[test]
    fn one_sided_market_has_no_match() {
        assert_eq!(matching(5_000_000, 0, 3_000).unwrap(), (0, 0));
    }
}
