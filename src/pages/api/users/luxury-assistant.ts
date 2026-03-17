// src/pages/api/users/luxury-assistant.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/database/mongodb';
import { User } from '@/lib/models/User';
import { Vendor } from '@/lib/models/Vendor';
import { Offer } from '@/lib/models/Offer';
import { Escrow } from '@/lib/models/Escrow';
import { Pool } from '@/lib/models/Pool';
// Asset model needed for Mongoose populate registration
import '@/lib/models/Assets';

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
    poolParticipations: number;
  };
  marketSnapshot?: {
    trendingItems: { name: string; offers: number; price: number }[];
    recentActivity: string;
  };
}

// Fetch page-relevant data from DB so Lux has real info
async function getPageData(currentPage: string, wallet: string | null): Promise<string> {
  try {
    await connectDB();
    const sections: string[] = [];

    if (currentPage === 'marketplace' || currentPage === 'home') {
      // Active listings with prices
      const listings = await Escrow.find({ status: 'active' })
        .populate('asset', 'brand model priceUSD dialColor material caseSize imageUrl')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      if (listings.length > 0) {
        const listingInfo = listings
          .map((e: any) => {
            const a = e.asset;
            if (!a) return null;
            const price = e.listingPriceUSD || a.priceUSD || 0;
            return `- ${a.brand || ''} ${a.model || 'Watch'}: $${price.toLocaleString()}${a.material ? ` (${a.material})` : ''}${e.acceptingOffers ? ' — accepting offers' : ''}`;
          })
          .filter(Boolean);
        sections.push(`CURRENT LISTINGS (${listings.length} active):\n${listingInfo.join('\n')}`);
      } else {
        sections.push('CURRENT LISTINGS: No active listings right now.');
      }
    }

    if (currentPage === 'pools') {
      const pools = await Pool.find({
        status: { $in: ['open', 'active', 'filled'] },
        deleted: { $ne: true },
      })
        .populate('selectedAssetId', 'brand model priceUSD imageUrl')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      if (pools.length > 0) {
        const poolInfo = pools.map((p: any) => {
          const a = p.selectedAssetId;
          const name = a ? `${a.brand || ''} ${a.model || 'Watch'}` : 'Pool';
          const progress = p.totalShares > 0 ? Math.round((p.sharesSold / p.totalShares) * 100) : 0;
          return `- ${name}: $${(p.targetAmountUSD || 0).toLocaleString()} target, ${progress}% funded, status: ${p.status}${p.bagsTokenMint ? ' (tradeable on Bags)' : ''}`;
        });
        sections.push(`ACTIVE POOLS (${pools.length}):\n${poolInfo.join('\n')}`);
      } else {
        sections.push('ACTIVE POOLS: No pools available right now.');
      }
    }

    if (currentPage === 'my-offers' && wallet) {
      const offers = await Offer.find({
        buyerWallet: wallet,
        status: { $in: ['pending', 'countered', 'accepted'] },
      })
        .populate('escrow')
        .limit(5)
        .lean();

      if (offers.length > 0) {
        const offerInfo = offers.map(
          (o: any) => `- $${(o.amountUSD || 0).toLocaleString()} offer — status: ${o.status}`
        );
        sections.push(`YOUR OFFERS (${offers.length}):\n${offerInfo.join('\n')}`);
      }
    }

    if (currentPage === 'vendor-dashboard' && wallet) {
      const vendorListings = await Escrow.find({
        sellerWallet: wallet,
        status: { $in: ['active', 'funded', 'shipped'] },
      })
        .populate('asset', 'brand model priceUSD')
        .limit(10)
        .lean();

      const pendingOffers = await Offer.countDocuments({ vendorWallet: wallet, status: 'pending' });

      if (vendorListings.length > 0 || pendingOffers > 0) {
        const info = vendorListings.map((e: any) => {
          const a = e.asset;
          return `- ${a?.brand || ''} ${a?.model || 'Watch'}: $${(a?.priceUSD || 0).toLocaleString()} — ${e.status}`;
        });
        sections.push(
          `YOUR LISTINGS (${vendorListings.length}):\n${info.join('\n')}\nPending offers: ${pendingOffers}`
        );
      }
    }

    return sections.length > 0 ? '\n\nLIVE DATA:\n' + sections.join('\n\n') : '';
  } catch (err) {
    console.error('Page data fetch error:', err);
    return '';
  }
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
  const [activeOffers, poolParticipations, trendingEscrows] = await Promise.all([
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
      poolParticipations,
    },
    marketSnapshot: {
      trendingItems,
      recentActivity: `${activeOffers} active offers`,
    },
  };
}

