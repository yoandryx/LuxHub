// pages/api/vault/config/change-multisig.ts
// Change the multisig address for the LuxHub vault (super_admin only)

import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { VaultConfig, VaultActivity } from '@/lib/models/LuxHubVault';
import { Vendor } from '@/lib/models/Vendor';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for admin wallet header
  const adminWallet = req.headers['x-admin-wallet'] as string;
  if (!adminWallet) {
    return res.status(401).json({ error: 'Missing x-admin-wallet header' });
  }

  const { newMultisigAddress, newVaultPda } = req.body;

  if (!newMultisigAddress || !newVaultPda) {
    return res.status(400).json({ error: 'Missing newMultisigAddress or newVaultPda' });
  }

  await dbConnect();

  try {
    // Get current config
    const config = await VaultConfig.findOne({ isActive: true });
    if (!config) {
      return res.status(404).json({ error: 'Vault not configured' });
    }

    // Check if requester is a super_admin
    const requesterAdmin = config.authorizedAdmins.find(
      (a: { walletAddress: string }) => a.walletAddress === adminWallet
    );
    if (!requesterAdmin || requesterAdmin.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super_admin can change multisig' });
    }

    // Store old values for activity log
    const oldMultisig = config.multisigAddress;
    const oldVaultPda = config.vaultPda;

    // Update config
    config.multisigAddress = newMultisigAddress;
    config.vaultPda = newVaultPda;
    config.collectionAuthority = newMultisigAddress;
    await config.save();

    // Also update the LuxHub vendor's multisig reference
    await Vendor.updateOne({ isOfficial: true }, { $set: { multisigPda: newMultisigAddress } });

    // Log the activity
    await VaultActivity.create({
      activityType: 'multisig_changed',
      performedBy: adminWallet,
      details: {
        oldMultisig,
        newMultisig: newMultisigAddress,
        oldVaultPda,
        newVaultPda,
      },
    });

    console.log(`[VAULT-CONFIG] Multisig changed by ${adminWallet}`);
    console.log(`  Old: ${oldMultisig} -> ${oldVaultPda}`);
    console.log(`  New: ${newMultisigAddress} -> ${newVaultPda}`);

    return res.status(200).json({
      success: true,
      message: 'Multisig updated successfully',
      data: {
        multisigAddress: newMultisigAddress,
        vaultPda: newVaultPda,
      },
      note: 'Update your .env.local with the new values for persistence across restarts',
    });
  } catch (error) {
    console.error('[VAULT-CHANGE-MULTISIG] Error:', error);
    return res.status(500).json({ error: 'Failed to change multisig' });
  }
}
