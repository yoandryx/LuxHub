// src/pages/api/offers/respond.ts
// Vendor responds to an offer (accept, reject, or counter)
import type { NextApiRequest, NextApiResponse } from 'next';
import { withErrorMonitoring } from '../../../lib/monitoring/errorHandler';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Offer } from '../../../lib/models/Offer';
import { Vendor } from '../../../lib/models/Vendor';
import { User } from '../../../lib/models/User';
import { Asset } from '../../../lib/models/Assets';
import { Transaction } from '../../../lib/models/Transaction';
import {
  notifyOfferAccepted,
  notifyOfferRejected,
  notifyOfferCountered,
} from '../../../lib/services/notificationService';

interface RespondOfferRequest {
  offerId: string;
  vendorWallet: string;
  action: 'accept' | 'reject' | 'counter';
  rejectionReason?: string;
  counterAmount?: number; // In lamports (for counter)
  counterAmountUSD?: number;
  counterMessage?: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      offerId,
      vendorWallet,
      action,
      rejectionReason,
      counterAmount,
      counterAmountUSD,
      counterMessage,
    } = req.body as RespondOfferRequest;

    // Validation
    if (!offerId || !vendorWallet || !action) {
      return res.status(400).json({
        error: 'Missing required fields: offerId, vendorWallet, action',
      });
    }

    if (!['accept', 'reject', 'counter'].includes(action)) {
      return res.status(400).json({
        error: 'Invalid action. Must be: accept, reject, or counter',
      });
    }

    if (action === 'reject' && !rejectionReason) {
      return res.status(400).json({
        error: 'rejectionReason is required when rejecting an offer',
      });
    }

    if (action === 'counter' && !counterAmountUSD) {
      return res.status(400).json({
        error: 'counterAmountUSD is required for counter offers',
      });
    }

    await dbConnect();

    // Find the offer
    const offer = await Offer.findById(offerId);
    if (!offer || offer.deleted) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    // Check offer status
    if (!['pending', 'countered'].includes(offer.status)) {
      return res.status(400).json({
        error: `Cannot respond to offer with status '${offer.status}'`,
      });
    }

    // Verify vendor ownership
    const user = await User.findOne({ wallet: vendorWallet });
    if (!user) {
      return res.status(403).json({ error: 'User not found' });
    }

    const vendor = await Vendor.findOne({ user: user._id });
    if (!vendor) {
      return res.status(403).json({ error: 'Vendor not found' });
    }

    // Check if this vendor owns the escrow
    const escrow = await Escrow.findById(offer.escrowId);
    if (!escrow) {
      return res.status(404).json({ error: 'Associated escrow not found' });
    }

    if (
      escrow.sellerWallet !== vendorWallet &&
      escrow.seller?.toString() !== vendor._id.toString()
    ) {
      return res.status(403).json({ error: 'Not authorized to respond to this offer' });
    }

    // Fetch asset title for notifications
    const asset = escrow.asset ? await Asset.findById(escrow.asset) : null;
    const assetTitle = asset?.model || 'Luxury Asset';

    // Handle each action
    switch (action) {
      case 'accept': {
        // Accept the offer
        await Offer.findByIdAndUpdate(offerId, {
          $set: {
            status: 'accepted',
            respondedAt: new Date(),
            respondedBy: vendorWallet,
          },
        });

        // Update escrow to reflect accepted offer
        await Escrow.findByIdAndUpdate(escrow._id, {
          $set: {
            status: 'offer_accepted',
            acceptedOfferId: offer._id,
            amountUSD: offer.offerPriceUSD,
            listingPrice: offer.offerAmount,
            listingPriceUSD: offer.offerPriceUSD,
          },
        });

        // Other offers stay active — they only close when:
        // 1. Buyer deposits funds (deal closes, others auto-rejected in purchase endpoint)
        // 2. Accepted offer expires (24h timeout, escrow reverts to listed)
        // 3. Buyer withdraws the accepted offer

        // Set payment deadline on the accepted offer (24 hours)
        const paymentDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await Offer.findByIdAndUpdate(offerId, {
          $set: { paymentDeadline },
        });

        // Record transaction for accepted offer
        Transaction.create({
          type: 'offer_acceptance',
          escrow: escrow._id,
          asset: escrow.asset,
          fromWallet: offer.buyerWallet,
          toWallet: vendorWallet,
          amountUSD: offer.offerPriceUSD,
          status: 'success',
        }).catch((err: any) => console.error('[offers/respond] Transaction.create error:', err));

        // Notify buyer that their offer was accepted (non-blocking)
        notifyOfferAccepted({
          buyerWallet: offer.buyerWallet,
          offerId: offer._id.toString(),
          escrowId: escrow._id.toString(),
          escrowPda: escrow.escrowPda,
          assetTitle,
          acceptedAmountUSD: offer.offerPriceUSD,
        }).catch((err: any) => console.error('[offers/respond] notifyOfferAccepted error:', err));

        return res.status(200).json({
          success: true,
          action: 'accepted',
          offer: {
            _id: offer._id,
            status: 'accepted',
            offerPriceUSD: offer.offerPriceUSD,
            buyerWallet: offer.buyerWallet,
          },
          escrow: {
            _id: escrow._id,
            escrowPda: escrow.escrowPda,
            status: 'offer_accepted',
          },
          message: 'Offer accepted. Buyer should now deposit funds to the escrow.',
          nextStep: 'Buyer deposits funds via /api/escrow/deposit',
        });
      }

      case 'reject': {
        // Reject the offer
        await Offer.findByIdAndUpdate(offerId, {
          $set: {
            status: 'rejected',
            respondedAt: new Date(),
            respondedBy: vendorWallet,
            rejectionReason,
          },
        });

        // Update escrow offer count
        const pendingOfferCount = await Offer.countDocuments({
          escrowPda: escrow.escrowPda,
          status: { $in: ['pending', 'countered'] },
          deleted: false,
        });

        const highestOffer = await Offer.findOne({
          escrowPda: escrow.escrowPda,
          status: { $in: ['pending', 'countered'] },
          deleted: false,
        }).sort({ offerAmount: -1 });

        await Escrow.findByIdAndUpdate(escrow._id, {
          $set: {
            activeOfferCount: pendingOfferCount,
            highestOffer: highestOffer?.offerAmount || null,
          },
        });

        // Notify buyer that their offer was rejected (non-blocking)
        notifyOfferRejected({
          buyerWallet: offer.buyerWallet,
          offerId: offer._id.toString(),
          escrowId: escrow._id.toString(),
          assetTitle,
          reason: rejectionReason,
        }).catch((err: any) => console.error('[offers/respond] notifyOfferRejected error:', err));

        return res.status(200).json({
          success: true,
          action: 'rejected',
          offer: {
            _id: offer._id,
            status: 'rejected',
            rejectionReason,
          },
          message: 'Offer rejected.',
        });
      }

      case 'counter': {
        // Calculate counterAmount in lamports if not provided
        // Fetch live SOL price from our API (Pyth oracle)
        let solPrice = 100; // fallback
        try {
          const priceRes = await fetch(
            `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/price/sol`
          );
          if (priceRes.ok) {
            const priceData = await priceRes.json();
            if (priceData?.solana?.usd > 0) solPrice = priceData.solana.usd;
          }
        } catch {
          /* ignore */
        }
        const calculatedCounterAmount =
          counterAmount || Math.floor((counterAmountUSD! / solPrice) * 1e9);

        // Add counter offer to history
        const counterOffer = {
          amount: calculatedCounterAmount,
          amountUSD: counterAmountUSD!,
          from: vendorWallet,
          fromType: 'vendor',
          message: counterMessage,
          at: new Date(),
        };

        await Offer.findByIdAndUpdate(offerId, {
          $set: {
            status: 'countered',
            respondedAt: new Date(),
            respondedBy: vendorWallet,
          },
          $push: {
            counterOffers: counterOffer,
          },
        });

        // Record transaction for counter offer
        Transaction.create({
          type: 'negotiation_settlement',
          escrow: escrow._id,
          asset: escrow.asset,
          fromWallet: vendorWallet,
          toWallet: offer.buyerWallet,
          amountUSD: counterAmountUSD,
          status: 'pending',
        }).catch((err: any) => console.error('[offers/respond] Transaction.create error:', err));

        // Notify buyer of counter offer (non-blocking)
        notifyOfferCountered({
          buyerWallet: offer.buyerWallet,
          offerId: offer._id.toString(),
          escrowId: escrow._id.toString(),
          escrowPda: escrow.escrowPda,
          assetTitle,
          counterAmountUSD: counterAmountUSD!,
        }).catch((err: any) => console.error('[offers/respond] notifyOfferCountered error:', err));

        return res.status(200).json({
          success: true,
          action: 'countered',
          offer: {
            _id: offer._id,
            status: 'countered',
            originalOffer: offer.offerPriceUSD,
            counterOffer: counterAmountUSD,
          },
          counterOffer: {
            amount: calculatedCounterAmount,
            amountUSD: counterAmountUSD,
            message: counterMessage,
          },
          message: 'Counter offer submitted. Awaiting buyer response.',
          nextStep: 'Buyer can accept, reject, or counter via /api/offers/buyer-respond',
        });
      }
    }
  } catch (error: any) {
    console.error('[/api/offers/respond] Error:', error);
    return res.status(500).json({
      error: 'Failed to respond to offer',
      details: error?.message || 'Unknown error',
    });
  }
}

export default withErrorMonitoring(handler);
