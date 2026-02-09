// src/pages/api/offers/buyer-respond.ts
// Buyer responds to a vendor's counter-offer or withdraws their own offer
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Offer } from '../../../lib/models/Offer';

interface BuyerRespondRequest {
  offerId: string;
  buyerWallet: string;
  action: 'accept_counter' | 'reject_counter' | 'counter' | 'withdraw';
  counterAmountUSD?: number;
  counterMessage?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { offerId, buyerWallet, action, counterAmountUSD, counterMessage } =
      req.body as BuyerRespondRequest;

    // Validation
    if (!offerId || !buyerWallet || !action) {
      return res.status(400).json({
        error: 'Missing required fields: offerId, buyerWallet, action',
      });
    }

    const validActions = ['accept_counter', 'reject_counter', 'counter', 'withdraw'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        error: `Invalid action. Must be: ${validActions.join(', ')}`,
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

    // Verify buyer ownership
    if (offer.buyerWallet !== buyerWallet) {
      return res.status(403).json({ error: 'Not authorized - wallet does not match offer buyer' });
    }

    // Status validation per action
    if (action === 'withdraw') {
      if (!['pending', 'countered'].includes(offer.status)) {
        return res.status(400).json({
          error: `Cannot withdraw offer with status '${offer.status}'. Must be pending or countered.`,
        });
      }
    } else {
      // accept_counter, reject_counter, counter all require 'countered' status
      if (offer.status !== 'countered') {
        return res.status(400).json({
          error: `Cannot ${action.replace('_', ' ')} - offer status is '${offer.status}', expected 'countered'.`,
        });
      }
    }

    // Verify escrow exists and is active
    const escrow = await Escrow.findById(offer.escrowId);
    if (!escrow || escrow.deleted) {
      return res.status(404).json({ error: 'Associated escrow not found' });
    }

    switch (action) {
      case 'accept_counter': {
        // Get the latest counter-offer amount
        const latestCounter =
          offer.counterOffers?.length > 0
            ? offer.counterOffers[offer.counterOffers.length - 1]
            : null;

        const acceptedAmountUSD = latestCounter?.amountUSD || offer.offerPriceUSD;
        const acceptedAmountLamports = latestCounter?.amount || offer.offerAmount;

        // Accept the counter-offer
        await Offer.findByIdAndUpdate(offerId, {
          $set: {
            status: 'accepted',
            respondedAt: new Date(),
            respondedBy: buyerWallet,
          },
        });

        // Update escrow to reflect accepted offer
        await Escrow.findByIdAndUpdate(escrow._id, {
          $set: {
            status: 'offer_accepted',
            acceptedOfferId: offer._id,
            amountUSD: acceptedAmountUSD,
            listingPrice: acceptedAmountLamports,
            listingPriceUSD: acceptedAmountUSD,
          },
        });

        // Auto-reject other pending offers
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
          action: 'accept_counter',
          offer: {
            _id: offer._id,
            status: 'accepted',
            acceptedAmountUSD,
          },
          escrow: {
            _id: escrow._id,
            escrowPda: escrow.escrowPda,
            status: 'offer_accepted',
          },
          message: 'Counter-offer accepted. You can now deposit funds to the escrow.',
          nextStep: 'Deposit funds via the Buy flow',
        });
      }

      case 'reject_counter': {
        await Offer.findByIdAndUpdate(offerId, {
          $set: {
            status: 'rejected',
            respondedAt: new Date(),
            respondedBy: buyerWallet,
          },
        });

        // Update escrow offer counts
        const pendingOfferCount = await Offer.countDocuments({
          escrowPda: escrow.escrowPda,
          status: { $in: ['pending', 'countered'] },
          deleted: false,
        });

        await Escrow.findByIdAndUpdate(escrow._id, {
          $set: { activeOfferCount: Math.max(0, pendingOfferCount - 1) },
        });

        return res.status(200).json({
          success: true,
          action: 'reject_counter',
          offer: {
            _id: offer._id,
            status: 'rejected',
          },
          message: 'Counter-offer rejected.',
        });
      }

      case 'counter': {
        // Calculate lamports from USD (use SOL price ~$150 as fallback)
        const solPrice = 150;
        const counterAmountLamports = Math.floor((counterAmountUSD! / solPrice) * 1e9);

        const counterOffer = {
          amount: counterAmountLamports,
          amountUSD: counterAmountUSD!,
          from: buyerWallet,
          fromType: 'buyer',
          message: counterMessage,
          at: new Date(),
        };

        await Offer.findByIdAndUpdate(offerId, {
          $set: {
            status: 'countered',
            respondedAt: new Date(),
            respondedBy: buyerWallet,
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
            amount: counterAmountLamports,
            amountUSD: counterAmountUSD,
            message: counterMessage,
          },
          message: 'Counter-offer submitted. Awaiting vendor response.',
        });
      }

      case 'withdraw': {
        await Offer.findByIdAndUpdate(offerId, {
          $set: {
            status: 'withdrawn',
            respondedAt: new Date(),
            respondedBy: buyerWallet,
          },
        });

        // Update escrow offer counts
        const pendingCount = await Offer.countDocuments({
          escrowPda: escrow.escrowPda,
          status: { $in: ['pending', 'countered'] },
          deleted: false,
        });

        const highestRemaining = await Offer.findOne({
          escrowPda: escrow.escrowPda,
          status: { $in: ['pending', 'countered'] },
          deleted: false,
        }).sort({ offerAmount: -1 });

        await Escrow.findByIdAndUpdate(escrow._id, {
          $set: {
            activeOfferCount: pendingCount,
            highestOffer: highestRemaining?.offerAmount || null,
          },
        });

        return res.status(200).json({
          success: true,
          action: 'withdrawn',
          offer: {
            _id: offer._id,
            status: 'withdrawn',
          },
          message: 'Offer withdrawn successfully.',
        });
      }
    }
  } catch (error: any) {
    console.error('[/api/offers/buyer-respond] Error:', error);
    return res.status(500).json({
      error: 'Failed to process buyer response',
      details: error?.message || 'Unknown error',
    });
  }
}
