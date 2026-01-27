// src/pages/api/pool/proposals/[proposalId]/execute.ts
// Execute an approved governance proposal
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../../lib/database/mongodb';
import { Pool } from '../../../../../lib/models/Pool';
import { PoolProposal } from '../../../../../lib/models/PoolProposal';
import { User } from '../../../../../lib/models/User';
import { verifyTokenHolder } from '../../../../../lib/services/heliusService';
import { executeProposal as executeSquadsProposal } from '../../../../../lib/services/squadService';

interface ExecuteRequest {
  executorWallet: string;
}

// Admin wallets that can execute without being holder
const ADMIN_WALLETS = process.env.ADMIN_WALLETS?.split(',') || [];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { proposalId } = req.query;
    const { executorWallet } = req.body as ExecuteRequest;

    // Validation
    if (!proposalId || !executorWallet) {
      return res.status(400).json({
        error: 'Missing required fields: executorWallet',
      });
    }

    await dbConnect();

    // Find the proposal
    const proposal = await PoolProposal.findById(proposalId);
    if (!proposal || proposal.deleted) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Check proposal status
    if (proposal.status !== 'approved') {
      return res.status(400).json({
        error: `Cannot execute proposal with status: ${proposal.status}`,
        status: proposal.status,
        requiredStatus: 'approved',
      });
    }

    // Find the pool
    const pool = await Pool.findById(proposal.pool);
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Verify executor is either admin or token holder
    const adminUser = await User.findOne({ wallet: executorWallet });
    const isAdmin = adminUser?.role === 'admin' || ADMIN_WALLETS.includes(executorWallet);

    if (!isAdmin && pool.bagsTokenMint) {
      const holderCheck = await verifyTokenHolder(executorWallet, pool.bagsTokenMint, 1);
      if (!holderCheck.isHolder) {
        return res.status(403).json({
          error: 'Only token holders or admins can execute proposals',
          balance: holderCheck.balance,
        });
      }
    }

    // Execute based on proposal type
    let executionResult;
    let poolUpdate: Record<string, unknown> = {};

    switch (proposal.proposalType) {
      case 'relist_for_sale':
        executionResult = await executeRelistForSale(pool, proposal);
        poolUpdate = {
          status: 'listed',
          resaleListingPriceUSD: proposal.askingPriceUSD,
          resaleListedAt: new Date(),
        };
        break;

      case 'accept_offer':
        executionResult = await executeAcceptOffer(pool, proposal);
        poolUpdate = {
          status: 'sold',
          resaleSoldPriceUSD: proposal.offerAmountUSD,
          resaleBuyerWallet: proposal.buyerWallet,
          resaleSoldAt: new Date(),
        };
        break;

      default:
        return res.status(400).json({
          error: `Unsupported proposal type: ${proposal.proposalType}`,
        });
    }

    // Update proposal
    proposal.status = 'executed';
    proposal.executedAt = new Date();
    proposal.executedBy = executorWallet;
    proposal.executionTx = executionResult.signature;
    proposal.resultType = executionResult.success ? 'success' : 'failed';
    proposal.resultMessage = executionResult.message;
    proposal.resultData = executionResult.data;
    await proposal.save();

    // Update pool
    if (executionResult.success && Object.keys(poolUpdate).length > 0) {
      await Pool.findByIdAndUpdate(pool._id, { $set: poolUpdate });
    }

    return res.status(200).json({
      success: executionResult.success,
      proposal: {
        _id: proposal._id,
        status: proposal.status,
        executedAt: proposal.executedAt,
        executionTx: proposal.executionTx,
        resultType: proposal.resultType,
      },
      execution: executionResult,
      pool: {
        _id: pool._id,
        status: executionResult.success ? poolUpdate.status : pool.status,
      },
      message: executionResult.success
        ? `Proposal executed successfully! ${executionResult.message}`
        : `Execution failed: ${executionResult.message}`,
    });
  } catch (error: any) {
    console.error('[POST /api/pool/proposals/[proposalId]/execute] Error:', error);
    return res.status(500).json({
      error: 'Failed to execute proposal',
      details: error?.message,
    });
  }
}

/**
 * Execute a "relist for sale" proposal
 * Lists the asset for sale at the approved asking price
 */
async function executeRelistForSale(
  pool: any,
  proposal: any
): Promise<{
  success: boolean;
  signature: string;
  message: string;
  data?: unknown;
}> {
  try {
    // If pool has Squads integration, execute via Squads
    if (pool.squadMultisigPda && proposal.squadsTransactionIndex) {
      const squadsResult = await executeSquadsProposal(
        pool.squadMultisigPda,
        proposal.squadsTransactionIndex
      );
      return {
        success: squadsResult.executed,
        signature: squadsResult.signature,
        message: `Asset listed for sale at $${proposal.askingPriceUSD}`,
        data: { squadsExecution: squadsResult },
      };
    }

    // For pools without Squads (or proposal without Squads tx), execute directly
    // This would typically involve calling a marketplace listing contract
    // For now, we just update the database and return success

    return {
      success: true,
      signature: `listing-${Date.now()}`,
      message: `Asset listed for sale at $${proposal.askingPriceUSD}`,
      data: {
        askingPriceUSD: proposal.askingPriceUSD,
        listingDurationDays: proposal.listingDurationDays,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      signature: '',
      message: error?.message || 'Failed to list asset for sale',
    };
  }
}

/**
 * Execute an "accept offer" proposal
 * Accepts a purchase offer and initiates the sale
 */
async function executeAcceptOffer(
  pool: any,
  proposal: any
): Promise<{
  success: boolean;
  signature: string;
  message: string;
  data?: unknown;
}> {
  try {
    // If pool has Squads integration, execute via Squads
    if (pool.squadMultisigPda && proposal.squadsTransactionIndex) {
      const squadsResult = await executeSquadsProposal(
        pool.squadMultisigPda,
        proposal.squadsTransactionIndex
      );
      return {
        success: squadsResult.executed,
        signature: squadsResult.signature,
        message: `Offer of $${proposal.offerAmountUSD} accepted from ${proposal.buyerWallet}`,
        data: { squadsExecution: squadsResult },
      };
    }

    // For pools without Squads, execute directly
    // This would typically involve:
    // 1. Transfer NFT from Squad vault to buyer
    // 2. Receive payment
    // 3. Distribute proceeds to token holders
    // For now, we mark as successful and await manual distribution

    return {
      success: true,
      signature: `offer-accepted-${Date.now()}`,
      message: `Offer of $${proposal.offerAmountUSD} accepted. Awaiting payment and distribution.`,
      data: {
        offerAmountUSD: proposal.offerAmountUSD,
        buyerWallet: proposal.buyerWallet,
        distributionPending: true,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      signature: '',
      message: error?.message || 'Failed to accept offer',
    };
  }
}
