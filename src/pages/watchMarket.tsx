// src/pages/WatchMarket.tsx
import React, { useEffect, useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Connection,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { getProgram } from "../utils/programUtils";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  AccountLayout,
  createSyncNativeInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Metaplex, walletAdapterIdentity } from "@metaplex-foundation/js";
import { NftDetailCard } from "../components/marketplace/NftDetailCard";
import styles from "../styles/WatchMarket.module.css";
import { IoMdInformationCircle } from "react-icons/io";
import { SiSolana } from "react-icons/si";
import NFTCard from "../components/marketplace/NFTCard";
import FilterSortPanel from "../components/marketplace/FilterSortPanel";
import { CiSearch } from "react-icons/ci";
import { FaAngleRight } from "react-icons/fa6";

interface NFT {
  title: string;
  description: string;
  image: string;
  priceSol: number;
  mintAddress: string;
  metadataUri: string;
  currentOwner: string;
  marketStatus: string;

  nftId: string;
  fileCid: string;
  timestamp: number;
  seller: string;
  
  attributes?: {
    trait_type: string;
    value: string;
  }[];
  salePrice?: number;
}

type FilterOptions = {
  brands: string[];
  materials: string[];
  colors: string[];
  sizes: string[];
  categories: string[];
};


const FUNDS_MINT = "So11111111111111111111111111111111111111112";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const Marketplace = () => {

  const wallet = useWallet();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);
  const [loadingMint, setLoadingMint] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");

  const [showFilters, setShowFilters] = useState(false);
  const [sortOption, setSortOption] = useState<"price_low" | "price_high" | "latest">("latest");

  const [filters, setFilters] = useState<FilterOptions>({
    brands: [],
    materials: [],
    colors: [],
    sizes: [],
    categories: []
  });

  const filteredNfts = useMemo(() => {
    return nfts
      .filter((nft) => {
        const brand = nft.attributes?.find(attr => attr.trait_type === "Brand")?.value ?? "";
        const material = nft.attributes?.find(attr => attr.trait_type === "Material")?.value ?? "";
        const color = nft.attributes?.find(attr => attr.trait_type === "Dial Color")?.value ?? "";
        const size = nft.attributes?.find(attr => attr.trait_type === "Case Size")?.value ?? "";
        const category = nft.attributes?.find(attr => attr.trait_type === "Category")?.value ?? "";

        const matchesFilters =
          (!filters.brands.length || filters.brands.includes(brand)) &&
          (!filters.materials.length || filters.materials.includes(material)) &&
          (!filters.colors.length || filters.colors.includes(color)) &&
          (!filters.sizes.length || filters.sizes.includes(size)) &&
          (!filters.categories.length || filters.categories.includes(category));

        const matchesSearch =
          !searchQuery ||
          brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
          nft.mintAddress.toLowerCase().includes(searchQuery.toLowerCase());

        return matchesFilters && matchesSearch;
      })
      .sort((a, b) => {
        if (a.marketStatus === "active" && b.marketStatus !== "active") return -1;
        if (a.marketStatus !== "active" && b.marketStatus === "active") return 1;
        if (sortOption === "price_low") return a.priceSol - b.priceSol;
        if (sortOption === "price_high") return b.priceSol - a.priceSol;
        if (sortOption === "latest") return b.timestamp - a.timestamp;
        return 0;
      });
  }, [nfts, filters, searchQuery, sortOption]);

  // Create a connection to the devnet endpoint.
  const connection = useMemo(
    () =>
      new Connection(
        process.env.NEXT_PUBLIC_ENDPOINT || "https://api.devnet.solana.com"
      ),
    []
  );

  const metaplex = useMemo(() => {
    if (wallet.publicKey) {
      return Metaplex.make(connection).use(walletAdapterIdentity(wallet));
    }
    return null;
  }, [wallet.publicKey, connection]);

  const program = useMemo(() => {
    return wallet.publicKey ? getProgram(wallet) : null;
  }, [wallet.publicKey]);

  // ------------------------------------------------
  // 1. Fetch NFTs from Pinata, show only "active" ones.
  // ------------------------------------------------
  const fetchNFTs = async () => {

    if (!wallet.publicKey || !metaplex) return;
    let isCancelled = false;
  
    try {
      
      const res = await fetch("/api/pinata/nfts");
      if (!res.ok) throw new Error("Failed to fetch NFT data");

      const data: any[] = await res.json();
      console.log("📦 Raw Pinata data received:", data);
  
      const seenMintAddresses = new Set<string>();
      const nftList: NFT[] = [];
  
      for (const nftItem of data) {
        const ipfsHash = nftItem.ipfs_pin_hash;
        try {

          const pinnedRes = await fetch(
            `${process.env.NEXT_PUBLIC_GATEWAY_URL}${ipfsHash}`
          );

          if (!pinnedRes.ok) {
            console.warn(`⚠️ Skipping ${ipfsHash}: Response not OK`);
            continue;
          }

          const pinnedData = await pinnedRes.json();
          if (!pinnedData.mintAddress) continue;

          if (seenMintAddresses.has(pinnedData.mintAddress)) continue;
          seenMintAddresses.add(pinnedData.mintAddress);
  
          let onChainNFT;

          try {
            // Fetch the NFT from the blockchain using its mint address
            onChainNFT = await metaplex.nfts().findByMint({
              mintAddress: new PublicKey(pinnedData.mintAddress),
            });
          } catch {
            continue;
          }
  
          const updatedMetadata = onChainNFT.json;
          if (!updatedMetadata) continue;
  
          const marketStatus =
            updatedMetadata.attributes?.find(
              (attr: any) => attr.trait_type === "Market Status"
            )?.value || "inactive";
  
          const validStatuses = ["active", "Holding LuxHub"];
          if (!validStatuses.includes(marketStatus)) continue;
  
          const priceAttr = updatedMetadata.attributes?.find(
            (attr: any) => attr.trait_type === "Price"
          );
          const extractedPriceSol = parseFloat(priceAttr?.value || "0");

          const priceAttrValue =
            typeof priceAttr?.value === "string" ? priceAttr.value : "0";
          // const extractedPriceSol = parseFloat(priceAttrValue);

          const currentOwner =
          updatedMetadata.attributes?.find(
            (attr: any) => attr.trait_type === "Current Owner"
          )?.value || "Unknown";

  
          await delay(250);
  
          nftList.push({
            title: updatedMetadata.name || "Untitled",
            description: updatedMetadata.description || "No description provided.",
            image: updatedMetadata.image || "",
            priceSol: extractedPriceSol,
            mintAddress: pinnedData.mintAddress,
            metadataUri: onChainNFT.uri,
            currentOwner,
            marketStatus,
            nftId: "",
            fileCid: "",
            timestamp: Date.now(),
            seller: "",
            attributes: (updatedMetadata.attributes || [])
              .filter((attr: any) => attr.trait_type && attr.value)
              .map((attr: any) => ({
                trait_type: attr.trait_type as string,
                value: attr.value as string,
              }))
          });
        } catch (err) {
          console.error(`❌ Error processing NFT with IPFS hash ${ipfsHash}:`, err);
        }
      }
  
      if (!isCancelled) {
        console.log("🔎 Active NFTs after filtering:", nftList);
        setNfts(nftList);
      }
    } catch (error) {
      console.error("❌ Error fetching NFTs:", error);
    }
  };
  
  useEffect(() => {
    fetchNFTs();
  }, [wallet.publicKey, metaplex]);

  // ------------------------------------------------
  // 2. Purchase Handler
  // ------------------------------------------------
  const handlePurchase = async (nft: NFT) => {
    
    if (!wallet.publicKey || !program) {
      alert("Please connect your wallet.");
      return;
    }
  
    if (!window.confirm(`Purchase ${nft.title} for ${nft.priceSol} SOL?`)) return;
    setLoadingMint(nft.mintAddress);

    try {
      const buyer = wallet.publicKey;
      const nftMint = new PublicKey(nft.mintAddress);
      const fundsMint = new PublicKey(FUNDS_MINT); // So111... is wSOL
      const LAMPORTS_PER_SOL = 1_000_000_000;
      const priceLamports = Math.floor(nft.priceSol * LAMPORTS_PER_SOL);
  
      // Prepare ATAs
      const buyerFundsAta = await getAssociatedTokenAddress(fundsMint, buyer);
      const buyerNftAta = await getAssociatedTokenAddress(nftMint, buyer);
      const vaultAta = await getAssociatedTokenAddress(fundsMint, buyer, true);
  
      const buyerFundsAtaInfo = await connection.getAccountInfo(buyerFundsAta);
      const buyerNftAtaInfo = await connection.getAccountInfo(buyerNftAta);
  
      const balance = await connection.getBalance(buyer);
      const preIx: TransactionInstruction[] = [];
  
      if (balance < priceLamports + 1_000_000) {
        throw new Error(`Insufficient SOL balance. Required: ${priceLamports}, Found: ${balance}`);
      }
  
      // Create buyer wSOL ATA if missing
      if (!buyerFundsAtaInfo) {
        console.log("Creating buyer wSOL ATA...");
        preIx.push(
          createAssociatedTokenAccountInstruction(buyer, buyerFundsAta, buyer, fundsMint)
        );
      }
  
      // Create buyer NFT ATA if missing
      if (!buyerNftAtaInfo) {
        console.log("Creating buyer NFT ATA...");
        preIx.push(
          createAssociatedTokenAccountInstruction(buyer, buyerNftAta, buyer, nftMint)
        );
      }
  
      // Wrap SOL into wSOL
      preIx.push(
        SystemProgram.transfer({
          fromPubkey: buyer,
          toPubkey: buyerFundsAta,
          lamports: priceLamports,
        }),
        createSyncNativeInstruction(buyerFundsAta)
      );
  
      // Fetch escrow PDA
      const escrowAccounts = await (program.account as any).escrow.all([
        { memcmp: { offset: 113, bytes: nft.mintAddress } },
      ]);
      if (escrowAccounts.length !== 1) {
        throw new Error("Could not uniquely identify escrow account for this NFT.");
      }
  
      const escrowPda = escrowAccounts[0].publicKey;
      const vault = await getAssociatedTokenAddress(fundsMint, escrowPda, true);
      const vaultExists = await connection.getAccountInfo(vault);
  
      if (!vaultExists) {
        console.log("Creating escrow vault ATA...");
        preIx.push(
          createAssociatedTokenAccountInstruction(buyer, vault, escrowPda, fundsMint)
        );
      }
  
      console.log("📦 Sending exchange()...");
      const tx = await program.methods
        .exchange()
        .preInstructions(preIx)
        .accounts({
          taker: buyer,
          mintA: fundsMint,
          mintB: nftMint,
          takerFundsAta: buyerFundsAta,
          takerNftAta: buyerNftAta,
          vault,
          escrow: escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();
  
      alert("✅ Purchase successful! Tx: " + tx);
  
      // Update DB
      await fetch("/api/nft/updateBuyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyer: buyer.toBase58(),
          mintAddress: nft.mintAddress,
          vaultAta: vault.toBase58(),
          priceSol: nft.priceSol,
        }),
      });
  
      await delay(1000);
      fetchNFTs();
    } catch (err: any) {
      console.error("❌ Purchase failed:", err);
      alert("Purchase failed: " + err.message);
    } finally {
      setLoadingMint(null);
    }
  };
  

  return (
    <div className={styles.container}>
      <h1>Marketplace</h1>

      <div className={styles.inputGroupContainer}>
        <div className={styles.inputGroup}>
          <div className={styles.searchContainer}>
            <button><CiSearch className={styles.searchIcon} /></button>
            <input
              type="text"
              placeholder="Search by brand or mint address"
              className={styles.searchBar}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className={styles.clearButton}>
                ×
              </button>
            )}
          </div>
        </div>
      </div>


      <button className={styles.filterToggle} onClick={() => setShowFilters(true)}>Filters<FaAngleRight /></button>

      {showFilters && (
        <FilterSortPanel
          onFilterChange={(filters) => setFilters((prev) => ({ ...prev, ...filters }))}
          onSortChange={setSortOption}
          currentSort={sortOption}
          onClose={() => setShowFilters(false)}
        />
      )}

      {nfts.length === 0 ? (
        <p>No active NFTs available for sale at the moment.</p>
      ) : (
        <div className={styles.nftGrid}>
          {filteredNfts.map((nft, index) => (
            <div key={index} className={styles.cardWrapper}>
              <NFTCard nft={nft} onClick={() => setSelectedNFT(nft)} />
              <div className={styles.sellerActions}>
                {nft.marketStatus === "pending" ? (
                  <div className={styles.tooltipWrapper} data-tooltip="This NFT is waiting for admin approval before it can be listed">
                    <p>Awaiting admin approval<IoMdInformationCircle className={styles.infoIcon} /></p>
                  </div>
                ) : nft.marketStatus === "requested" ? (
                  <div className={styles.tooltipWrapper} data-tooltip="Submit your NFT for admin approval">
                    <p>Listed in marketplace<IoMdInformationCircle className={styles.infoIcon} /></p>
                  </div>
                ) : nft.marketStatus === "Holding LuxHub" ? (
                  <button
                    className={styles.contactButton}
                    data-tooltip="Reach out to the current owner to make an offer"
                    onClick={() => window.open(`https://explorer.solana.com/address/${nft.currentOwner}?cluster=devnet`, "_blank")}
                  >
                    Contact Owner
                  </button>
                ) : (
                  <button
                    className={styles.tooltipButton}
                    data-tooltip="This LuxHub NFT is in escrow ready for purchase"
                    onClick={() => handlePurchase(nft)}
                    disabled={loadingMint === nft.mintAddress}
                  >
                    {loadingMint === nft.mintAddress ? "Processing..." : "BUY"}
                  </button>
                )}

                <div className={styles.tooltipWrapper} data-tooltip="The price of this NFT">
                  <p className={styles.priceInfo}><SiSolana/>{nft.priceSol}<IoMdInformationCircle className={styles.infoIcon} /></p>
                </div>

                <p className={styles.tooltipWrapper} data-tooltip="The current holding status of this NFT in the marketplace">
                  {nft.marketStatus === "active" ? "Available" : "Offer"}
                  <IoMdInformationCircle className={styles.infoIcon} />
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      {selectedNFT && (
        <div className={styles.overlay}>
          <div className={styles.detailContainer}>
            <button onClick={() => setSelectedNFT(null)}>Close</button>
            <NftDetailCard mintAddress={selectedNFT.mintAddress} metadataUri={selectedNFT.metadataUri} onClose={() => setSelectedNFT(null)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Marketplace;
