// /pages/api/admin/team/index.ts
// Manage admin team members
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import AdminRole from '../../../../lib/models/AdminRole';
import { getAdminConfig } from '../../../../lib/config/adminConfig';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  // Get requesting wallet from header or query
  const requestingWallet =
    (req.headers['x-wallet-address'] as string) || (req.query.wallet as string);

  if (!requestingWallet) {
    return res.status(401).json({ error: 'Wallet address required' });
  }

  const adminConfig = getAdminConfig();

  // Check if requester is authorized
  const requesterAdmin = await AdminRole.findOne({ wallet: requestingWallet, isActive: true });
  const isEnvSuperAdmin = adminConfig.isSuperAdmin(requestingWallet);
  const isEnvAdmin = adminConfig.isAdmin(requestingWallet);

  // Must be at least an admin to view team
  if (!requesterAdmin && !isEnvAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // GET - List all admins
  if (req.method === 'GET') {
    try {
      const admins = await AdminRole.find({ isActive: true })
        .select('-__v')
        .sort({ role: 1, createdAt: 1 });

      // Also include env-based super admins (for display purposes)
      const envSuperAdmins = adminConfig.superAdminWallets.map((wallet) => ({
        wallet,
        role: 'super_admin',
        name: 'Environment Config',
        isEnvBased: true,
        permissions: {
          canApproveMints: true,
          canApproveListings: true,
          canManageVendors: true,
          canManageEscrows: true,
          canManagePools: true,
          canFreezeNfts: true,
          canBurnNfts: true,
          canManageAdmins: true,
          canAccessTreasury: true,
          canExecuteSquads: true,
        },
      }));

      return res.status(200).json({
        admins,
        envSuperAdmins,
        total: admins.length + envSuperAdmins.length,
      });
    } catch (error) {
      console.error('Error fetching admins:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // POST - Add new admin
  if (req.method === 'POST') {
    // Only super admins (env or db) can add admins
    const canManageAdmins =
      isEnvSuperAdmin ||
      requesterAdmin?.role === 'super_admin' ||
      requesterAdmin?.permissions?.canManageAdmins;

    if (!canManageAdmins) {
      return res.status(403).json({ error: 'Only super admins can add team members' });
    }

    const { wallet, role, name, email, permissions, notes, isSquadsMember, squadsRole } = req.body;

    if (!wallet) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    // Validate role
    const validRoles = ['super_admin', 'admin', 'moderator'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be: ${validRoles.join(', ')}` });
    }

    // Only env super admins can add other super admins
    if (role === 'super_admin' && !isEnvSuperAdmin) {
      return res.status(403).json({ error: 'Only environment super admins can add super admins' });
    }

    try {
      // Check if already exists
      const existing = await AdminRole.findOne({ wallet });
      if (existing) {
        if (existing.isActive) {
          return res.status(400).json({ error: 'This wallet is already an admin' });
        }
        // Reactivate
        existing.isActive = true;
        existing.role = role || 'admin';
        existing.name = name || existing.name;
        existing.email = email || existing.email;
        existing.addedBy = requestingWallet;
        existing.addedAt = new Date();
        existing.deactivatedBy = undefined;
        existing.deactivatedAt = undefined;
        existing.deactivationReason = undefined;
        if (notes) existing.notes = notes;
        if (isSquadsMember !== undefined) existing.isSquadsMember = isSquadsMember;
        if (squadsRole) existing.squadsRole = squadsRole;
        await existing.save();
        return res.status(200).json({ message: 'Admin reactivated', admin: existing });
      }

      // Create new admin
      const newAdmin = await AdminRole.create({
        wallet,
        role: role || 'admin',
        name,
        email,
        addedBy: requestingWallet,
        permissions, // Will use defaults from pre-save hook if not provided
        notes,
        isSquadsMember,
        squadsRole,
      });

      return res.status(201).json({ message: 'Admin added', admin: newAdmin });
    } catch (error) {
      console.error('Error adding admin:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
