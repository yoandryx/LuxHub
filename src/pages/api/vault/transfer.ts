// pages/api/vault/transfer.ts
// Transfer NFT from LuxHub vault to vendor, user, or pool

import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { VaultInventory, VaultActivity, VaultConfig } from '@/lib/models/LuxHubVault';
import { Asset } from '@/lib/models/Assets';
import authMiddleware from '@/lib/middleware/auth';

interface TransferRequest {
  nftMint: string;
  destinationType: 'vendor' | 'user' | 'pool' | 'airdrop';
  destinationId?: string; // Vendor ID, Pool ID, or User ID
  destinationWallet: string; // Recipient wallet address
  reason?: string;
  notes?: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await dbConnect();

  const adminWallet = (req as any).user?.walletAddress;
  if (!adminWallet) {
    return res.status(401).json({ error: 'Admin wallet not found' });
  }

  const { nftMint, destinationType, destinationId, destinationWallet, reason, notes } =
    req.body as TransferRequest;

  // Validation
  if (!nftMint || !destinationType || !destinationWallet) {
    return res.status(400).json({
      error: 'Missing required fields: nftMint, destinationType, destinationWallet',
    });
  }

  try {
    // 1. Find the NFT in vault inventory
    const vaultItem = await VaultInventory.findOne({ nftMint });

    if (!vaultItem) {
      return res.status(404).json({ error: 'NFT not found in vault inventory' });
    }

    if (vaultItem.status === 'transferred') {
      return res.status(400).json({ error: 'NFT has already been transferred' });
    }

    if (vaultItem.status === 'pending_transfer') {
      return res.status(400).json({ error: 'NFT transfer already in progress' });
    }

    // 2. Check vault config for approval requirements
    const vaultConfig = await VaultConfig.findOne({ isActive: true });
    const threshold = vaultConfig?.transferApprovalThreshold || 1;

    // If threshold > 1, we need multisig approval (create Squads proposal)
    if (threshold > 1) {
      // Mark as pending and create proposal
      vaultItem.status = 'pending_transfer';
      vaultItem.distribution = {
        destinationType,
        destinationId,
        destinationWallet,
        reason,
      };

      await vaultItem.save();

      // Log activity
      await VaultActivity.create({
        activityType: 'transfer_initiated',
        performedBy: adminWallet,
        nftMint,
        inventoryId: vaultItem._id,
        squadsProposal: {
          status: 'pending',
          approvals: 1,
          threshold,
        },
        details: {
          destinationType,
          destinationWallet,
          reason,
        },
        notes,
      });

      return res.status(200).json({
        success: true,
        status: 'pending_approval',
        message: `Transfer requires ${threshold} approvals. Proposal created.`,
        data: {
          inventoryId: vaultItem._id,
          nftMint,
          destinationWallet,
          approvalsNeeded: threshold - 1,
        },
      });
    }

    // 3. Single approval mode - execute transfer immediately
    // Note: Actual on-chain transfer would happen here via Metaplex/mpl-core
    // For now, we update the database and assume on-chain transfer is done separately

    vaultItem.status = 'transferred';
    vaultItem.distribution = {
      destinationType,
      destinationId,
      destinationWallet,
      transferredAt: new Date(),
      transferredBy: adminWallet,
      reason,
    };

    vaultItem.history.push({
      action: 'transferred',
      performedBy: adminWallet,
      performedAt: new Date(),
      details: {
        destinationType,
        destinationWallet,
        reason,
      },
    });

    await vaultItem.save();

    // 4. Update Asset record
    await Asset.updateOne(
      { nftMint },
      {
        $set: {
          nftOwnerWallet: destinationWallet,
          status: destinationType === 'pool' ? 'pooled' : 'pending',
        },
        $push: {
          transferHistory: {
            from: vaultConfig?.vaultPda || 'luxhub_vault',
            to: destinationWallet,
            transferredAt: new Date(),
          },
        },
      }
    );

    // 5. Update vault stats
    await VaultConfig.updateOne(
      { isActive: true },
      {
        $inc: { totalDistributed: 1, currentHoldings: -1 },
      }
    );

    // 6. Log activity
    await VaultActivity.create({
      activityType: 'transfer_completed',
      performedBy: adminWallet,
      nftMint,
      inventoryId: vaultItem._id,
      details: {
        destinationType,
        destinationId,
        destinationWallet,
        reason,
      },
      notes,
    });

    return res.status(200).json({
      success: true,
      status: 'completed',
      message: 'NFT transferred successfully',
      data: {
        inventoryId: vaultItem._id,
        nftMint,
        destinationType,
        destinationWallet,
        transferredAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[VAULT-TRANSFER] Error:', error);
    return res.status(500).json({ error: 'Transfer failed' });
  }
}

// Require admin authentication
export default authMiddleware(handler);
