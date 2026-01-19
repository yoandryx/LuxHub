// src/pages/api/offers/respond.ts
// Vendor responds to an offer (accept, reject, or counter)
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Offer } from '../../../lib/models/Offer';
import { Vendor } from '../../../lib/models/Vendor';
import { User } from '../../../lib/models/User';

interface RespondOfferRequest {
  offerId: string;
  vendorWallet: string;
  action: 'accept' | 'reject' | 'counter';
  rejectionReason?: string;
  counterAmount?: number; // In lamports (for counter)
  counterAmountUSD?: number;
  counterMessage?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

    if (action === 'counter' && (!counterAmount || !counterAmountUSD)) {
      return res.status(400).json({
        error: 'counterAmount and counterAmountUSD are required for counter offers',
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

        // Reject all other pending offers on this escrow
        await Offer.updateMany(
          {
            escrowPda: escrow.escrowPda,
            _id: { $ne: offerId },
            status: { $in: ['pending', 'countered'] },
          },
          {
            $set: {
              status: 'auto_rejected',
              autoRejectedReason: 'Another offer was accepted',
              respondedAt: new Date(),
            },
          }
        );

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
        // Add counter offer to history
        const counterOffer = {
          amount: counterAmount!,
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
            amount: counterAmount,
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
