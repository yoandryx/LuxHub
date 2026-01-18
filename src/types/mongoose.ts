// Shared Mongoose document types for lean() queries

export interface LeanDocument {
  _id: unknown;
  __v?: number;
  [key: string]: unknown;
}

export interface UserDocument extends LeanDocument {
  wallet?: string;
  email?: string;
  role?: string;
}

export interface VendorDocument extends LeanDocument {
  user?: unknown;
  businessName?: string;
  status?: string;
}

export interface AssetDocument extends LeanDocument {
  vendor?: unknown;
  deleted?: boolean;
  status?: string;
  nftMint?: string;
  priceUSD?: number;
}

export interface NFTDocument extends LeanDocument {
  mint?: string;
  owner?: string;
  asset?: unknown;
}

export interface TransactionDocument extends LeanDocument {
  buyer?: unknown;
  seller?: unknown;
  nft?: unknown;
  status?: string;
}

export interface OfferDocument extends LeanDocument {
  buyer?: unknown;
  vendor?: unknown;
  asset?: unknown;
  status?: string;
}

export interface OrderDocument extends LeanDocument {
  buyer?: unknown;
  vendor?: unknown;
  status?: string;
}

export interface PayoutDocument extends LeanDocument {
  vendor?: unknown;
  amount?: number;
  status?: string;
}
