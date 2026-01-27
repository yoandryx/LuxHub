// /lib/config/adminConfig.ts
// Centralized admin configuration for LuxHub
// Consolidates admin wallet lists and keypair access
import { Keypair } from '@solana/web3.js';

// Admin wallet lists from environment
const parseWalletList = (envVar: string | undefined): string[] => {
  if (!envVar) return [];
  return envVar
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);
};

// Cached config
let _config: AdminConfig | null = null;

export interface AdminConfig {
  // Admin wallets (can perform admin actions)
  adminWallets: string[];

  // Super admin wallets (can perform destructive actions like burn)
  superAdminWallets: string[];

  // Treasury wallet
  treasuryWallet: string | null;

  // Check if a wallet is an admin
  isAdmin: (wallet: string | null | undefined) => boolean;

  // Check if a wallet is a super admin
  isSuperAdmin: (wallet: string | null | undefined) => boolean;

  // Get admin keypair for server-side signing (minting, transfers)
  // Returns null if not configured
  getAdminKeypair: () => Keypair | null;
}

export function getAdminConfig(): AdminConfig {
  if (_config) return _config;

  const adminWallets = parseWalletList(process.env.ADMIN_WALLETS);
  const superAdminWallets = parseWalletList(process.env.SUPER_ADMIN_WALLETS);
  const treasuryWallet = process.env.NEXT_PUBLIC_LUXHUB_WALLET || null;

  // Cache the keypair
  let _adminKeypair: Keypair | null | undefined = undefined;

  _config = {
    adminWallets,
    superAdminWallets,
    treasuryWallet,

    isAdmin: (wallet: string | null | undefined): boolean => {
      if (!wallet) return false;
      return adminWallets.includes(wallet) || superAdminWallets.includes(wallet);
    },

    isSuperAdmin: (wallet: string | null | undefined): boolean => {
      if (!wallet) return false;
      return superAdminWallets.includes(wallet);
    },

    getAdminKeypair: (): Keypair | null => {
      // Return cached keypair if already loaded
      if (_adminKeypair !== undefined) return _adminKeypair;

      try {
        // Try ADMIN_SECRET first (existing convention)
        if (process.env.ADMIN_SECRET) {
          const secretKey = new Uint8Array(JSON.parse(process.env.ADMIN_SECRET));
          _adminKeypair = Keypair.fromSecretKey(secretKey);
          return _adminKeypair;
        }

        // Try ADMIN_KEYPAIR_JSON (alternative)
        if (process.env.ADMIN_KEYPAIR_JSON) {
          const secretKey = new Uint8Array(JSON.parse(process.env.ADMIN_KEYPAIR_JSON));
          _adminKeypair = Keypair.fromSecretKey(secretKey);
          return _adminKeypair;
        }

        // Try ADMIN_KEYPAIR_PATH (file path)
        if (process.env.ADMIN_KEYPAIR_PATH) {
          // Dynamic import for server-side only
          const fs = require('fs');
          const keypairData = JSON.parse(fs.readFileSync(process.env.ADMIN_KEYPAIR_PATH, 'utf-8'));
          _adminKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
          return _adminKeypair;
        }

        _adminKeypair = null;
        return null;
      } catch (error) {
        console.error('Failed to load admin keypair:', error);
        _adminKeypair = null;
        return null;
      }
    },
  };

  return _config;
}

// Helper function to check admin status including database role
// Use this in API routes - checks both env config and AdminRole collection
export async function checkAdminStatus(
  wallet: string | null | undefined,
  options?: {
    userFromDb?: { role?: string } | null;
    checkDatabase?: boolean;
  }
): Promise<{
  isAdmin: boolean;
  isSuperAdmin: boolean;
  role: string | null;
  permissions: Record<string, boolean> | null;
}> {
  const config = getAdminConfig();

  if (!wallet) {
    return { isAdmin: false, isSuperAdmin: false, role: null, permissions: null };
  }

  // Check env-based admin lists first (highest priority)
  const isEnvSuperAdmin = config.isSuperAdmin(wallet);
  const isEnvAdmin = config.isAdmin(wallet);

  if (isEnvSuperAdmin) {
    return {
      isAdmin: true,
      isSuperAdmin: true,
      role: 'super_admin',
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
    };
  }

  // Check database AdminRole if requested
  if (options?.checkDatabase !== false) {
    try {
      // Dynamic import to avoid circular dependencies
      const AdminRole = (await import('../models/AdminRole')).default;
      const dbAdmin = await AdminRole.findOne({ wallet, isActive: true });

      if (dbAdmin) {
        return {
          isAdmin: true,
          isSuperAdmin: dbAdmin.role === 'super_admin',
          role: dbAdmin.role,
          permissions: dbAdmin.permissions,
        };
      }
    } catch (error) {
      // Database not connected or model not available, fall through to other checks
      console.warn('Could not check AdminRole database:', error);
    }
  }

  // Check User model role (legacy support)
  const isDbAdmin = options?.userFromDb?.role === 'admin';

  // Check env admin (non-super)
  if (isEnvAdmin || isDbAdmin) {
    return {
      isAdmin: true,
      isSuperAdmin: false,
      role: 'admin',
      permissions: {
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
      },
    };
  }

  return { isAdmin: false, isSuperAdmin: false, role: null, permissions: null };
}

// Default export for convenience
export default getAdminConfig;
