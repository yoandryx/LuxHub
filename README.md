# Luxhub 

Luxhub is a decentralized platform built on the Solana blockchain that allows users to trade luxury timepieces as NFTs. By combining on-chain smart contracts with modern web technologies, Luxhub ensures transparency, authenticity, and secure escrow management for each trade.
<p align="center">
  <img src="public/images/purpleLGG.png" alt="Logo" width="200" />
</p>

## Overview

Luxhub leverages Solana’s high-speed blockchain to offer a seamless experience for creating, managing, and trading NFTs representing luxury timepieces. Users can mint new NFTs that include detailed metadata (such as brand, model, serial number, production year, and other watch-specific attributes) and manage transactions through an on-chain escrow system. The platform integrates with tools like Pinata for decentralized file storage and Metaplex for NFT metadata management.

## Features

- **NFT Minting & Metadata**  
  Create NFTs representing luxury timepieces using an intuitive form. Each NFT carries detailed attributes (e.g., brand, model, material, serial number, warranty information) to ensure authenticity. Metadata is uploaded to Pinata and then integrated into the NFT on-chain using Metaplex.  

- **Admin Dashboard & Escrow Management**  
  A comprehensive admin dashboard provides tools for:
  - Configuring and updating escrow settings.
  - Managing the list of platform administrators.
  - Approving or canceling NFT escrows.
  - Viewing on-chain transaction logs and analytics (including admin actions and escrow volumes). 

- **Marketplace**  
  A marketplace page lets users browse available NFTs, view detailed NFT information, and purchase or exchange NFTs. The purchase workflow interacts with an on-chain program, ensuring a secure exchange of assets.  

- **Wallet Integration & On-Chain Interactions**  
  Built with Next.js and the Solana Wallet Adapter, Luxhub supports popular wallets (e.g., Phantom and Solflare) to connect and interact with the blockchain. All on-chain operations (minting, transferring, escrow management) are executed through a custom Solana program, ensuring robust and secure transactions.  

- **Immersive UI**  
  The home page features a dynamic Three.js scene along with clear branding, presenting an engaging introduction to the Luxhub experience.  

## Architecture

Luxhub is structured as a Next.js application and integrates several key components:

- **Pages & Components:**
  - **NFT Creation (createNFT.tsx):**  
    Handles NFT minting, metadata upload to Pinata, on-chain minting via a Solana program, and post-mint actions (e.g., transferring NFTs to sellers).
  - **Admin Dashboard (adminDashboard.tsx):**  
    Provides configuration, user management, escrow management, and analytics functionalities.
  - **Marketplace (watchMarket.tsx):**  
    Displays NFTs available for trade, along with functionality for purchasing and viewing details.
  - **Home (index.tsx):**  
    Serves as the landing page with branding and a Three.js scene.
  - **Global Setup (_app.tsx):**  
    Wraps the application with wallet providers, connection contexts, and global UI components like the navbar and footer.

- **Blockchain Interaction:**  
  The project uses Anchor and custom utility functions (in files like `programUtils.ts`) to interact with Solana’s on-chain programs, including minting NFTs, handling transfers (manual and auto ATA), and managing escrow configurations.

## Getting Started

### Prerequisites

- **Node.js** and **npm** or **yarn**
- A Solana wallet (Phantom or Solflare recommended)
- Access to a Solana Devnet endpoint (or mainnet if ready for production)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yoandryx/luxhub.git
   cd luxhub

2. **Install dependencies:**
   ```bash
   npm install
   # or
   yarn install

3. **Set up environment variables:**
   ```bash
   NEXT_PUBLIC_SOLANA_ENDPOINT=https://api.devnet.solana.com
   NEXT_PUBLIC_GATEWAY_URL=https://your-ipfs-gateway.com/
   PINATA_API_KEY=your_pinata_api_key
   PINATA_SECRET_API_KEY=your_pinata_secret

5. **Run the development server:**
   ```bash
   npm install
   # or
   yarn install

6. **Install dependencies:**
   ```bash
   npm run dev
   # or
   yarn dev

7. **Access the app:**
Open http://localhost:3000 in your browser.

---

## Usage

Minting an NFT:
- Navigate to the NFT creation page. Fill in the detailed form (including attributes such as brand, model, serial number, etc.) and submit to mint a new NFT. The process will upload metadata to Pinata, mint the NFT on-chain, and display it on the page.

Admin Functions:
- The admin dashboard provides options to configure escrow settings, add or remove admins, manage active escrows, confirm NFT deliveries, and cancel transactions. Detailed analytics and transaction logs help track on-chain events.

Marketplace:
- Browse the available NFTs in the marketplace, view details, and initiate purchases. Transactions are handled through an on-chain exchange instruction.

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a new branch (git checkout -b feature/YourFeature).
3. Make your changes and commit them (git commit -m 'Add some feature').
4. Push to your branch (git push origin feature/YourFeature).
5. Open a Pull Request.

For major changes, please open an issue first to discuss what you would like to change.

---

## License
This project is licensed under the **Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International (CC BY-NC-ND 4.0)**. See [LICENSE](LICENSE) for details.

---
