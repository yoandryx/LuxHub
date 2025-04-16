# LuxHub: Decentralized Luxury Marketplace on Solana

LuxHub is a fully decentralized Web3 marketplace built on the Solana blockchain, designed specifically for luxury assets such as watches, collectibles, and authenticated high-value items. The platform empowers verified sellers to tokenize physical assets as NFTs and engage in secure, trustless transactions with buyers through our custom escrow program.

<p align="center">
  <img src="public/images/purpleLGG.png" alt="Logo" width="200" />
</p>

## Key Features

- **NFT-Backed Asset Listings:** Mint NFTs tied to physical luxury items with full metadata stored on IPFS via Pinata.
- **Escrow-Based Sale Logic:** Trustless transactions using a custom Solana Anchor smart contract to ensure NFT + fund exchange only occurs after admin approval.
- **Admin Dashboard:** Role-restricted interface to manage inventory, approve listings, confirm deliveries, and trigger transfers.
- **Secure Buyer Experience:** Buyers interact via a clean marketplace UI to lock funds and await delivery validation before settlement.
- **Royalty Split Logic:** Sale proceeds are programmatically distributed (95% to seller, 5% to LuxHub Treasury) via on-chain transfers.
- **Metadata Management:** Dynamically update NFT traits post-sale (e.g., Market Status, Provenance, Ownership).

## Tech Stack

- **Frontend:** Next.js + React + TailwindCSS
- **Blockchain:** Solana, Anchor (smart contracts), SPL Token
- **Metadata Hosting:** Pinata (IPFS gateway)
- **Wallet Integration:** Phantom (Solana Wallet Adapter)
- **Backend:** MongoDB (SaleRequest model) + Next.js API Routes
- **RPC Provider:** Helius

## Smart Contract Highlights

- Escrow PDA structure built with dynamic seeds for unique tracking
- Funds + NFTs stored in ATA vaults linked to escrow PDA
- Confirmation flow controlled by admin to ensure physical delivery before settlement
- Custom instructions: `initialize`, `exchange`, `confirm_delivery`, `cancel`

## Security Measures

- No escrow finalization unless vault balances match required assets
- On-chain ownership checks to prevent unauthorized delivery
- Admin-only authority for confirming sensitive transfers
- Buyer lock-in validation before triggering delivery

## Use Case

LuxHub is built for:

- Luxury watch dealers
- Collectibles curators
- Web3-based authentication + trading startups
- High-end P2P markets looking for decentralized trust

## How to Use (Dev Environment)

1. Clone repo and install dependencies:

```bash
git clone https://github.com/yoandryx/LuxHub.git
cd LuxHub
npm install
```

2. Launch the local dev server:

```bash
npm run dev
```

3. Compile and deploy smart contracts:

```bash
cd Solana-Anchor
anchor build && anchor deploy
```

4. Setup your `.env` and connect a Solana wallet with devnet funds.

## Watch Us

> LuxHub is redefining luxury commerce with programmable trust.

Follow progress on [X.com](https://x.com/luxhubdotfun), contribute via PR, or reach out for partnerships.

---
