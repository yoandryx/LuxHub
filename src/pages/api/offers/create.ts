// src/pages/api/offers/create.ts
// Buyer creates an offer on an escrow listing
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Offer } from '../../../lib/models/Offer';
import { User } from '../../../lib/models/User';
import { Vendor } from '../../../lib/models/Vendor';
import { Asset } from '../../../lib/models/Assets';
import { Transaction } from '../../../lib/models/Transaction';
import { notifyOfferReceived } from '../../../lib/services/notificationService';

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

    // Fetch live SOL price for lamport conversion
    let solPrice = 100;
    try {
      const priceRes = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/price/sol`
      );
      if (priceRes.ok) {
        const pd = await priceRes.json();
        if (pd?.solana?.usd > 0) solPrice = pd.solana.usd;
      }
    } catch {
      /* ignore */
    }
    const offerAmount = rawOfferAmount || Math.floor((offerPriceUSD / solPrice) * 1e9);

    // If no escrow found, check if this is a "holding" NFT open to offers
    let ownerWallet: string | undefined;
    let assetForOffer: any = null;
    if (!escrow && mintAddress) {
      assetForOffer = await Asset.findOne({ nftMint: mintAddress, deleted: false });
      if (!assetForOffer) {
        return res.status(404).json({ error: 'Asset not found' });
      }
      if (!assetForOffer.openToOffers) {
        return res.status(400).json({ error: 'This holder is not accepting offers on this asset' });
      }
      ownerWallet = assetForOffer.vendorWallet || assetForOffer.currentOwner;
      if (!ownerWallet) {
        return res.status(400).json({ error: 'Cannot determine asset owner' });
      }
      if (ownerWallet === buyerWallet) {
        return res.status(400).json({ error: 'You cannot make an offer on your own asset' });
      }
    } else if (!escrow) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Validate escrow state (only if escrow exists — skip for holding offers)
    if (escrow) {
      if (!escrow.acceptingOffers && escrow.saleMode !== 'accepting_offers') {
        return res.status(400).json({
          error: 'This listing is not accepting offers',
        });
      }

      const allowedStatuses = ['initiated', 'listed'];
      if (!allowedStatuses.includes(escrow.status)) {
        return res.status(400).json({
          error: `Cannot make offers when status is '${escrow.status}'`,
        });
      }

      // Platform minimum: 50% of listing price (prevents spam lowballs)
      const platformMinUSD = (escrow.listingPriceUSD || 0) * 0.5;
      const effectiveMinUSD = Math.max(platformMinUSD, escrow.minimumOfferUSD || 0);

      if (offerPriceUSD < effectiveMinUSD) {
        return res.status(400).json({
          error: `Minimum offer is $${effectiveMinUSD.toLocaleString()} (50% of listing price)`,
          minimumOfferUSD: effectiveMinUSD,
          listingPriceUSD: escrow.listingPriceUSD,
        });
      }

      if (escrow.sellerWallet === buyerWallet) {
        return res.status(400).json({
          error: 'Seller cannot make an offer on their own listing',
        });
      }
    }

    // Get or create buyer user (using upsert for efficiency)
    const buyerUser = await User.findOneAndUpdate(
      { wallet: buyerWallet },
      { $setOnInsert: { wallet: buyerWallet, role: 'user' } },
      { upsert: true, new: true }
    );

    // Determine escrowPda and asset — handles both listed and holding offers
    const actualEscrowPda = escrow?.escrowPda || `holding-${mintAddress}-${Date.now()}`;
    const vendorWallet = escrow?.sellerWallet || ownerWallet;

    // Resolve vendor ID — try populated seller, then lookup by wallet
    let toVendorId = escrow?.seller?._id || escrow?.seller || null;
    if (!toVendorId && vendorWallet) {
      const vendorUser = await User.findOne({ wallet: vendorWallet });
      if (vendorUser) {
        const vendorDoc = await Vendor.findOne({ user: vendorUser._id });
        if (vendorDoc) toVendorId = vendorDoc._id;
      }
    }

    // Run independent queries in parallel
    const [existingOffer, asset] = await Promise.all([
      Offer.findOne({
        $or: [
          { escrowPda: actualEscrowPda, buyerWallet },
          ...(mintAddress ? [{ mintAddress, buyerWallet }] : []),
        ],
        status: { $in: ['pending', 'countered'] },
        deleted: false,
      }),
      escrow ? Asset.findById(escrow.asset) : Promise.resolve(assetForOffer),
    ]);

    if (existingOffer) {
      return res.status(400).json({
        error: 'You already have a pending offer on this asset',
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
      asset: escrow?.asset || assetForOffer?._id,
      escrowId: escrow?._id,
      escrowPda: actualEscrowPda,
      mintAddress: mintAddress || escrow?.nftMint,
      offerType: escrow ? 'listing' : 'holding', // Track whether this is a listed or holding offer
      fromUser: buyerUser._id,
      buyerWallet,
      toVendor: toVendorId,
      vendorWallet,
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

    // Update escrow offer tracking (only if escrow exists)
    if (escrow) {
      await Escrow.findByIdAndUpdate(escrow._id, {
        $set: {
          activeOfferCount: pendingOfferCount,
          highestOffer: highestOffer?.offerAmount,
        },
      });
    }

    // Record transaction for the offer
    Transaction.create({
      type: 'offer_acceptance',
      escrow: escrow?._id,
      asset: escrow?.asset || assetForOffer?._id,
      fromWallet: buyerWallet,
      toWallet: vendorWallet,
      amountUSD: offerPriceUSD,
      status: 'pending',
    }).catch((err: any) => console.error('[offers/create] Transaction.create error:', err));

    // Notify owner/vendor of new offer (non-blocking)
    const assetTitle = asset?.model || 'Luxury Asset';
    if (vendorWallet) {
      notifyOfferReceived({
        vendorWallet,
        buyerWallet,
        offerId: offer._id.toString(),
        escrowId: escrow?._id?.toString() || assetForOffer?._id?.toString() || '',
        assetTitle,
        offerAmountUSD: offerPriceUSD,
      }).catch((err: any) => console.error('[offers/create] notifyOfferReceived error:', err));
    }

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