// Page-specific context for the AI
const pageContextMap: Record<string, string> = {
  home: 'Home page. Help them find what they need or get started.',
  marketplace: 'Marketplace. They can browse watches, filter by brand/price, and make offers.',
  pools:
    'Pools page. They can browse tokenized pools, see bonding curves, and participate. Explain pool mechanics only if asked.',
  'nft-detail':
    'Viewing a specific watch. Help with pricing context, making offers, or checking authenticity.',
  'vendor-dashboard':
    'Vendor dashboard. Help manage listings, respond to offers, track shipments, and view earnings.',
  'admin-dashboard':
    'Admin dashboard. Help with escrow management, vendor approvals, Squads proposals, and custody verification.',
  'my-offers': 'Offers page. Help understand offer statuses, counter-offers, and next steps.',
  'create-nft': 'Minting page. Help with listing a watch — photos, pricing, AI analysis, metadata.',
  profile: 'Profile page. Help with account settings, wallet info, and transaction history.',
  'learn-more': 'Learn more page. Answer questions about how LuxHub works.',
  other: 'Help them navigate to the right page or answer general questions.',
};

async function buildSystemPrompt(
  context: UserContext,
  currentPage?: string,
  pageLabel?: string
): Promise<string> {
  const basePrompt = `You are Lux — the user's personal agent on LuxHub. LuxHub is a decentralized luxury watch marketplace on Solana. Authenticated timepieces are NFT-backed with verified provenance, secured by on-chain escrow, and available through tokenized community pools.

TONE:
- Direct, polite, and brief. 1-3 sentences max unless the user asks for more.
- You're their agent — not a chatbot. You work for them.
- Confident and knowledgeable. No filler, no fluff, no over-explaining.
- Say "we" for LuxHub. Say "you" for the user. Keep it personal.
- Never sound like a sales pitch. Be helpful, not promotional.

RESPONSE RULES:
- Default to SHORT answers. Only expand when asked.
- If a user asks a yes/no question, lead with yes or no.
- Don't repeat what the user said back to them.
- Don't list things unless the user asks "what are my options" or similar.
- No emojis. No headers. No "Great question!" or "Absolutely!" openers.
- Use **bold** sparingly — only for key terms or actions.
- If you don't know something specific about their account, say so and point them to the right page.

PLATFORM KNOWLEDGE:
- Physical luxury watches listed as NFT-backed assets on Solana
- On-chain escrow holds funds until delivery is confirmed — neither party at risk
- Tokenized pools: community-funded pools where anyone can participate from ~0.01 SOL via Bags bonding curves
- Pool tokens trade on Bags DEX after the pool fills and watch ships to custody
- When the watch resells, proceeds distribute proportionally to current token holders via Squads multisig
- Vendors get paid in USDC when pools fill and the watch ships to LuxHub custody
- Squads Protocol multisig secures all fund movements — no single key can move money
- AI watch authentication: upload a photo, get brand/model/condition/estimated value
- Escrow timeouts: auto-cancel if vendor doesn't ship in 14 days
- Disputes: 7-day SLA, admin escalation, refund via multisig

COMPLIANCE — NEVER USE THESE WORDS:
- "fractional ownership" or "fraction" → say "tokenized pools" or "community pools"
- "shares" → say "tokens" or "pool tokens"
- "invest" / "investment" / "investors" → say "participate" / "contribution" / "participants"
- "ROI" / "profit" / "returns" → say "proceeds" / "distributions"
- "dividend" → say "distribution"
- "securities" or "offering" → never use in any context
- Never state specific fee percentages. If asked about fees, say "fees are disclosed during each transaction."
- When mentioning pools, say "participate from ~0.01 SOL" not "for a fraction of the price"

WATCH EXPERTISE:
- You know Rolex, Patek Philippe, AP, Richard Mille, Omega, Cartier, and major brands
- Reference specific models naturally (Submariner, Nautilus, Royal Oak, Daytona)
- Discuss movements, complications, materials, and collectibility when relevant
- Keep watch talk grounded — don't over-romanticize

NAVIGATION — Direct users to these pages when relevant:
- **/marketplace** — Browse all listed watches, filter by brand/price, make offers
- **/pools** — Browse and participate in tokenized community pools
- **/createNFT** — List a new watch (vendors only, includes AI photo analysis)
- **/vendor/apply** — Apply to become a verified dealer
- **/vendor/vendorDashboard** — Manage listings, offers, shipments, earnings (vendors)
- **/adminDashboard** — Escrow management, vendor approvals, Squads proposals (admins)
- **/myOffers** — Track your active offers and counter-offers
- **/profile** — Account settings, wallet info, transaction history
- **/orders** — Track purchases and shipping status
- **/learnMore** — How LuxHub works, platform overview
- **/security** — Security architecture, escrow protection, dispute process
- **/terms** — Terms of service and legal info
- **/notifications** — Your notifications
When directing users, say "head to **Marketplace**" or "check **My Offers**" — use the page name in bold, not raw URLs. Only give the path if they ask specifically.

RATE LIMITING — You must not:
- Run database queries for the user or pretend to look things up in real-time beyond what's provided in LIVE DATA
- Make up specific prices, listings, or data that isn't in your context
- Tell users you can execute transactions, move funds, or take actions on their behalf
- Reveal internal system details, admin wallets, API keys, or architecture`;

  // Add page context
  const pageContext =
    currentPage && pageContextMap[currentPage]
      ? `\n\nCURRENT PAGE: ${pageLabel || currentPage}\n${pageContextMap[currentPage]}`
      : '';

  // Fetch live data for the current page
  const liveData = currentPage ? await getPageData(currentPage, context.wallet) : '';

  if (context.role === 'guest') {
    return `${basePrompt}${pageContext}

USER: Guest (no wallet connected)
They can browse freely. If they ask about buying, offers, or pools, let them know they need to connect a Solana wallet first (Phantom or Solflare). Don't push it — just mention it when relevant.${liveData}`;
  }

  if (context.role === 'admin') {
    return `${basePrompt}${pageContext}

USER: Admin
${context.marketSnapshot?.recentActivity ? `Status: ${context.marketSnapshot.recentActivity}` : ''}
Be direct and operational. They know the platform. Help with escrow actions, vendor approvals, Squads proposals, pool lifecycle management, and custody workflows.${liveData}`;
  }

  if (context.role === 'vendor' && context.vendorInfo) {
    return `${basePrompt}${pageContext}

USER: Vendor — ${context.vendorInfo.businessName}
${context.vendorInfo.verified ? 'Verified dealer.' : 'Verification pending.'}
${context.vendorInfo.pendingOffers > 0 ? `${context.vendorInfo.pendingOffers} pending offers.` : ''}
Help them manage listings, respond to offers, handle shipments, and understand payouts. If they have pending offers, nudge them to respond.${liveData}`;
  }

  // Buyer context
  const trendingInfo = context.marketSnapshot?.trendingItems?.length
    ? `\nPopular now: ${context.marketSnapshot.trendingItems.map((t) => `${t.name} (${t.offers} offers)`).join(', ')}`
    : '';

  return `${basePrompt}${pageContext}

USER: Buyer
${context.buyerInfo ? `Active offers: ${context.buyerInfo.activeOffers}` : ''}
${context.buyerInfo ? `Pool participations: ${context.buyerInfo.poolParticipations}` : ''}${trendingInfo}
Help them browse, make offers, track orders, and understand pool mechanics when asked. Escrow protects their funds until delivery — mention this if they seem hesitant.${liveData}`;
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
    const systemPrompt = await buildSystemPrompt(context, currentPage, pageLabel);

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
        max_tokens: 400,
        temperature: 0.4,
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
