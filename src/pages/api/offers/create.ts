// src/pages/api/offers/create.ts
// Buyer creates an offer on an escrow listing
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Offer } from '../../../lib/models/Offer';
import { User } from '../../../lib/models/User';
import { Asset } from '../../../lib/models/Assets';

interface CreateOfferRequest {
  escrowPda: string;
  buyerWallet: string;
  offerAmount: number; // In lamports
  offerPriceUSD: number;
  offerCurrency?: 'SOL' | 'USDC' | 'WSOL';
  message?: string; // Optional message to vendor
  expiresInHours?: number; // Optional expiration
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      escrowPda,
      buyerWallet,
      offerAmount,
      offerPriceUSD,
      offerCurrency = 'SOL',
      message,
      expiresInHours,
    } = req.body as CreateOfferRequest;

    // Validation
    if (!escrowPda || !buyerWallet || !offerAmount || !offerPriceUSD) {
      return res.status(400).json({
        error: 'Missing required fields: escrowPda, buyerWallet, offerAmount, offerPriceUSD',
      });
    }

    if (offerAmount <= 0 || offerPriceUSD <= 0) {
      return res.status(400).json({
        error: 'Offer amount must be positive',
      });
    }

    await dbConnect();

    // Find the escrow
    const escrow = await Escrow.findOne({ escrowPda, deleted: false }).populate('seller');
    if (!escrow) {
      return res.status(404).json({ error: 'Escrow not found' });
    }

    // Check if escrow is accepting offers
    if (!escrow.acceptingOffers && escrow.saleMode !== 'accepting_offers') {
      return res.status(400).json({
        error: 'This listing is not accepting offers. Sale mode: ' + escrow.saleMode,
      });
    }

    // Check if escrow is in a valid state for offers
    const allowedStatuses = ['initiated', 'listed'];
    if (!allowedStatuses.includes(escrow.status)) {
      return res.status(400).json({
        error: `Cannot make offers when escrow status is '${escrow.status}'`,
      });
    }

    // Check minimum offer if set
    if (escrow.minimumOffer && offerAmount < escrow.minimumOffer) {
      return res.status(400).json({
        error: `Offer must be at least ${escrow.minimumOffer} lamports (${escrow.minimumOfferUSD} USD)`,
        minimumOffer: escrow.minimumOffer,
        minimumOfferUSD: escrow.minimumOfferUSD,
      });
    }

    // Prevent buyer from being seller
    if (escrow.sellerWallet === buyerWallet) {
      return res.status(400).json({
        error: 'Seller cannot make an offer on their own listing',
      });
    }

    // Get or create buyer user (using upsert for efficiency)
    const buyerUser = await User.findOneAndUpdate(
      { wallet: buyerWallet },
      { $setOnInsert: { wallet: buyerWallet, role: 'user' } },
      { upsert: true, new: true }
    );

    // Run independent queries in parallel
    const [existingOffer, asset] = await Promise.all([
      Offer.findOne({
        escrowPda,
        buyerWallet,
        status: { $in: ['pending', 'countered'] },
        deleted: false,
      }),
      Asset.findById(escrow.asset),
    ]);

    if (existingOffer) {
      return res.status(400).json({
        error: 'You already have a pending offer on this listing',
        existingOfferId: existingOffer._id,
        existingOfferAmount: existingOffer.offerPriceUSD,
      });
    }

    // Calculate expiration if specified
    let expiresAt: Date | undefined;
    if (expiresInHours && expiresInHours > 0) {
      expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    }

    // Create the offer
    const offer = new Offer({
      asset: escrow.asset,
      escrowId: escrow._id,
      escrowPda,
      fromUser: buyerUser._id,
      buyerWallet,
      toVendor: escrow.seller?._id,
      vendorWallet: escrow.sellerWallet,
      offerAmount,
      offerPriceUSD,
      offerCurrency,
      message,
      status: 'pending',
      expiresAt,
    });

    await offer.save();

    // Update escrow offer tracking - run queries in parallel
    const [pendingOfferCount, highestOffer] = await Promise.all([
      Offer.countDocuments({
        escrowPda,
        status: { $in: ['pending', 'countered'] },
        deleted: false,
      }),
      Offer.findOne({
        escrowPda,
        status: { $in: ['pending', 'countered'] },
        deleted: false,
      }).sort({ offerAmount: -1 }),
    ]);

    await Escrow.findByIdAndUpdate(escrow._id, {
      $set: {
        activeOfferCount: pendingOfferCount,
        highestOffer: highestOffer?.offerAmount,
      },
    });

    return res.status(200).json({
      success: true,
      offer: {
        _id: offer._id,
        escrowPda,
        buyerWallet,
        offerAmount,
        offerPriceUSD,
        offerCurrency,
        status: offer.status,
        message,
        expiresAt,
        createdAt: offer.createdAt,
      },
      escrow: {
        listingPrice: escrow.listingPrice,
        listingPriceUSD: escrow.listingPriceUSD,
        activeOfferCount: pendingOfferCount,
        highestOffer: highestOffer?.offerAmount,
      },
      asset: asset
        ? {
            model: asset.model,
            imageUrl: asset.imageIpfsUrls?.[0] || asset.images?.[0],
          }
        : null,
      message: 'Offer submitted successfully. Awaiting vendor response.',
    });
  } catch (error: any) {
    console.error('[/api/offers/create] Error:', error);
    return res.status(500).json({
      error: 'Failed to create offer',
      details: error?.message || 'Unknown error',
    });
  }
}
