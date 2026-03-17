// src/pages/api/offers/buyer-respond.ts
// Buyer responds to a vendor's counter-offer or withdraws their own offer
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Offer } from '../../../lib/models/Offer';
import { Asset } from '../../../lib/models/Assets';
import { Transaction } from '../../../lib/models/Transaction';
import {
  notifyUser,
  notifyOfferAccepted,
  notifyOfferCountered,
} from '../../../lib/services/notificationService';

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
      if (!['pending', 'countered', 'accepted'].includes(offer.status)) {
        return res.status(400).json({
          error: `Cannot withdraw offer with status '${offer.status}'. Must be pending, countered, or accepted.`,
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

    // Fetch asset title for notifications
    const asset = escrow.asset ? await Asset.findById(escrow.asset) : null;
    const assetTitle = asset?.model || 'Luxury Asset';

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

        // Record transaction for counter-offer acceptance
        Transaction.create({
          type: 'negotiation_settlement',
          escrow: escrow._id,
          asset: escrow.asset,
          fromWallet: buyerWallet,
          toWallet: escrow.sellerWallet,
          amountUSD: acceptedAmountUSD,
          status: 'success',
        }).catch((err: any) => console.error('[buyer-respond] Transaction.create error:', err));

        // Notify vendor that buyer accepted their counter (non-blocking)
        notifyOfferAccepted({
          buyerWallet: escrow.sellerWallet, // notify the vendor
          offerId: offer._id.toString(),
          escrowId: escrow._id.toString(),
          escrowPda: escrow.escrowPda,
          assetTitle,
          acceptedAmountUSD,
        }).catch((err: any) => console.error('[buyer-respond] notifyOfferAccepted error:', err));

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

        // Notify vendor that buyer rejected their counter (non-blocking)
        notifyUser({
          userWallet: escrow.sellerWallet,
          type: 'offer_rejected',
          title: 'Counter-Offer Rejected',
          message: `The buyer rejected your counter-offer for "${assetTitle}".`,
          metadata: {
            offerId: offer._id.toString(),
            escrowId: escrow._id.toString(),
            escrowPda: escrow.escrowPda,
            actionUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold'}/vendor/offers`,
          },
        }).catch((err: any) =>
          console.error('[buyer-respond] notifyUser reject_counter error:', err)
        );

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
        // Calculate lamports from USD with live SOL price
        let solPrice = 100;
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

        // Record transaction for buyer counter
        Transaction.create({
          type: 'negotiation_settlement',
          escrow: escrow._id,
          asset: escrow.asset,
          fromWallet: buyerWallet,
          toWallet: escrow.sellerWallet,
          amountUSD: counterAmountUSD,
          status: 'pending',
        }).catch((err: any) => console.error('[buyer-respond] Transaction.create error:', err));

        // Notify vendor of buyer's counter (non-blocking)
        notifyOfferCountered({
          buyerWallet: escrow.sellerWallet, // notify the vendor
          offerId: offer._id.toString(),
          escrowId: escrow._id.toString(),
          escrowPda: escrow.escrowPda,
          assetTitle,
          counterAmountUSD: counterAmountUSD!,
        }).catch((err: any) => console.error('[buyer-respond] notifyOfferCountered error:', err));

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
        const wasAccepted = offer.status === 'accepted';

        await Offer.findByIdAndUpdate(offerId, {
          $set: {
            status: 'withdrawn',
            respondedAt: new Date(),
            respondedBy: buyerWallet,
          },
        });

        // If this was the accepted offer, revert escrow back to listed so vendor can accept others
        if (wasAccepted && escrow.status === 'offer_accepted') {
          await Escrow.findByIdAndUpdate(escrow._id, {
            $set: {
              status: 'listed',
              acceptedOfferId: null,
            },
          });
        }

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

        // Notify vendor
        const withdrawTitle = wasAccepted ? 'Accepted Offer Withdrawn' : 'Offer Withdrawn';
        const withdrawMessage = wasAccepted
          ? `The buyer withdrew their accepted offer of $${offer.offerPriceUSD.toFixed(2)} USD for "${assetTitle}". Your listing is active again — you can accept another offer.`
          : `A buyer withdrew their offer of $${offer.offerPriceUSD.toFixed(2)} USD for "${assetTitle}".`;

        notifyUser({
          userWallet: escrow.sellerWallet,
          type: 'offer_rejected',
          title: withdrawTitle,
          message: withdrawMessage,
          metadata: {
            offerId: offer._id.toString(),
            escrowId: escrow._id.toString(),
            escrowPda: escrow.escrowPda,
            actionUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold'}/vendor/vendorDashboard?tab=offers`,
          },
        }).catch((err: any) => console.error('[buyer-respond] notifyUser withdraw error:', err));

        return res.status(200).json({
          success: true,
          action: 'withdrawn',
          offer: {
            _id: offer._id,
            status: 'withdrawn',
          },
          message: wasAccepted
            ? 'Offer withdrawn. The listing is active again for other offers.'
            : 'Offer withdrawn successfully.',
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
