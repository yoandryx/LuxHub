// src/pages/api/users/luxury-assistant.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/database/mongodb';
import { User } from '@/lib/models/User';
import { Vendor } from '@/lib/models/Vendor';
import { Offer } from '@/lib/models/Offer';
import { Escrow } from '@/lib/models/Escrow';
import { Pool } from '@/lib/models/Pool';

// Type definitions for database documents
interface UserDoc {
  _id: string;
  role?: string;
  wallet?: string;
}

interface VendorDoc {
  _id: string;
  businessName?: string;
  verified?: boolean;
  salesSummary?: {
    totalSales?: number;
  };
}

interface UserContext {
  role: 'buyer' | 'vendor' | 'admin' | 'guest';
  wallet: string | null;
  vendorInfo?: {
    businessName: string;
    verified: boolean;
    totalSales: number;
    pendingOffers: number;
  };
  buyerInfo?: {
    activeOffers: number;
    poolInvestments: number;
  };
  marketSnapshot?: {
    trendingItems: { name: string; offers: number; price: number }[];
    recentActivity: string;
  };
}

async function getUserContext(wallet: string | null): Promise<UserContext> {
  if (!wallet) {
    return { role: 'guest', wallet: null };
  }

  await connectDB();

  // Check if user is admin
  const user = (await User.findOne({ wallet }).lean()) as UserDoc | null;
  if (user?.role === 'admin') {
    const pendingShipments = await Escrow.countDocuments({ status: 'shipped' });
    return {
      role: 'admin',
      wallet,
      marketSnapshot: {
        trendingItems: [],
        recentActivity: `${pendingShipments} shipments pending verification`,
      },
    };
  }

  // Check if user is vendor
  const vendor = (await Vendor.findOne({ user: user?._id }).lean()) as VendorDoc | null;
  if (vendor) {
    const pendingOffers = await Offer.countDocuments({
      vendorWallet: wallet,
      status: 'pending',
    });
    return {
      role: 'vendor',
      wallet,
      vendorInfo: {
        businessName: vendor.businessName || 'Your Store',
        verified: vendor.verified || false,
        totalSales: vendor.salesSummary?.totalSales || 0,
        pendingOffers,
      },
    };
  }

  // Default: buyer
  const activeOffers = await Offer.countDocuments({
    buyerWallet: wallet,
    status: { $in: ['pending', 'countered'] },
  });
  const poolInvestments = await Pool.countDocuments({
    'participants.wallet': wallet,
  });

  // Get trending items for buyers
  const trendingEscrows = await Escrow.find({ status: 'active' })
    .sort({ activeOfferCount: -1 })
    .limit(3)
    .populate('asset', 'model priceUSD')
    .lean();

  const trendingItems = trendingEscrows.map((e: any) => ({
    name: e.asset?.model || 'Unknown',
    offers: e.activeOfferCount || 0,
    price: e.asset?.priceUSD || 0,
  }));

  return {
    role: 'buyer',
    wallet,
    buyerInfo: {
      activeOffers,
      poolInvestments,
    },
    marketSnapshot: {
      trendingItems,
      recentActivity: `${activeOffers} active offers`,
    },
  };
}

function buildSystemPrompt(context: UserContext): string {
  const basePrompt = `You are Luxury, LuxHub's AI concierge — a premium NFT marketplace for luxury watches, jewelry, and collectibles on Solana.

CORE KNOWLEDGE:
- NFTs represent physical luxury items with verified provenance
- Escrow system protects both buyers and sellers
- 5% platform fee on sales (3% royalty to treasury)
- Fractional ownership pools allow shared investment
- Squads Protocol multisig secures treasury operations

TONE: Professional, knowledgeable, concise. Like a luxury concierge at a high-end boutique.`;

  if (context.role === 'guest') {
    return `${basePrompt}

USER CONTEXT: Guest (wallet not connected)
- Guide them to connect wallet first
- Explain marketplace benefits
- Answer general questions about luxury NFTs and the platform`;
  }

  if (context.role === 'admin') {
    return `${basePrompt}

USER CONTEXT: Platform Administrator
${context.marketSnapshot?.recentActivity ? `- Current status: ${context.marketSnapshot.recentActivity}` : ''}

ADMIN CAPABILITIES:
- Verify shipments and release escrow funds
- Approve/reject vendor applications
- Manage pool lifecycles (open → filled → custody → distribution)
- Create Squads multisig proposals for treasury operations
- Monitor platform analytics and compliance

Help with: shipment verification, vendor management, pool administration, compliance checks.`;
  }

  if (context.role === 'vendor' && context.vendorInfo) {
    return `${basePrompt}

USER CONTEXT: Vendor - ${context.vendorInfo.businessName}
- Verification: ${context.vendorInfo.verified ? 'Verified ✓' : 'Pending verification'}
- Total sales: ${context.vendorInfo.totalSales}
- Pending offers: ${context.vendorInfo.pendingOffers}

VENDOR CAPABILITIES:
- List luxury items as NFTs (mint → request listing → escrow)
- Receive and respond to offers (accept, counter, reject)
- Track shipments and update tracking info
- View earnings and analytics
- Convert direct sales to fractional pools

Help with: pricing strategy, offer negotiation, shipment management, listing optimization.`;
  }

  // Buyer context
  const trendingInfo = context.marketSnapshot?.trendingItems?.length
    ? `Trending items: ${context.marketSnapshot.trendingItems.map((t) => `${t.name} (${t.offers} offers)`).join(', ')}`
    : '';

  return `${basePrompt}

USER CONTEXT: Buyer
${context.buyerInfo ? `- Active offers: ${context.buyerInfo.activeOffers}` : ''}
${context.buyerInfo ? `- Pool investments: ${context.buyerInfo.poolInvestments}` : ''}
${trendingInfo}

BUYER CAPABILITIES:
- Browse verified luxury NFTs
- Make offers on items (direct purchase or negotiation)
- Invest in fractional ownership pools
- Track purchases and shipments
- View collection and transaction history

Help with: finding items, making smart offers, understanding pool investments, tracking orders.`;
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, wallet, conversationHistory } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required and must be a string.' });
  }

  try {
    // Get user context based on wallet
    const context = await getUserContext(wallet || null);
    const systemPrompt = buildSystemPrompt(context);

    // Build messages array with conversation history
    const messages: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history (last 10 messages for context window efficiency)
    if (Array.isArray(conversationHistory)) {
      const recentHistory = conversationHistory.slice(-10);
      recentHistory.forEach((msg: { sender: string; text: string }) => {
        messages.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text,
        });
      });
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15 sec timeout

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'grok-3-latest',
        messages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    clearTimeout(timeout);

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(502).json({ error: 'No response from assistant.' });
    }

    // Return reply with context info for UI
    res.status(200).json({
      reply,
      context: {
        role: context.role,
        wallet: context.wallet,
      },
    });
  } catch (error: any) {
    console.error('Luxury Assistant API error:', error.message || error);
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out. Please try again.' });
    }
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

export default handler;
