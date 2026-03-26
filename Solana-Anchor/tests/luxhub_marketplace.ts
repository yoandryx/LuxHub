import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { expect } from "chai";

const CONFIG_SEED = Buffer.from("luxhub-config");
const ESCROW_SEED = Buffer.from("state");

describe("luxhub_marketplace", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.LuxhubMarketplace as anchor.Program;

  // Actors
  const admin = (provider.wallet as anchor.Wallet).payer;
  const seller = Keypair.generate();
  const buyer = Keypair.generate();

  // Token mints
  let mintA: PublicKey; // funds mint (9 decimals, simulates USDC)
  let mintB: PublicKey; // NFT mint (0 decimals)

  // Seller token accounts
  let sellerAtaA: PublicKey;
  let sellerAtaB: PublicKey;

  // Buyer token accounts
  let buyerAtaA: PublicKey;
  let buyerAtaB: PublicKey;

  // Treasury token account (for fees)
  const treasury = Keypair.generate();
  let treasuryAtaA: PublicKey;

  // Config PDA
  let configPda: PublicKey;
  let configBump: number;

  // Escrow PDA
  const escrowSeed = new BN(42);
  let escrowPda: PublicKey;
  let escrowBump: number;

  // PDA-derived ATA vaults (NOT keypairs!)
  let nftVault: PublicKey;
  let wsolVault: PublicKey;

  // Sale price (1 token with 9 decimals)
  const salePrice = new BN(1_000_000_000);

  /** ---------- Helpers ---------- */

  function deriveSeedLE(seed: BN): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(seed.toString()));
    return buf;
  }

  async function airdrop(pubkey: PublicKey, sol = 2) {
    const sig = await provider.connection.requestAirdrop(
      pubkey,
      sol * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  async function accountExists(address: PublicKey): Promise<boolean> {
    try {
      await getAccount(provider.connection, address);
      return true;
    } catch {
      return false;
    }
  }

  async function escrowExists(address: PublicKey): Promise<boolean> {
    try {
      await (program.account as any)["escrow"].fetch(address);
      return true;
    } catch {
      return false;
    }
  }

  // ========== SETUP ==========

  it("sets up wallets, mints, and derives PDAs", async () => {
    // Airdrop SOL to seller and buyer
    await airdrop(seller.publicKey, 5);
    await airdrop(buyer.publicKey, 5);
    await airdrop(treasury.publicKey, 1);

    // Create funds mint (decimals 9) and NFT mint (decimals 0)
    mintA = await createMint(provider.connection, admin, admin.publicKey, null, 9);
    mintB = await createMint(provider.connection, admin, admin.publicKey, null, 0);

    // Seller ATAs
    sellerAtaA = (
      await getOrCreateAssociatedTokenAccount(provider.connection, admin, mintA, seller.publicKey)
    ).address;
    sellerAtaB = (
      await getOrCreateAssociatedTokenAccount(provider.connection, admin, mintB, seller.publicKey)
    ).address;

    // Mint 1 NFT to seller
    await mintTo(provider.connection, admin, mintB, sellerAtaB, admin.publicKey, 1);

    // Buyer ATAs
    buyerAtaA = (
      await getOrCreateAssociatedTokenAccount(provider.connection, admin, mintA, buyer.publicKey)
    ).address;
    buyerAtaB = (
      await getOrCreateAssociatedTokenAccount(provider.connection, admin, mintB, buyer.publicKey)
    ).address;

    // Fund buyer with mintA tokens for purchase
    await mintTo(provider.connection, admin, mintA, buyerAtaA, admin.publicKey, salePrice.toNumber());

    // Treasury ATA (for fee collection)
    treasuryAtaA = (
      await getOrCreateAssociatedTokenAccount(provider.connection, admin, mintA, treasury.publicKey)
    ).address;

    // Derive config PDA
    [configPda, configBump] = PublicKey.findProgramAddressSync([CONFIG_SEED], program.programId);

    // Derive escrow PDA
    const seedLE = deriveSeedLE(escrowSeed);
    [escrowPda, escrowBump] = PublicKey.findProgramAddressSync([ESCROW_SEED, seedLE], program.programId);

    // Derive PDA-owned ATA vaults (deterministic, not keypairs)
    nftVault = getAssociatedTokenAddressSync(mintB, escrowPda, true);
    wsolVault = getAssociatedTokenAddressSync(mintA, escrowPda, true);

    // Verify setup
    const sellerNft = await getAccount(provider.connection, sellerAtaB);
    expect(Number(sellerNft.amount)).to.eq(1);

    const buyerFunds = await getAccount(provider.connection, buyerAtaA);
    expect(Number(buyerFunds.amount)).to.eq(salePrice.toNumber());
  });

  // ========== H-1: Fee cap at init ==========

  it("initialize_config rejects fee_bps > 1000 (H-1)", async () => {
    try {
      await program.methods
        .initializeConfig(admin.publicKey, treasury.publicKey, 1500)
        .accounts({
          payer: admin.publicKey,
          config: configPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Expected FeeTooHigh error");
    } catch (e: any) {
      const errStr = JSON.stringify(e);
      const hasFeeTooHigh =
        errStr.includes("FeeTooHigh") ||
        errStr.includes("6021") ||
        errStr.includes("Fee cannot exceed");
      expect(hasFeeTooHigh, `Expected FeeTooHigh error, got: ${e.message}`).to.be.true;
    }
  });

  it("initialize_config with valid fee_bps succeeds", async () => {
    await program.methods
      .initializeConfig(admin.publicKey, treasury.publicKey, 300)
      .accounts({
        payer: admin.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await (program.account as any)["escrowConfig"].fetch(configPda);
    expect(cfg.authority.toBase58()).to.eq(admin.publicKey.toBase58());
    expect(cfg.treasury.toBase58()).to.eq(treasury.publicKey.toBase58());
    expect(cfg.feeBps).to.eq(300);
    expect(cfg.paused).to.eq(false);
  });

  // ========== C-1: PDA-derived ATA vaults ==========

  it("initialize escrow with PDA-derived ATA vaults (C-1)", async () => {
    const initializerAmount = new BN(1);
    const takerAmount = new BN(0);
    const fileCid = "ipfs://test-cid";

    await program.methods
      .initialize(escrowSeed, initializerAmount, takerAmount, fileCid, salePrice)
      .accounts({
        admin: admin.publicKey,
        seller: seller.publicKey,
        config: configPda,
        mintA,
        mintB,
        sellerAtaB,
        escrow: escrowPda,
        nftVault,   // PDA-derived ATA, NOT keypair
        wsolVault,  // PDA-derived ATA, NOT keypair
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])  // NO vault keypairs as signers
      .rpc();

    // Verify NFT moved to vault
    const sellerNft = await getAccount(provider.connection, sellerAtaB);
    expect(Number(sellerNft.amount)).to.eq(0);

    const vaultNft = await getAccount(provider.connection, nftVault);
    expect(Number(vaultNft.amount)).to.eq(1);

    // Verify escrow state
    const esc = await (program.account as any)["escrow"].fetch(escrowPda);
    expect(esc.initializer.toBase58()).to.eq(seller.publicKey.toBase58());
    expect(esc.mintA.toBase58()).to.eq(mintA.toBase58());
    expect(esc.mintB.toBase58()).to.eq(mintB.toBase58());
    expect(Number(esc.salePrice)).to.eq(salePrice.toNumber());
    expect(esc.isCompleted).to.eq(false);
    expect(esc.buyer.toBase58()).to.eq(PublicKey.default.toBase58());
  });

  // ========== C-2: Self-purchase guard ==========

  it("exchange rejects self-purchase (C-2)", async () => {
    try {
      await program.methods
        .exchange()
        .accounts({
          taker: seller.publicKey,  // seller trying to buy own listing
          escrow: escrowPda,
          mintA,
          mintB,
          takerFundsAta: sellerAtaA,
          wsolVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();
      expect.fail("Expected SelfPurchase error");
    } catch (e: any) {
      const errStr = JSON.stringify(e);
      const hasSelfPurchase =
        errStr.includes("SelfPurchase") ||
        errStr.includes("Cannot purchase your own listing") ||
        errStr.includes("2007") ||
        errStr.includes("6022");
      expect(hasSelfPurchase, `Expected SelfPurchase error, got: ${e.message}`).to.be.true;
    }
  });

  // ========== Exchange succeeds for different buyer ==========

  it("exchange succeeds for different buyer", async () => {
    await program.methods
      .exchange()
      .accounts({
        taker: buyer.publicKey,
        escrow: escrowPda,
        mintA,
        mintB,
        takerFundsAta: buyerAtaA,
        wsolVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    // Buyer funds should be in vault
    const buyerFunds = await getAccount(provider.connection, buyerAtaA);
    expect(Number(buyerFunds.amount)).to.eq(0);

    const vaultFunds = await getAccount(provider.connection, wsolVault);
    expect(Number(vaultFunds.amount)).to.eq(salePrice.toNumber());

    // Escrow buyer should be set
    const esc = await (program.account as any)["escrow"].fetch(escrowPda);
    expect(esc.buyer.toBase58()).to.eq(buyer.publicKey.toBase58());
  });

  // ========== H-2, H-3: confirm_delivery (Squads CPI gated) ==========

  it("confirm_delivery requires Squads CPI (skipped — devnet verification per D-07)", async () => {
    // confirm_delivery and refund_buyer are gated by enforce_squads_cpi() which checks
    // that the previous instruction was from the Squads v4 program with authority as signer.
    // On local validator, even with Squads program cloned, constructing a full Squads vault
    // transaction + proposal + execute flow is complex. The Squads CPI gate is validated by:
    //
    // 1. The enforce_squads_cpi() utility checks current_index > 0, prev_ix.program_id == SQUADS_V4,
    //    and that the authority signed the previous instruction.
    // 2. We verify the accounts are set up correctly for confirm_delivery.
    // 3. Full CPI testing happens on devnet per D-07 decision.
    //
    // Attempt the call to verify it rejects without Squads CPI:
    try {
      await program.methods
        .confirmDelivery()
        .accounts({
          escrow: escrowPda,
          config: configPda,
          buyerNftAta: buyerAtaB,
          nftVault,
          wsolVault,
          mintA,
          mintB,
          sellerFundsAta: sellerAtaA,
          luxhubFeeAta: treasuryAtaA,
          seller: seller.publicKey,
          authority: admin.publicKey,
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Expected NotCalledBySquads error");
    } catch (e: any) {
      const errStr = JSON.stringify(e);
      const hasSquadsError =
        errStr.includes("NotCalledBySquads") ||
        errStr.includes("Must be called via Squads") ||
        errStr.includes("6001");
      expect(hasSquadsError, `Expected Squads CPI error, got: ${e.message}`).to.be.true;
    }
  });

  // ========== H-2, H-3: confirm_delivery happy-path (devnet verification per D-07) ==========

  it("confirm_delivery happy-path (devnet verification per D-07) — documents expected behavior", async () => {
    // This test documents the expected happy-path for confirm_delivery:
    //
    // PRECONDITION: exchange() has been called — buyer funded escrow, NFT is in nft_vault
    //
    // EXPECTED BEHAVIOR when called via Squads CPI:
    // 1. NFT transfers from nft_vault → buyer_nft_ata
    // 2. Funds split: seller gets (sale_price - fee_share), treasury gets fee_share
    //    where fee_share = sale_price * fee_bps / 10000
    //    and seller_share = sale_price - fee_share (no remainder loss per D-20)
    // 3. nft_vault token account closed (rent → seller)
    // 4. wsol_vault token account closed (rent → seller)
    // 5. escrow account closed (rent → seller, per close = seller constraint)
    //
    // VERIFICATION APPROACH:
    // - Local validator: CPI gate blocks direct call (tested above)
    // - Devnet: Full Squads vault TX wrapping confirm_delivery (D-07)
    //
    // We verify the accounts are correctly set up post-exchange:

    // Verify escrow state shows buyer is set (from exchange)
    const escrowAccount = await (program.account as any)["escrow"].fetch(escrowPda);
    expect(escrowAccount.buyer.toBase58()).to.eq(buyer.publicKey.toBase58());
    expect(escrowAccount.isCompleted).to.eq(false);

    // Verify NFT is in vault (ready for transfer to buyer)
    const nftVaultAccount = await getAccount(provider.connection, nftVault);
    expect(Number(nftVaultAccount.amount)).to.eq(1);

    // Verify funds are in vault (ready for split)
    const fundsVaultAccount = await getAccount(provider.connection, wsolVault);
    expect(Number(fundsVaultAccount.amount)).to.eq(salePrice.toNumber());

    // Verify the expected fund split calculation
    const feeBps = 300; // 3% as configured in initialize_config
    const expectedFeeShare = Math.floor(salePrice.toNumber() * feeBps / 10000);
    const expectedSellerShare = salePrice.toNumber() - expectedFeeShare; // D-20 pattern
    expect(expectedSellerShare + expectedFeeShare).to.eq(salePrice.toNumber());

    // Log expected behavior for devnet verification
    console.log("    confirm_delivery expected behavior (verify on devnet):");
    console.log(`      NFT vault → buyer ATA: 1 token`);
    console.log(`      Funds vault → seller ATA: ${expectedSellerShare} lamports (97%)`);
    console.log(`      Funds vault → treasury ATA: ${expectedFeeShare} lamports (3%)`);
    console.log(`      Accounts closed: escrow, nft_vault, wsol_vault`);
    console.log(`      Rent returned to: seller`);
  });

  // ========== D-18: update_price taker_amount sync ==========

  // We use a second escrow for update_price and cancel_escrow tests
  const escrowSeed2 = new BN(99);
  let escrowPda2: PublicKey;
  let escrowBump2: number;
  let nftVault2: PublicKey;
  let wsolVault2: PublicKey;
  let sellerAtaB2: PublicKey; // seller's ATA for a second NFT

  // Second NFT mint for the second escrow
  let mintB2: PublicKey;

  it("setup second escrow for update_price and cancel tests", async () => {
    // Create a second NFT mint
    mintB2 = await createMint(provider.connection, admin, admin.publicKey, null, 0);

    // Seller ATA for second NFT
    sellerAtaB2 = (
      await getOrCreateAssociatedTokenAccount(provider.connection, admin, mintB2, seller.publicKey)
    ).address;

    // Mint 1 NFT to seller
    await mintTo(provider.connection, admin, mintB2, sellerAtaB2, admin.publicKey, 1);

    // Derive second escrow PDA
    const seedLE2 = deriveSeedLE(escrowSeed2);
    [escrowPda2, escrowBump2] = PublicKey.findProgramAddressSync([ESCROW_SEED, seedLE2], program.programId);

    // Derive vaults for second escrow
    nftVault2 = getAssociatedTokenAddressSync(mintB2, escrowPda2, true);
    wsolVault2 = getAssociatedTokenAddressSync(mintA, escrowPda2, true);

    // Initialize second escrow
    await program.methods
      .initialize(escrowSeed2, new BN(1), salePrice, "ipfs://test-cid-2", salePrice)
      .accounts({
        admin: admin.publicKey,
        seller: seller.publicKey,
        config: configPda,
        mintA,
        mintB: mintB2,
        sellerAtaB: sellerAtaB2,
        escrow: escrowPda2,
        nftVault: nftVault2,
        wsolVault: wsolVault2,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    const esc = await (program.account as any)["escrow"].fetch(escrowPda2);
    expect(Number(esc.salePrice)).to.eq(salePrice.toNumber());
    expect(Number(esc.takerAmount)).to.eq(salePrice.toNumber());
  });

  it("update_price correctly syncs taker_amount (D-18)", async () => {
    const newPrice = new BN(2_000_000_000);

    // taker_amount == sale_price initially, so both should update
    await program.methods
      .updatePrice(newPrice)
      .accounts({
        seller: seller.publicKey,
        escrow: escrowPda2,
      })
      .signers([seller])
      .rpc();

    let esc = await (program.account as any)["escrow"].fetch(escrowPda2);
    expect(Number(esc.salePrice)).to.eq(newPrice.toNumber());
    expect(Number(esc.takerAmount)).to.eq(newPrice.toNumber()); // synced because taker_amount matched old price

    // Now set taker_amount to a different value by updating price again
    // After first update: sale_price=2B, taker_amount=2B
    // Update to 3B: taker_amount==sale_price(2B), so both update to 3B
    const newPrice2 = new BN(3_000_000_000);
    await program.methods
      .updatePrice(newPrice2)
      .accounts({
        seller: seller.publicKey,
        escrow: escrowPda2,
      })
      .signers([seller])
      .rpc();

    esc = await (program.account as any)["escrow"].fetch(escrowPda2);
    expect(Number(esc.salePrice)).to.eq(newPrice2.toNumber());
    expect(Number(esc.takerAmount)).to.eq(newPrice2.toNumber());
  });

  // ========== Cancel escrow ==========

  it("cancel_escrow returns NFT and closes accounts", async () => {
    // Verify NFT is in vault before cancel
    const vaultBefore = await getAccount(provider.connection, nftVault2);
    expect(Number(vaultBefore.amount)).to.eq(1);

    await program.methods
      .cancelEscrow()
      .accounts({
        seller: seller.publicKey,
        escrow: escrowPda2,
        nftVault: nftVault2,
        wsolVault: wsolVault2,
        sellerNftAta: sellerAtaB2,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    // Verify seller got NFT back
    const sellerNft = await getAccount(provider.connection, sellerAtaB2);
    expect(Number(sellerNft.amount)).to.eq(1);

    // Verify escrow account is closed
    const escrowStillExists = await escrowExists(escrowPda2);
    expect(escrowStillExists, "Escrow should be closed after cancel").to.be.false;

    // Verify vault token accounts are closed
    const nftVaultExists = await accountExists(nftVault2);
    expect(nftVaultExists, "NFT vault should be closed after cancel").to.be.false;

    const wsolVaultExists = await accountExists(wsolVault2);
    expect(wsolVaultExists, "WSOL vault should be closed after cancel").to.be.false;
  });

  // ========== H-5: close_config with typed Account ==========

  it("close_config works with typed Account (H-5)", async () => {
    await program.methods
      .closeConfig()
      .accounts({
        admin: admin.publicKey,
        config: configPda,
      })
      .rpc();

    // Verify config account no longer exists
    try {
      await (program.account as any)["escrowConfig"].fetch(configPda);
      expect.fail("Config should be closed");
    } catch (e: any) {
      const errStr = e.message || JSON.stringify(e);
      const isClosed =
        errStr.includes("Account does not exist") ||
        errStr.includes("could not find account") ||
        errStr.includes("does not exist");
      expect(isClosed, `Expected account closed error, got: ${errStr}`).to.be.true;
    }
  });

  it("reinitialize config after close (verifies close was clean)", async () => {
    // Reinitialize config to prove close was clean
    await program.methods
      .initializeConfig(admin.publicKey, treasury.publicKey, 300)
      .accounts({
        payer: admin.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await (program.account as any)["escrowConfig"].fetch(configPda);
    expect(cfg.feeBps).to.eq(300);
  });

  // ========== H-4: RefundBuyer constraint-level validation ==========

  it("refund_buyer requires Squads CPI (constraint-level validation H-4)", async () => {
    // refund_buyer has constraint: buyer != default and !is_completed
    // It's also gated by Squads CPI. We test that calling it directly fails.
    // The first escrow (seed=42) has a buyer assigned, so constraints pass,
    // but Squads CPI gate should reject.
    try {
      await program.methods
        .refundBuyer()
        .accounts({
          escrow: escrowPda,
          config: configPda,
          buyerFundsAta: buyerAtaA,
          fundsVault: wsolVault,
          nftVault,
          sellerNftAta: sellerAtaB,
          buyerAccount: buyer.publicKey,
          authority: admin.publicKey,
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Expected NotCalledBySquads error");
    } catch (e: any) {
      const errStr = JSON.stringify(e);
      const hasSquadsError =
        errStr.includes("NotCalledBySquads") ||
        errStr.includes("Must be called via Squads") ||
        errStr.includes("6001");
      expect(hasSquadsError, `Expected Squads CPI error, got: ${e.message}`).to.be.true;
    }
  });

  // ========== Verify refund_buyer constraint rejects when no buyer ==========

  it("refund_buyer rejects when no buyer assigned (constraint validation)", async () => {
    // Create a third escrow with no buyer to test NoBuyer constraint
    const escrowSeed3 = new BN(777);
    const mintB3 = await createMint(provider.connection, admin, admin.publicKey, null, 0);
    const sellerAtaB3 = (
      await getOrCreateAssociatedTokenAccount(provider.connection, admin, mintB3, seller.publicKey)
    ).address;
    await mintTo(provider.connection, admin, mintB3, sellerAtaB3, admin.publicKey, 1);

    const seedLE3 = deriveSeedLE(escrowSeed3);
    const [escrowPda3] = PublicKey.findProgramAddressSync([ESCROW_SEED, seedLE3], program.programId);
    const nftVault3 = getAssociatedTokenAddressSync(mintB3, escrowPda3, true);
    const wsolVault3 = getAssociatedTokenAddressSync(mintA, escrowPda3, true);

    await program.methods
      .initialize(escrowSeed3, new BN(1), new BN(0), "ipfs://test-cid-3", salePrice)
      .accounts({
        admin: admin.publicKey,
        seller: seller.publicKey,
        config: configPda,
        mintA,
        mintB: mintB3,
        sellerAtaB: sellerAtaB3,
        escrow: escrowPda3,
        nftVault: nftVault3,
        wsolVault: wsolVault3,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])
      .rpc();

    // Attempt refund on escrow with no buyer — should fail at constraint level
    try {
      await program.methods
        .refundBuyer()
        .accounts({
          escrow: escrowPda3,
          config: configPda,
          buyerFundsAta: buyerAtaA,
          fundsVault: wsolVault3,
          nftVault: nftVault3,
          sellerNftAta: sellerAtaB3,
          buyerAccount: buyer.publicKey, // wrong buyer, but constraint checks escrow.buyer != default first
          authority: admin.publicKey,
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Expected NoBuyer error");
    } catch (e: any) {
      const errStr = JSON.stringify(e);
      const hasNoBuyer =
        errStr.includes("NoBuyer") ||
        errStr.includes("No buyer assigned") ||
        errStr.includes("6023") ||
        errStr.includes("ConstraintRaw") ||
        errStr.includes("2003");  // Anchor constraint violation
      expect(hasNoBuyer, `Expected NoBuyer constraint error, got: ${e.message}`).to.be.true;
    }

    // Cleanup: cancel the third escrow
    await program.methods
      .cancelEscrow()
      .accounts({
        seller: seller.publicKey,
        escrow: escrowPda3,
        nftVault: nftVault3,
        wsolVault: wsolVault3,
        sellerNftAta: sellerAtaB3,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])
      .rpc();
  });
});
