// /lib/models/AdminRole.ts
// Database-driven admin role management for LuxHub
// Allows adding/removing admins without redeploying
import mongoose from 'mongoose';

export type AdminLevel = 'super_admin' | 'admin' | 'moderator';

const AdminRoleSchema = new mongoose.Schema(
  {
    // Wallet address of the admin
    wallet: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Admin level
    role: {
      type: String,
      enum: ['super_admin', 'admin', 'moderator'],
      required: true,
      default: 'admin',
    },

    // Display name
    name: { type: String },
    email: { type: String },

    // Who added this admin
    addedBy: { type: String, required: true },
    addedAt: { type: Date, default: Date.now },

    // Status
    isActive: { type: Boolean, default: true },
    deactivatedBy: { type: String },
    deactivatedAt: { type: Date },
    deactivationReason: { type: String },

    // Permissions (granular control)
    permissions: {
      canApproveMints: { type: Boolean, default: true },
      canApproveListings: { type: Boolean, default: true },
      canManageVendors: { type: Boolean, default: true },
      canManageEscrows: { type: Boolean, default: true },
      canManagePools: { type: Boolean, default: true },
      canFreezeNfts: { type: Boolean, default: true },
      canBurnNfts: { type: Boolean, default: false }, // Only super_admin by default
      canManageAdmins: { type: Boolean, default: false }, // Only super_admin
      canAccessTreasury: { type: Boolean, default: false }, // Only super_admin
      canExecuteSquads: { type: Boolean, default: false }, // Squads multisig member
    },

    // Squads integration
    isSquadsMember: { type: Boolean, default: false },
    squadsRole: { type: String }, // e.g., "proposer", "voter", "executor"

    // Notes
    notes: { type: String },

    // Last activity tracking
    lastActiveAt: { type: Date },
    lastAction: { type: String },
  },
  { timestamps: true }
);

// Indexes
AdminRoleSchema.index({ role: 1, isActive: 1 });
AdminRoleSchema.index({ isActive: 1, wallet: 1 });

// Pre-save: Set default permissions based on role
AdminRoleSchema.pre('save', function (next) {
  if (this.isModified('role')) {
    switch (this.role) {
      case 'super_admin':
        this.permissions = {
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
        };
        break;
      case 'admin':
        this.permissions = {
          canApproveMints: true,
          canApproveListings: true,
          canManageVendors: true,
          canManageEscrows: true,
          canManagePools: true,
          canFreezeNfts: true,
          canBurnNfts: false,
          canManageAdmins: false,
          canAccessTreasury: false,
          canExecuteSquads: false,
        };
        break;
      case 'moderator':
        this.permissions = {
          canApproveMints: true,
          canApproveListings: true,
          canManageVendors: false,
          canManageEscrows: false,
          canManagePools: false,
          canFreezeNfts: false,
          canBurnNfts: false,
          canManageAdmins: false,
          canAccessTreasury: false,
          canExecuteSquads: false,
        };
        break;
    }
  }
  next();
});

// Static: Check if wallet is admin (any level)
AdminRoleSchema.statics.isAdmin = async function (wallet: string): Promise<boolean> {
  const admin = await this.findOne({ wallet, isActive: true });
  return !!admin;
};

// Static: Check if wallet has specific permission
AdminRoleSchema.statics.hasPermission = async function (
  wallet: string,
  permission: keyof typeof AdminRoleSchema.prototype.permissions
): Promise<boolean> {
  const admin = await this.findOne({ wallet, isActive: true });
  if (!admin) return false;
  return admin.permissions?.[permission] === true;
};

// Static: Get admin by wallet
AdminRoleSchema.statics.getByWallet = function (wallet: string) {
  return this.findOne({ wallet, isActive: true });
};

// Static: Get all active admins
AdminRoleSchema.statics.getAllActive = function () {
  return this.find({ isActive: true }).sort({ role: 1, createdAt: 1 });
};

export default mongoose.models.AdminRole || mongoose.model('AdminRole', AdminRoleSchema);
