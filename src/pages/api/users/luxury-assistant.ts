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

  // Default: buyer - run independent queries in parallel
  const [activeOffers, poolInvestments, trendingEscrows] = await Promise.all([
    Offer.countDocuments({
      buyerWallet: wallet,
      status: { $in: ['pending', 'countered'] },
    }),
    Pool.countDocuments({
      'participants.wallet': wallet,
    }),
    Escrow.find({ status: 'active' })
      .sort({ activeOfferCount: -1 })
      .limit(3)
      .populate('asset', 'model priceUSD')
      .lean(),
  ]);

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

// Page-specific context for the AI
const pageContextMap: Record<string, string> = {
  home: 'The home page - help them explore the platform and get started.',
  marketplace: 'The marketplace - help them browse items, understand pricing, and make offers.',
  pools: 'The pools page - explain fractional ownership, ROI calculations, and pool lifecycles.',
  'nft-detail':
    'Viewing a specific item - help with pricing analysis, making offers, and authenticity.',
  'seller-dashboard':
    'The seller dashboard - help manage listings, respond to offers, and track shipments.',
  'admin-dashboard':
    'The admin dashboard - help with verifications, pool management, and compliance.',
  'my-offers':
    'The offers page - help understand offer statuses, counter-offers, and negotiations.',
  'create-nft': 'Creating a new NFT listing - help with photos, pricing, and the minting process.',
  profile: 'The profile page - help with account settings and transaction history.',
  'learn-more': 'The learn more page - provide comprehensive platform education.',
  other: 'General browsing - provide helpful navigation and platform information.',
};

function buildSystemPrompt(context: UserContext, currentPage?: string, pageLabel?: string): string {
  const basePrompt = `You are Luxury — LuxHub's personal AI concierge. LuxHub is a premium decentralized marketplace on Solana where physical luxury assets (watches, jewelry, collectibles) are tokenized as NFTs with verified provenance and secured by on-chain escrow.

PERSONALITY:
- Speak like a knowledgeable luxury concierge at a five-star boutique
- Confident, warm, refined — never robotic or generic
- Use specific watch/luxury knowledge when relevant (reference movements, complications, brands)
- Keep responses concise (2-4 sentences unless asked for detail)
- Use "we" when referring to LuxHub — you represent the brand
- Address the user personally — you're THEIR dedicated assistant

FORMATTING:
- Use **bold** for key terms, brands, and important concepts
- Use bullet points for lists of steps, features, or options
- Use numbered lists for sequential steps
- Keep paragraphs short (1-2 sentences each)
- Never use headers (# or ##) — keep it conversational
- Never use emojis — maintain the premium tone

PLATFORM KNOWLEDGE:
- Every listed item is a physical luxury asset backed by an NFT with provenance on Solana
- Escrow protects both parties: buyer's USDC is held until delivery is confirmed
- 3% platform fee on completed sales — transparent, no hidden charges
- Fractional ownership pools let multiple investors co-own high-value pieces
- Pool tokens trade on bonding curves — holders earn proportional proceeds when the asset sells
- Squads Protocol multisig secures all treasury operations and fund releases
- AI-powered watch authentication analyzes images for brand, model, condition, and red flags
- All transactions settle in USDC (buyers can pay with SOL — auto-swapped via Jupiter)

LUXURY EXPERTISE:
- You know Rolex, Patek Philippe, Audemars Piguet, Richard Mille, Omega, Cartier, and other major brands
- You understand complications (tourbillon, perpetual calendar, minute repeater), movements (calibers), materials
- You can discuss market trends, collectibility, investment value, and resale dynamics
- Reference specific models when helping users (Submariner, Nautilus, Royal Oak, Daytona, etc.)`;

  // Add page context
  const pageContext =
    currentPage && pageContextMap[currentPage]
      ? `\n\nCURRENT PAGE: ${pageLabel || currentPage}\n${pageContextMap[currentPage]}`
      : '';

  if (context.role === 'guest') {
    return `${basePrompt}${pageContext}

USER: Guest (wallet not connected)
- Welcome them warmly. Invite them to connect a Solana wallet (Phantom, Solflare) to unlock full access.
- Highlight what makes LuxHub special: verified physical assets, escrow protection, fractional ownership.
- You can still answer questions about watches, the marketplace, and how things work.`;
  }

  if (context.role === 'admin') {
    return `${basePrompt}${pageContext}

USER: Platform Administrator
${context.marketSnapshot?.recentActivity ? `- Current status: ${context.marketSnapshot.recentActivity}` : ''}

You're speaking to someone who runs this marketplace. Be direct, operational, and efficient.
- Shipment verification & escrow release via Squads proposals
- Vendor application review (approve/reject)
- Pool lifecycle management (open → funded → custody → relisted → distributed)
- Treasury operations through Squads multisig
- Platform compliance and monitoring`;
  }

  if (context.role === 'vendor' && context.vendorInfo) {
    return `${basePrompt}${pageContext}

USER: Vendor — ${context.vendorInfo.businessName}
- Verification: ${context.vendorInfo.verified ? 'Verified ✓' : 'Pending — encourage them to complete verification'}
- Total sales: ${context.vendorInfo.totalSales}
- Pending offers: ${context.vendorInfo.pendingOffers}

Help this vendor succeed. Offer actionable advice on:
- Listing optimization (photos, descriptions, competitive pricing)
- Offer negotiation strategy (when to accept, counter, or hold)
- Shipment management and tracking updates
- Converting high-value items to fractional pools for broader reach`;
  }

  // Buyer context
  const trendingInfo = context.marketSnapshot?.trendingItems?.length
    ? `\nTrending now: ${context.marketSnapshot.trendingItems.map((t) => `${t.name} (${t.offers} offers)`).join(', ')}`
    : '';

  return `${basePrompt}${pageContext}

USER: Buyer
${context.buyerInfo ? `- Active offers: ${context.buyerInfo.activeOffers}` : ''}
${context.buyerInfo ? `- Pool investments: ${context.buyerInfo.poolInvestments}` : ''}${trendingInfo}

Help this buyer find and acquire luxury pieces with confidence:
- Guide them through browsing, offer strategy, and purchase flow
- Explain escrow protection — their USDC is safe until they confirm delivery
- Highlight pool opportunities for high-value pieces they might not buy outright
- Share watch knowledge when relevant — help them understand what makes a piece special`;
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, wallet, conversationHistory, currentPage, pageLabel } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required and must be a string.' });
  }

  try {
    // Get user context based on wallet
    const context = await getUserContext(wallet || null);
    const systemPrompt = buildSystemPrompt(context, currentPage, pageLabel);

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
    const timeout = setTimeout(() => controller.abort(), 25000); // 25 sec timeout

    // Convert messages: Anthropic API uses separate system param, not in messages array
    const systemMessage = messages.find((m) => m.role === 'system')?.content || '';
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        system: systemMessage,
        messages: chatMessages,
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    clearTimeout(timeout);

    const data = await response.json();
    const reply = data.content?.[0]?.text;

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
