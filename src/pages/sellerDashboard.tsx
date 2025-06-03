// src/pages/SellerDashboard.tsx
import React, { useEffect, useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Connection,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { getProgram } from "../utils/programUtils";
import { Metaplex, walletAdapterIdentity } from "@metaplex-foundation/js";
import styles from "../styles/SellerDashboard.module.css";
import NFTCard from "../components/marketplace/NFTCard";
import { NftDetailCard } from "../components/marketplace/NftDetailCard";
import { SiSolana } from "react-icons/si";
import { IoMdInformationCircle } from "react-icons/io";
import NFTChangeRequestForm from "../components/user/NFTChangeRequestForm";
import MintRequestForm from "../components/user/MintRequestForm";

export interface NFT {
  mintAddress: string;
  title: string;
  description: string;
  image: string;
  marketStatus: string;
  fileCid: string;
  salePrice: number;
  metadataUri: string;
  isInEscrow?: boolean;
  isRequested?: boolean;
  seed?: number;
  nftId: string;
  timestamp: number;
  seller: string;
  attributes?: { trait_type: string, value: string }[]; 
}


const FUNDS_MINT = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = 1_000_000_000;

const SellerDashboard: React.FC = () => {
  const wallet = useWallet();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);
  const [loadingMint, setLoadingMint] = useState<string | null>(null);
  const [pendingSales, setPendingSales] = useState<{ [nftId: string]: string }>({});


  const [activeTab, setActiveTab] = useState("My NFTs");


  const connection = useMemo(
    () =>
      new Connection(
        process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || "https://api.devnet.solana.com"
      ),
    []
  );
  const metaplex = useMemo(
    () =>
      wallet.publicKey
        ? Metaplex.make(connection).use(walletAdapterIdentity(wallet))
        : null,
    [wallet.publicKey, connection]
  );
  const program = useMemo(
    () => (wallet.publicKey ? getProgram(wallet) : null),
    [wallet.publicKey]
  );

  const fetchNFTs = async () => {
    if (!wallet.publicKey || !metaplex || !program) return;

    // Fetch all pending sale requests from MongoDB
    const pendingRes = await fetch(`/api/nft/pendingRequests?seller=${wallet.publicKey.toBase58()}`);
    const pendingData = await pendingRes.json();

    const pendingSalesMap: { [nftId: string]: string } = {};
    pendingData.saleRequests.forEach((req: any) => {
      pendingSalesMap[req.nftId] = req.marketStatus;
    });
    setPendingSales(pendingSalesMap);

    try {
      const res = await fetch("/api/pinata/nfts");
      if (!res.ok) throw new Error("Failed to fetch from Pinata");
      const pins = await res.json();

      const groupedByMint: Record<string, { json: any; cid: string; date: string }[]> = {};
      for (const pin of pins) {
        const url = `${process.env.NEXT_PUBLIC_GATEWAY_URL}${pin.ipfs_pin_hash}`;
        try {
          const head = await fetch(url, { method: "HEAD" });
          const contentType = head.headers.get("Content-Type");
          if (!contentType?.includes("application/json")) continue;

          const res = await fetch(url);
          const json = await res.json();
          const mint = json.mintAddress;
          if (!mint) continue;

          groupedByMint[mint] = groupedByMint[mint] || [];
          groupedByMint[mint].push({ json, cid: pin.ipfs_pin_hash, date: pin.date_pinned });
        } catch (err) {
          console.warn("Skipping invalid pin:", pin.ipfs_pin_hash, err);
        }
      }

      const result: NFT[] = [];
      for (const mint of Object.keys(groupedByMint)) {
        try {
          const sorted = groupedByMint[mint].sort(
            (a, b) =>
              new Date(b.json.updatedAt || b.date).getTime() -
              new Date(a.json.updatedAt || a.date).getTime()
          );
          const latest = sorted[0].json;
          const mintKey = new PublicKey(mint);
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
            mint: mintKey,
          });

          let ownsToken = tokenAccounts.value.some(
            (acc) => acc.account.data.parsed.info.tokenAmount.uiAmount >= 1
          );

          const metadataOwner =
            latest.attributes?.find((a: any) => a.trait_type === "Current Owner")?.value;

          if (!ownsToken && metadataOwner === wallet.publicKey.toBase58()) ownsToken = true;

          const seed =
            latest.seed ||
            latest.attributes?.find((a: any) => a.trait_type === "Escrow Seed")?.value ||
            Date.now();
          const [escrowPda] = await PublicKey.findProgramAddress(
            [Buffer.from("state"), new BN(seed).toArrayLike(Buffer, "le", 8)],
            program.programId
          );
          const vaultAta = await getAssociatedTokenAddress(mintKey, escrowPda, true);

          let isInEscrow = false;

          try {
            const balanceRes = await connection.getTokenAccountBalance(vaultAta);
            const balance = parseInt(balanceRes.value.amount);
            isInEscrow = balance > 0;
            console.log(`📦 Escrow balance for ${mint}:`, balance);
          } catch (err) {
            if (err instanceof Error) {
              console.warn(`⚠️ Failed to get escrow balance for ${mint}:`, err.message);
            } else {
              console.warn(`⚠️ Failed to get escrow balance for ${mint}:`, err);
            }
            isInEscrow = false;
          }


          console.log(`📦 Escrow status for ${mint}:`, isInEscrow ? "In Escrow" : "Not in Escrow");

          if (!ownsToken && !isInEscrow) continue;

          const marketStatus =
            latest.marketStatus ||
            latest.attributes?.find((a: any) => a.trait_type === "Market Status")?.value ||
            "inactive";
          const salePrice = parseFloat(
            latest.priceSol ||
              latest.attributes?.find((a: any) => a.trait_type === "Price")?.value ||
              "0"
          );

          // ⛑️ Check if this NFT is already in the salerequests collection
          const existingRes = await fetch(`/api/nft/checkSaleRequest?nftId=${mint}`);
          const existingSaleRequest = await existingRes.json();
          const mongoMarketStatus = existingSaleRequest?.marketStatus || marketStatus;

          if (!existingSaleRequest.exists && isInEscrow) {
            console.log("💾 Posting missing escrow to MongoDB");

            const pinCid = sorted[0].cid;

            await fetch("/api/nft/requestSale", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                nftId: mint,
                ipfs_pin_hash: pinCid, // ✅ FIXED
                seller: metadataOwner || wallet.publicKey.toBase58(),
                seed: Number(seed),
                initializerAmount: 1,
                takerAmount: 0,
                fileCid: latest.image?.split("/").pop() || "",
                salePrice,
                timestamp: new Date(latest.updatedAt || sorted[0].date).getTime(),
                marketStatus: "pending",
                buyer: wallet.publicKey.toBase58(),
              }),
            });
          }

          result.push({
            mintAddress: mint,
            title: latest.name || "Untitled",
            description: latest.description || "",
            image: latest.image || "",
            marketStatus: pendingSalesMap[mint] || marketStatus,
            fileCid: latest.image?.split("/").pop() || "",
            salePrice,
            metadataUri: `${process.env.NEXT_PUBLIC_GATEWAY_URL}${sorted[0].cid}`,
            isInEscrow,
            isRequested: marketStatus === "requested",
            seed: Number(seed),

            // Add fallbacks for NFTCard
            nftId: mint,
            timestamp: new Date(latest.updatedAt || sorted[0].date).getTime(),
            seller: metadataOwner || wallet.publicKey.toBase58(), // fallback
          });
          
        } catch (e) {
          console.warn(`⚠️ Skipping ${mint} due to error:`, e);
        }
      }

      setNfts(result);
    } catch (err) {
      console.error("❌ Error loading NFTs:", err);
      setNotification("Failed to fetch your NFTs.");
    }
  };

  useEffect(() => {
    fetchNFTs();
  }, [wallet.publicKey, metaplex, program]);

  const handleListNFT = async (nft: NFT & { seed?: number }) => {
    if (!wallet.publicKey || !program || !metaplex) {
      setNotification("Wallet or program not connected.");
      return;
    }

    const confirm = window.confirm(
      "⚠️ Please do not close or refresh the page while depositing your NFT into escrow.\n\nClick OK to continue."
    );
    if (!confirm) return;

    setLoadingMint(nft.mintAddress);
    try {
      const nftMint = new PublicKey(nft.mintAddress);
      const sellerNftAta = await getAssociatedTokenAddress(nftMint, wallet.publicKey);
      const ataInfo = await connection.getAccountInfo(sellerNftAta);
      if (!ataInfo) throw new Error("NFT ATA is missing. Please mint or transfer your NFT.");

      const balance = Number((await connection.getTokenAccountBalance(sellerNftAta)).value.uiAmount);
      if (balance < 1) throw new Error("You must own the NFT before listing it.");

      const salePriceLamports = Math.floor(nft.salePrice * LAMPORTS_PER_SOL);
      const seed = Date.now();
      nft.seed = seed;

      const [escrowPda] = await PublicKey.findProgramAddress(
        [Buffer.from("state"), new BN(seed).toArrayLike(Buffer, "le", 8)],
        program.programId
      );
      const vaultAta = await getAssociatedTokenAddress(nftMint, escrowPda, true);

      console.warn("⚠️ Save this seed temporarily in case anything goes wrong:", seed);
      localStorage.setItem(`lastSeed_${nft.mintAddress}`, seed.toString());
      alert(
        `✅ NFT is being submitted for escrow.\n\nImportant: Save this number in case something goes wrong:\n\nSeed: ${seed}`
      );

      await program.methods
        .initialize(
          new BN(seed),
          new BN(1),
          new BN(0),
          nft.fileCid,
          wallet.publicKey,
          new BN(salePriceLamports),
          wallet.publicKey
        )
        .accounts({
          admin: wallet.publicKey,
          seller: wallet.publicKey,
          mintA: new PublicKey(FUNDS_MINT),
          mintB: nftMint,
          sellerAtaA: await getAssociatedTokenAddress(new PublicKey(FUNDS_MINT), wallet.publicKey),
          sellerAtaB: sellerNftAta,
          escrow: escrowPda,
          vault: vaultAta,
          associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      // Assuming you already fetched Pinata metadata during fetchNFTs()
      const pinCid = nft.metadataUri?.replace(process.env.NEXT_PUBLIC_GATEWAY_URL || "", "");

      await fetch("/api/nft/requestSale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nftId: nft.mintAddress,
          ipfs_pin_hash: pinCid, // ✅ Required field
          seller: wallet.publicKey.toBase58(),
          seed,
          initializerAmount: 1,
          takerAmount: 0,
          fileCid: nft.fileCid,
          salePrice: salePriceLamports,
          timestamp: Date.now(),
          marketStatus: "pending",
          buyer: wallet.publicKey.toBase58(),
        }),
      });

      setNotification("✅ NFT submitted successfully! Awaiting admin approval.");
      alert("🎉 Success! Your NFT has been submitted. Please wait for admin approval.");
      await fetchNFTs();
    } catch (err: any) {
      console.error("[handleListNFT] Failed:", err);
      setNotification(err.message);
    } finally {
      setLoadingMint(null);
    }
  };

  return (
    <>

      <div className={styles.container}>

        <div className={styles.tabContainer}>
          <button className={activeTab === "My NFTs" ? styles.activeTab : ""} onClick={() => setActiveTab("My NFTs")}>
            My NFTs
          </button>
          <button className={activeTab === "Request Metadata Change" ? styles.activeTab : ""} onClick={() => setActiveTab("Request Metadata Change")}>
            Request Metadata Change
          </button>
          <button className={activeTab === "Request NFT Mint" ? styles.activeTab : ""} onClick={() => setActiveTab("Request NFT Mint")}>
            Request NFT Mint
          </button>
        </div>

        {/* <h1>User Dashboard</h1>

        <p>{wallet.publicKey ? `Connected Wallet Address: ${wallet.publicKey.toBase58()}` : "Not connected"}</p> */}

        {notification && <p>{notification}</p>}

        {activeTab === "My NFTs" && (
          <>
            <div className={styles.nftGrid}>
              {nfts.map((nft, i) => (
                <div key={i} className={styles.cardWrapper}>
                  <NFTCard nft={nft} onClick={() => setSelectedNFT(nft)} />

                  <div className={styles.sellerActions}>
                    <p className={styles.tooltipWrapper} data-tooltip="The price of this NFT">
                      <SiSolana/>{nft.salePrice}<IoMdInformationCircle className={styles.infoIcon} />
                    </p>
                    <p className={styles.tooltipWrapper} data-tooltip="The current holding status of this NFT if its in escrow or not">
                      {nft.isInEscrow ? "In Escrow" : "Holding NFT"} 
                      <IoMdInformationCircle className={styles.infoIcon} />
                    </p>
                    
                    { nft.marketStatus === "pending" ? (
                      <div
                        className={styles.tooltipWrapper}
                        data-tooltip="This NFT is waiting for admin approval before it can be listed"
                      >
                        <p>Awaiting admin approval<IoMdInformationCircle className={styles.infoIcon} /></p>
                      </div>
                    ) : nft.isInEscrow || nft.marketStatus === "active" ? (
                      <div
                        className={styles.tooltipWrapper}
                        data-tooltip="This NFT is active in the LuxHub marketplace"
                      >
                        <p>Listed in marketplace <IoMdInformationCircle className={styles.infoIcon} /></p>
                      </div>
                    ) : (
                      <button
                        className={styles.tooltipButton}
                        data-tooltip="Submit your NFT for admin approval"
                        onClick={() => handleListNFT(nft)}
                        disabled={loadingMint === nft.mintAddress}
                      >
                        {loadingMint === nft.mintAddress ? "Processing..." : "Request Listing"}
                      </button>
                    )}

                  </div>
                </div>
              ))}
            </div>
            {selectedNFT && (
              <div className={styles.overlay}>
                <div className={styles.detailContainer}>
                  <NftDetailCard metadataUri={selectedNFT.metadataUri} onClose={() => setSelectedNFT(null)} />
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === "Request Metadata Change" && (
            <div style={{ marginTop: "30px" }}>
              <NFTChangeRequestForm
                nfts={nfts.filter(nft =>
                  !nft.isInEscrow && nft.marketStatus !== "requested" && nft.marketStatus !== "active" && nft.marketStatus !== "pending"
                )}
              />
            </div>
        )}

        {activeTab === "Request NFT Mint" && (
            <div style={{ marginTop: "30px" }}>
              <MintRequestForm />
            </div>
        )}

      </div>

    </>
  );
};

export default SellerDashboard;