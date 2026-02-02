// pages/api/vault/config.ts
// Get and update vault configuration

import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { VaultConfig, VaultActivity } from '@/lib/models/LuxHubVault';
import { Vendor } from '@/lib/models/Vendor';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  // GET - Fetch vault config (PUBLIC - no auth required)
  if (req.method === 'GET') {
    try {
      const config = (await VaultConfig.findOne({ isActive: true }).lean()) as {
        vaultPda: string;
        multisigAddress: string;
        collectionMint?: string;
        mintApprovalThreshold: number;
        transferApprovalThreshold: number;
        totalMinted: number;
        totalDistributed: number;
        currentHoldings: number;
        isActive: boolean;
        authorizedAdmins: Array<{ walletAddress: string; role: string }>;
      } | null;

      const luxhubVendor = (await Vendor.findOne({ isOfficial: true }).lean()) as {
        _id: unknown;
        businessName?: string;
        username?: string;
        walletAddress?: string;
      } | null;

      if (!config) {
        return res.status(404).json({
          error: 'Vault not configured',
          hint: 'Run: node scripts/seedLuxHubVault.mjs',
        });
      }

      return res.status(200).json({
        success: true,
        config: {
          vaultPda: config.vaultPda,
          multisigAddress: config.multisigAddress,
          collectionMint: config.collectionMint,
          mintApprovalThreshold: config.mintApprovalThreshold,
          transferApprovalThreshold: config.transferApprovalThreshold,
          totalMinted: config.totalMinted,
          totalDistributed: config.totalDistributed,
          currentHoldings: config.currentHoldings,
          isActive: config.isActive,
          authorizedAdmins: config.authorizedAdmins || [],
        },
        luxhubVendor: luxhubVendor
          ? {
              id: luxhubVendor._id,
              businessName: luxhubVendor.businessName,
              username: luxhubVendor.username,
              walletAddress: luxhubVendor.walletAddress,
            }
          : null,
      });
    } catch (error) {
      console.error('[VAULT-CONFIG] GET error:', error);
      return res.status(500).json({ error: 'Failed to fetch vault config' });
    }
  }

  // PATCH - Update vault config (requires auth header with admin wallet)
  if (req.method === 'PATCH') {
    // Simple auth check via header (for admin operations)
    const adminWallet = req.headers['x-admin-wallet'] as string;
    if (!adminWallet) {
      return res.status(401).json({ error: 'Missing x-admin-wallet header' });
    }

    const {
      multisigAddress,
      collectionMint,
      mintApprovalThreshold,
      transferApprovalThreshold,
      addAdmin,
      removeAdmin,
    } = req.body;

    try {
      const config = await VaultConfig.findOne({ isActive: true });
      if (!config) {
        return res.status(404).json({ error: 'Vault not configured' });
      }

      // Check if requester is a super_admin
      const requesterAdmin = config.authorizedAdmins.find(
        (a: { walletAddress: string }) => a.walletAddress === adminWallet
      );
      if (!requesterAdmin || requesterAdmin.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only super_admin can modify vault config' });
      }

      const updates: Record<string, unknown> = {};
      const activities: Array<{ type: string; details: Record<string, unknown> }> = [];

      // Update multisig address
      if (multisigAddress !== undefined) {
        updates.multisigAddress = multisigAddress;
        activities.push({
          type: 'config_updated',
          details: { field: 'multisigAddress', value: multisigAddress },
        });
      }

      // Update collection mint
      if (collectionMint !== undefined) {
        updates.collectionMint = collectionMint;
        updates.collectionAuthority = config.multisigAddress;
        activities.push({
          type: 'config_updated',
          details: { field: 'collectionMint', value: collectionMint },
        });
      }

      // Update thresholds
      if (mintApprovalThreshold !== undefined) {
        updates.mintApprovalThreshold = mintApprovalThreshold;
        activities.push({
          type: 'config_updated',
          details: { field: 'mintApprovalThreshold', value: mintApprovalThreshold },
        });
      }

      if (transferApprovalThreshold !== undefined) {
        updates.transferApprovalThreshold = transferApprovalThreshold;
        activities.push({
          type: 'config_updated',
          details: { field: 'transferApprovalThreshold', value: transferApprovalThreshold },
        });
      }

      // Add admin
      if (addAdmin) {
        const existingAdmin = config.authorizedAdmins.find(
          (a: { walletAddress: string }) => a.walletAddress === addAdmin.walletAddress
        );
        if (existingAdmin) {
          return res.status(400).json({ error: 'Admin already exists' });
        }

        config.authorizedAdmins.push({
          walletAddress: addAdmin.walletAddress,
          name: addAdmin.name || 'Admin',
          role: addAdmin.role || 'minter',
          addedAt: new Date(),
          addedBy: adminWallet,
        });

        activities.push({
          type: 'admin_added',
          details: { admin: addAdmin.walletAddress, role: addAdmin.role || 'minter' },
        });
      }

      // Remove admin
      if (removeAdmin) {
        const adminIndex = config.authorizedAdmins.findIndex(
          (a: { walletAddress: string }) => a.walletAddress === removeAdmin
        );
        if (adminIndex === -1) {
          return res.status(400).json({ error: 'Admin not found' });
        }

        // Prevent removing last super_admin
        const superAdmins = config.authorizedAdmins.filter(
          (a: { role: string }) => a.role === 'super_admin'
        );
        const removingAdmin = config.authorizedAdmins[adminIndex];
        if (removingAdmin.role === 'super_admin' && superAdmins.length <= 1) {
          return res.status(400).json({ error: 'Cannot remove last super_admin' });
        }

        config.authorizedAdmins.splice(adminIndex, 1);
        activities.push({
          type: 'admin_removed',
          details: { admin: removeAdmin },
        });
      }

      // Apply updates
      Object.assign(config, updates);
      await config.save();

      // Log activities
      for (const activity of activities) {
        await VaultActivity.create({
          activityType: activity.type,
          performedBy: adminWallet,
          details: activity.details,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Vault config updated',
        data: config,
      });
    } catch (error) {
      console.error('[VAULT-CONFIG] PATCH error:', error);
      return res.status(500).json({ error: 'Failed to update vault config' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
