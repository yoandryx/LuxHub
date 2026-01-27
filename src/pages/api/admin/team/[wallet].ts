// /pages/api/admin/team/[wallet].ts
// Manage individual admin team member
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import AdminRole from '../../../../lib/models/AdminRole';
import { getAdminConfig } from '../../../../lib/config/adminConfig';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  const { wallet: targetWallet } = req.query;

  if (!targetWallet || typeof targetWallet !== 'string') {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  // Get requesting wallet from header
  const requestingWallet = req.headers['x-wallet-address'] as string;

  if (!requestingWallet) {
    return res.status(401).json({ error: 'Wallet address required in x-wallet-address header' });
  }

  const adminConfig = getAdminConfig();

  // Check if requester is authorized
  const requesterAdmin = await AdminRole.findOne({ wallet: requestingWallet, isActive: true });
  const isEnvSuperAdmin = adminConfig.isSuperAdmin(requestingWallet);
  const isEnvAdmin = adminConfig.isAdmin(requestingWallet);

  if (!requesterAdmin && !isEnvAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // GET - Get single admin details
  if (req.method === 'GET') {
    try {
      const admin = await AdminRole.findOne({ wallet: targetWallet });

      if (!admin) {
        // Check if it's an env-based admin
        if (adminConfig.isAdmin(targetWallet)) {
          return res.status(200).json({
            wallet: targetWallet,
            role: adminConfig.isSuperAdmin(targetWallet) ? 'super_admin' : 'admin',
            isEnvBased: true,
            isActive: true,
          });
        }
        return res.status(404).json({ error: 'Admin not found' });
      }

      return res.status(200).json(admin);
    } catch (error) {
      console.error('Error fetching admin:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // PATCH - Update admin
  if (req.method === 'PATCH') {
    // Check permissions
    const canManageAdmins =
      isEnvSuperAdmin ||
      requesterAdmin?.role === 'super_admin' ||
      requesterAdmin?.permissions?.canManageAdmins;

    if (!canManageAdmins) {
      return res.status(403).json({ error: 'Only super admins can update team members' });
    }

    // Can't modify env-based admins
    if (adminConfig.isAdmin(targetWallet) && !(await AdminRole.findOne({ wallet: targetWallet }))) {
      return res.status(400).json({ error: 'Cannot modify environment-based admins' });
    }

    const { role, name, email, permissions, notes, isSquadsMember, squadsRole } = req.body;

    try {
      const admin = await AdminRole.findOne({ wallet: targetWallet });

      if (!admin) {
        return res.status(404).json({ error: 'Admin not found' });
      }

      // Only env super admins can change someone to super_admin
      if (role === 'super_admin' && admin.role !== 'super_admin' && !isEnvSuperAdmin) {
        return res
          .status(403)
          .json({ error: 'Only environment super admins can promote to super admin' });
      }

      // Update fields
      if (role) admin.role = role;
      if (name !== undefined) admin.name = name;
      if (email !== undefined) admin.email = email;
      if (notes !== undefined) admin.notes = notes;
      if (isSquadsMember !== undefined) admin.isSquadsMember = isSquadsMember;
      if (squadsRole !== undefined) admin.squadsRole = squadsRole;

      // Update individual permissions (merge with existing)
      if (permissions && typeof permissions === 'object') {
        admin.permissions = { ...admin.permissions, ...permissions };
      }

      await admin.save();

      return res.status(200).json({ message: 'Admin updated', admin });
    } catch (error) {
      console.error('Error updating admin:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // DELETE - Deactivate admin (soft delete)
  if (req.method === 'DELETE') {
    // Check permissions
    const canManageAdmins =
      isEnvSuperAdmin ||
      requesterAdmin?.role === 'super_admin' ||
      requesterAdmin?.permissions?.canManageAdmins;

    if (!canManageAdmins) {
      return res.status(403).json({ error: 'Only super admins can remove team members' });
    }

    // Can't remove yourself
    if (targetWallet === requestingWallet) {
      return res.status(400).json({ error: 'Cannot remove yourself' });
    }

    // Can't remove env-based admins
    if (adminConfig.isAdmin(targetWallet) && !(await AdminRole.findOne({ wallet: targetWallet }))) {
      return res.status(400).json({
        error: 'Cannot remove environment-based admins. Remove from ADMIN_WALLETS env var.',
      });
    }

    const { reason } = req.body;

    try {
      const admin = await AdminRole.findOne({ wallet: targetWallet });

      if (!admin) {
        return res.status(404).json({ error: 'Admin not found' });
      }

      if (!admin.isActive) {
        return res.status(400).json({ error: 'Admin is already deactivated' });
      }

      // Only env super admins can remove super admins
      if (admin.role === 'super_admin' && !isEnvSuperAdmin) {
        return res
          .status(403)
          .json({ error: 'Only environment super admins can remove super admins' });
      }

      // Soft delete
      admin.isActive = false;
      admin.deactivatedBy = requestingWallet;
      admin.deactivatedAt = new Date();
      admin.deactivationReason = reason || 'Removed by admin';
      await admin.save();

      return res.status(200).json({ message: 'Admin deactivated', admin });
    } catch (error) {
      console.error('Error removing admin:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
