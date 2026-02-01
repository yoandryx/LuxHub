// pages/api/platform/config.ts
// Get and update platform configuration (super_admin only for updates)

import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { PlatformConfig } from '@/lib/models/PlatformConfig';
import { VaultConfig } from '@/lib/models/LuxHubVault';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  // GET - Fetch platform config
  if (req.method === 'GET') {
    const adminWallet = req.headers['x-admin-wallet'] as string;
    const showSensitive = req.query.showSensitive === 'true';

    try {
      let config = await PlatformConfig.findOne({ configKey: 'main' }).lean();

      // If no config exists, create from current env/vault settings
      if (!config) {
        const vaultConfig = (await VaultConfig.findOne({ isActive: true }).lean()) as {
          multisigAddress?: string;
          vaultPda?: string;
        } | null;

        config = await PlatformConfig.create({
          configKey: 'main',
          solana: {
            rpcEndpoint: process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || '',
            cluster: 'devnet',
            programId: process.env.PROGRAM_ID || '',
          },
          multisig: {
            address: vaultConfig?.multisigAddress || process.env.NEXT_PUBLIC_SQUADS_MSIG || '',
            treasuryVaultIndex: 0,
            nftVaultIndex: 1,
            treasuryVaultPda: process.env.NEXT_PUBLIC_LUXHUB_WALLET || '',
            nftVaultPda: vaultConfig?.vaultPda || process.env.NEXT_PUBLIC_VAULT_PDA || '',
          },
          wallets: {
            luxhubWallet: process.env.NEXT_PUBLIC_LUXHUB_WALLET || '',
            feeCollector: process.env.NEXT_PUBLIC_LUXHUB_WALLET || '',
          },
          lastUpdatedBy: 'system',
        });
      }

      // Check if requester is super_admin for sensitive data
      let isSuperAdmin = false;
      if (adminWallet) {
        const vaultConfig = (await VaultConfig.findOne({ isActive: true }).lean()) as {
          authorizedAdmins?: Array<{ walletAddress: string; role: string }>;
        } | null;
        isSuperAdmin =
          vaultConfig?.authorizedAdmins?.some(
            (a) => a.walletAddress === adminWallet && a.role === 'super_admin'
          ) || false;
      }

      // Mask sensitive values if not super_admin or not requested
      const responseConfig = { ...config } as Record<string, unknown>;
      if (!isSuperAdmin || !showSensitive) {
        // Mask wallet addresses
        if (responseConfig.wallets && typeof responseConfig.wallets === 'object') {
          const wallets = responseConfig.wallets as Record<string, string>;
          responseConfig.wallets = {
            luxhubWallet: maskAddress(wallets.luxhubWallet),
            feeCollector: maskAddress(wallets.feeCollector),
          };
        }
        if (responseConfig.multisig && typeof responseConfig.multisig === 'object') {
          const multisig = responseConfig.multisig as Record<string, unknown>;
          responseConfig.multisig = {
            ...multisig,
            address: maskAddress(multisig.address as string),
            treasuryVaultPda: maskAddress(multisig.treasuryVaultPda as string),
            nftVaultPda: maskAddress(multisig.nftVaultPda as string),
          };
        }
      }

      return res.status(200).json({
        success: true,
        data: responseConfig,
        isSuperAdmin,
        masked: !isSuperAdmin || !showSensitive,
      });
    } catch (error) {
      console.error('[PLATFORM-CONFIG] GET error:', error);
      return res.status(500).json({ error: 'Failed to fetch platform config' });
    }
  }

  // PATCH - Update platform config (super_admin only)
  if (req.method === 'PATCH') {
    const adminWallet = req.headers['x-admin-wallet'] as string;
    if (!adminWallet) {
      return res.status(401).json({ error: 'Missing x-admin-wallet header' });
    }

    try {
      // Verify super_admin
      const vaultConfig = (await VaultConfig.findOne({ isActive: true }).lean()) as {
        authorizedAdmins?: Array<{ walletAddress: string; role: string }>;
      } | null;
      const isSuperAdmin = vaultConfig?.authorizedAdmins?.some(
        (a) => a.walletAddress === adminWallet && a.role === 'super_admin'
      );

      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'Only super_admin can update platform config' });
      }

      const updates = req.body;

      // Find or create config
      let config = await PlatformConfig.findOne({ configKey: 'main' });
      if (!config) {
        config = new PlatformConfig({ configKey: 'main' });
      }

      // Apply updates (deep merge for nested objects)
      if (updates.solana) {
        config.solana = { ...config.solana, ...updates.solana };
      }
      if (updates.multisig) {
        config.multisig = { ...config.multisig, ...updates.multisig };
      }
      if (updates.wallets) {
        config.wallets = { ...config.wallets, ...updates.wallets };
      }
      if (updates.platform) {
        config.platform = { ...config.platform, ...updates.platform };
      }
      if (updates.features) {
        config.features = { ...config.features, ...updates.features };
      }
      if (updates.services) {
        config.services = { ...config.services, ...updates.services };
      }

      config.lastUpdatedBy = adminWallet;
      config.lastUpdatedAt = new Date();

      await config.save();

      // Also sync multisig changes to VaultConfig if updated
      if (updates.multisig?.address || updates.multisig?.nftVaultPda) {
        await VaultConfig.updateOne(
          { isActive: true },
          {
            $set: {
              ...(updates.multisig.address && { multisigAddress: updates.multisig.address }),
              ...(updates.multisig.nftVaultPda && { vaultPda: updates.multisig.nftVaultPda }),
            },
          }
        );
      }

      console.log(`[PLATFORM-CONFIG] Updated by ${adminWallet}`);

      return res.status(200).json({
        success: true,
        message: 'Platform config updated',
        data: config,
      });
    } catch (error) {
      console.error('[PLATFORM-CONFIG] PATCH error:', error);
      return res.status(500).json({ error: 'Failed to update platform config' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Helper to mask addresses
function maskAddress(addr: string | undefined): string {
  if (!addr || addr.length < 12) return addr || '***';
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}
