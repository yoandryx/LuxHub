// src/pages/api/offers/create.ts
// Buyer creates an offer on an escrow listing
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Offer } from '../../../lib/models/Offer';
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

interface CreateOfferRequest {
  escrowPda?: string;
  mintAddress?: string; // Alternative to escrowPda - find by NFT mint
  buyerWallet: string;
  offerAmount?: number; // In lamports (optional if offerPriceUSD provided)
  offerPriceUSD: number;
  offerCurrency?: 'SOL' | 'USDC' | 'WSOL';
  message?: string; // Optional message to vendor
  expiresInHours?: number; // Optional expiration
  shippingAddress: ShippingAddress; // Required shipping address
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      escrowPda,
      mintAddress,
      buyerWallet,
      offerAmount: rawOfferAmount,
      offerPriceUSD,
      offerCurrency = 'SOL',
      message,
      expiresInHours,
      shippingAddress,
    } = req.body as CreateOfferRequest;

    // Validation
    if ((!escrowPda && !mintAddress) || !buyerWallet || !offerPriceUSD) {
      return res.status(400).json({
        error: 'Missing required fields: (escrowPda or mintAddress), buyerWallet, offerPriceUSD',
      });
    }

    // Validate shipping address
    if (!shippingAddress) {
      return res.status(400).json({
        error: 'Shipping address is required',
      });
    }

    const { fullName, street1, city, state, postalCode, country } = shippingAddress;
    if (!fullName || !street1 || !city || !state || !postalCode || !country) {
      return res.status(400).json({
        error:
          'Incomplete shipping address. Required: fullName, street1, city, state, postalCode, country',
      });
    }

    if (offerPriceUSD <= 0) {
      return res.status(400).json({
        error: 'Offer amount must be positive',
      });
    }

    await dbConnect();

    // Find the escrow by escrowPda or nftMint
    let escrow;
    if (escrowPda) {
      escrow = await Escrow.findOne({ escrowPda, deleted: false }).populate('seller');
    } else if (mintAddress) {
      escrow = await Escrow.findOne({ nftMint: mintAddress, deleted: false }).populate('seller');
    }

    // Calculate offerAmount in lamports if not provided (use SOL price ~$150)
    const solPrice = 150;
    const offerAmount = rawOfferAmount || Math.floor((offerPriceUSD / solPrice) * 1e9);
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

    // Get the actual escrowPda from the found escrow
    const actualEscrowPda = escrow.escrowPda;

    // Run independent queries in parallel
    const [existingOffer, asset] = await Promise.all([
      Offer.findOne({
        escrowPda: actualEscrowPda,
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

    // Create the offer with shipping address
    const offer = new Offer({
      asset: escrow.asset,
      escrowId: escrow._id,
      escrowPda: actualEscrowPda,
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
      shippingAddress: {
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
    });

    await offer.save();

    // Update escrow offer tracking - run queries in parallel
    const [pendingOfferCount, highestOffer] = await Promise.all([
      Offer.countDocuments({
        escrowPda: actualEscrowPda,
        status: { $in: ['pending', 'countered'] },
        deleted: false,
      }),
      Offer.findOne({
        escrowPda: actualEscrowPda,
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
        escrowPda: actualEscrowPda,
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
