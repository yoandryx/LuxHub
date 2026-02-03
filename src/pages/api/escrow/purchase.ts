// src/pages/api/escrow/purchase.ts
// Buyer initiates a direct purchase at the listed price
// Creates a pending purchase record and stores shipping address
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { User } from '../../../lib/models/User';
import { Asset } from '../../../lib/models/Assets';

interface ShippingAddress {
  fullName: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
  email?: string;
  deliveryInstructions?: string;
}

interface PurchaseRequest {
  escrowPda?: string;
  mintAddress?: string; // Alternative lookup by NFT mint
  buyerWallet: string;
  shippingAddress: ShippingAddress;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { escrowPda, mintAddress, buyerWallet, shippingAddress } = req.body as PurchaseRequest;

    // Validation
    if ((!escrowPda && !mintAddress) || !buyerWallet) {
      return res.status(400).json({
        error: 'Missing required fields: (escrowPda or mintAddress) and buyerWallet',
      });
    }

    // Validate shipping address
    if (!shippingAddress) {
      return res.status(400).json({
        error: 'Shipping address is required for purchase',
      });
    }

    const { fullName, street1, city, state, postalCode, country } = shippingAddress;
    if (!fullName || !street1 || !city || !state || !postalCode || !country) {
      return res.status(400).json({
        error:
          'Incomplete shipping address. Required: fullName, street1, city, state, postalCode, country',
      });
    }

    await dbConnect();

    // Find the escrow
    let escrow;
    if (escrowPda) {
      escrow = await Escrow.findOne({ escrowPda, deleted: false })
        .populate('seller')
        .populate('asset');
    } else if (mintAddress) {
      escrow = await Escrow.findOne({ nftMint: mintAddress, deleted: false })
        .populate('seller')
        .populate('asset');
    }

    if (!escrow) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Check escrow status - must be listed or initiated
    const allowedStatuses = ['initiated', 'listed'];
    if (!allowedStatuses.includes(escrow.status)) {
      return res.status(400).json({
        error: `Cannot purchase. Current status: ${escrow.status}`,
      });
    }

    // Prevent seller from buying their own listing
    if (escrow.sellerWallet === buyerWallet) {
      return res.status(400).json({
        error: 'Seller cannot purchase their own listing',
      });
    }

    // Check if there's already a pending purchase on this escrow
    if (escrow.buyerWallet && escrow.status === 'funded') {
      return res.status(400).json({
        error: 'This item already has a pending purchase',
      });
    }

    // Get or create buyer user
    const buyerUser = await User.findOneAndUpdate(
      { wallet: buyerWallet },
      { $setOnInsert: { wallet: buyerWallet, role: 'user' } },
      { upsert: true, new: true }
    );

    // Get asset info
    const asset = await Asset.findById(escrow.asset);

    // Update escrow with buyer info and shipping address
    const updatedEscrow = await Escrow.findByIdAndUpdate(
      escrow._id,
      {
        $set: {
          buyer: buyerUser._id,
          buyerWallet,
          buyerShippingAddress: {
            fullName: shippingAddress.fullName,
            street1: shippingAddress.street1,
            street2: shippingAddress.street2,
            city: shippingAddress.city,
            state: shippingAddress.state,
            postalCode: shippingAddress.postalCode,
            country: shippingAddress.country,
            phone: shippingAddress.phone,
            email: shippingAddress.email,
            deliveryInstructions: shippingAddress.deliveryInstructions,
          },
          status: 'funded', // Mark as funded/purchased
          fundedAt: new Date(),
          fundedAmount: escrow.listingPrice,
        },
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Purchase initiated successfully. Vendor will be notified to ship the item.',
      purchase: {
        escrowId: updatedEscrow._id,
        escrowPda: updatedEscrow.escrowPda,
        nftMint: updatedEscrow.nftMint,
        buyerWallet,
        sellerWallet: updatedEscrow.sellerWallet,
        amount: updatedEscrow.listingPrice,
        amountUSD: updatedEscrow.listingPriceUSD,
        status: updatedEscrow.status,
        shippingAddress: {
          fullName: shippingAddress.fullName,
          city: shippingAddress.city,
          state: shippingAddress.state,
          country: shippingAddress.country,
        },
      },
      asset: asset
        ? {
            title: asset.title || asset.model,
            brand: asset.brand,
            imageUrl: asset.imageUrl || asset.imageIpfsUrls?.[0],
          }
        : null,
      nextSteps: [
        'Vendor will review and ship the item',
        'You will receive tracking information once shipped',
        'Confirm delivery once you receive the item',
        'Funds will be released to vendor after confirmation',
      ],
    });
  } catch (error: any) {
    console.error('[/api/escrow/purchase] Error:', error);
    return res.status(500).json({
      error: 'Failed to process purchase',
      details: error?.message || 'Unknown error',
    });
  }
}
