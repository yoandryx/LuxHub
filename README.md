# **Decentralized Marketplace dApp**
A decentralized marketplace on Solana for luxury physical assets using escrow-based transactions.

## 🛒 **Overview**
The **Decentralized Marketplace dApp** is a blockchain-based platform built on the **Solana network**, enabling users to trade high-value physical assets such as luxury watches securely using cryptocurrency. The platform offers a dual option for users to transact either via their crypto wallets or through a traditional Web2 profile using Stripe for fiat payments. 

By leveraging an **escrow-based transaction system**, we ensure that funds are securely held until both parties fulfill the transaction requirements. This hybrid approach aims to ease the transition to Web3 for users while maintaining a decentralized trading experience.

---

## 🎯 **Project Goals**
- **Hybrid Payment System:** Support both **crypto payments** via Solana wallets and **fiat payments** via Stripe.
- **Escrow Security:** Implement an escrow-based smart contract for secure transactions.
- **Decentralized Marketplace:** Allow users to trade assets without intermediaries.
- **Admin Approval:** Listings require admin approval during the beta phase to maintain quality.
- **Scalability:** Plan for future expansion to include more product categories and services.
- **Web3 Adoption:** Showcase advanced Web3 skills using **React, Node.js, Rust, and Solana smart contracts**.

---

## 🚀 **Features**
- **Wallet Authentication:** Solana-based wallets (Phantom, Solflare, etc.).
- **Web2 & Web3 Profiles:** 
  - Web2: Email and password with Stripe payments.
  - Web3: Solana wallet connection for crypto payments.
- **Listing System:** Sellers can create, update, and manage listings.
- **Approval Workflow:** Admin-only approval for listings.
- **Secure Transactions:** Escrow-based payments for both crypto and fiat.
- **Search & Filtering:** Browse assets by price, category, and location.
- **3D Product Showcase:** Integration with **Three.js** for immersive viewing.
- **Notifications:** Email notifications for listing status updates (planned feature).

---

## 🛠️ **Tech Stack**

### **Frontend**
- **React.js** – UI Development
- **Next.js** – Optimized for SEO and performance
- **Tailwind CSS** – Modern styling
- **Three.js** – 3D visualization
- **Framer Motion** – Animations
- **Solana Wallet Adapter** – Wallet integration

### **Backend**
- **Node.js + Express** – RESTful APIs
- **MongoDB** – Database for storing user and product data
- **Stripe API** – For fiat transactions
- **jsonwebtoken & bcryptjs** – Authentication and password encryption

### **Smart Contract Development**
- **Rust** – Programming Solana smart contracts
- **Anchor Framework** – Simplifies smart contract development
- **Solana Web3.js SDK** – Blockchain interactions
- **Escrow Contracts:** For secure transactions

### **Security & DevOps**
- **Docker** – Containerization for development
- **GitHub CI/CD** – Automated deployments
- **Vercel** – Frontend hosting
- **Cloudflare** – CDN and DDoS protection

---

## 📦 **Installation & Setup**

Clone the repo and install dependencies:

```bash
git clone https://github.com/YOUR_USERNAME/decentralized-marketplace-dapp.git
cd decentralized-marketplace-dapp
npm install
```

### Create `.env.local` File

Add your environment variables:

```bash
MONGODB_URI=mongodb+srv://<username>:<password>@marketplace.mongodb.net/Mercatus
JWT_SECRET=your_jwt_secret
STRIPE_SECRET_KEY=your_stripe_secret_key
```

### Run Development Server

```bash
npm run dev
```

---

## 🔑 **Authentication & Authorization**
- **Signup:** Web2 users can register with email and password; Web3 users can connect with a wallet.
- **Login:** Generates a JWT token for session management.
- **Admin Role:** Admin users can approve or reject listings.

---

## 📜 **API Endpoints**

### **Public Endpoints:**
- `GET /api/listings` – Fetch approved listings.
- `POST /api/auth/signup` – User registration.
- `POST /api/auth/login` – User login.

### **Admin Endpoints:**
- `POST /api/listings/approve` – Approve or reject a listing (Admin only).

---

## 🛡️ **Security Practices**
- **JWT Authentication:** Secure API access.
- **Password Encryption:** Using `bcryptjs`.
- **Input Validation:** Prevents injection attacks.

---

## 🛠️ **How to Contribute**
1. **Fork the repository** on GitHub.
2. **Create a new feature branch** (`feature/new-feature-name`).
3. **Submit a pull request** with a detailed explanation.

---

## 📝 **License**
This project is licensed under the **Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International (CC BY-NC-ND 4.0)**. See [LICENSE](LICENSE) for details.

---

This README provides a comprehensive overview of the project, highlighting the key features, tech stack, and setup instructions. It aligns with industry standards and gives clear guidance for both developers and potential collaborators.

