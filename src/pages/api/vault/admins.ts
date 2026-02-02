import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { VaultConfig } from '@/lib/models/LuxHubVault';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  // Get VaultConfig (or create default)
  let config = await VaultConfig.findOne({});
  if (!config) {
    config = await VaultConfig.create({
      treasuryWallet: process.env.NEXT_PUBLIC_VAULT_PDA || '',
      programId: process.env.PROGRAM_ID || '',
      authorizedAdmins: [],
    });
  }

  // Check if requester is authorized (super_admin only for admin management)
  const checkSuperAdmin = (walletAddress: string): boolean => {
    const superAdminEnv = (process.env.SUPER_ADMIN_WALLETS || '').split(',').map((w) => w.trim());
    const configSuperAdmins = config.authorizedAdmins
      .filter((a: any) => a.role === 'super_admin')
      .map((a: any) => a.walletAddress);
    return superAdminEnv.includes(walletAddress) || configSuperAdmins.includes(walletAddress);
  };

  if (req.method === 'POST') {
    // Add admin
    const { walletAddress, name, role, addedBy } = req.body;

    if (!walletAddress || !addedBy) {
      return res.status(400).json({ error: 'walletAddress and addedBy are required' });
    }

    // Check if requester is super_admin
    if (!checkSuperAdmin(addedBy)) {
      return res.status(403).json({ error: 'Only super_admin can add admins' });
    }

    // Check if already exists
    const exists = config.authorizedAdmins.some((a: any) => a.walletAddress === walletAddress);
    if (exists) {
      return res.status(400).json({ error: 'Admin already exists' });
    }

    // Add new admin
    config.authorizedAdmins.push({
      walletAddress,
      name: name || '',
      role: role || 'admin',
      addedAt: new Date(),
      addedBy,
    });

    await config.save();

    return res.status(200).json({
      success: true,
      message: `Admin ${walletAddress} added with role ${role || 'admin'}`,
      authorizedAdmins: config.authorizedAdmins,
    });
  }

  if (req.method === 'DELETE') {
    // Remove admin
    const { walletAddress, removedBy } = req.body;

    if (!walletAddress || !removedBy) {
      return res.status(400).json({ error: 'walletAddress and removedBy are required' });
    }

    // Check if requester is super_admin
    if (!checkSuperAdmin(removedBy)) {
      return res.status(403).json({ error: 'Only super_admin can remove admins' });
    }

    // Prevent removing self if last super_admin
    const superAdmins = config.authorizedAdmins.filter((a: any) => a.role === 'super_admin');
    const isRemovingSuperAdmin = superAdmins.some((a: any) => a.walletAddress === walletAddress);
    if (isRemovingSuperAdmin && superAdmins.length <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last super_admin' });
    }

    // Remove admin
    const initialLength = config.authorizedAdmins.length;
    config.authorizedAdmins = config.authorizedAdmins.filter(
      (a: any) => a.walletAddress !== walletAddress
    );

    if (config.authorizedAdmins.length === initialLength) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    await config.save();

    return res.status(200).json({
      success: true,
      message: `Admin ${walletAddress} removed`,
      authorizedAdmins: config.authorizedAdmins,
    });
  }

  if (req.method === 'PUT') {
    // Update admin role
    const { walletAddress, role, updatedBy } = req.body;

    if (!walletAddress || !role || !updatedBy) {
      return res.status(400).json({ error: 'walletAddress, role, and updatedBy are required' });
    }

    // Check if requester is super_admin
    if (!checkSuperAdmin(updatedBy)) {
      return res.status(403).json({ error: 'Only super_admin can update admin roles' });
    }

    // Find and update
    const admin = config.authorizedAdmins.find((a: any) => a.walletAddress === walletAddress);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    admin.role = role;
    await config.save();

    return res.status(200).json({
      success: true,
      message: `Admin ${walletAddress} role updated to ${role}`,
      authorizedAdmins: config.authorizedAdmins,
    });
  }

  if (req.method === 'GET') {
    // List all admins
    return res.status(200).json({
      success: true,
      authorizedAdmins: config.authorizedAdmins,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
