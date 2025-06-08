import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { PublicKey, Connection, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction } from "@solana/web3.js";
import styles from "../../styles/VendorProfilePage.module.css";
import NFTCard from "../../components/marketplace/NFTCard";
import { NftDetailCard } from "../../components/marketplace/NftDetailCard";
import { useWallet } from "@solana/wallet-adapter-react";
import { getProgram } from "../../utils/programUtils";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createSyncNativeInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { IoMdInformationCircle } from "react-icons/io";
import { SiSolana } from "react-icons/si";
import { FaCopy, FaGlobe, FaInstagram, FaRegCircleCheck, FaXTwitter } from "react-icons/fa6";

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs/";
const FUNDS_MINT = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = 1_000_000_000;

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
  attributes?: { trait_type: string; value: string }[];
}

const VendorProfilePage = () => {
  const router = useRouter();
  const { query } = router;
  const wallet = useWallet();
  const [profile, setProfile] = useState<any>(null);
  const [nftData, setNftData] = useState<NFT[]>([]);
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMint, setLoadingMint] = useState<string | null>(null);

  const connection = useMemo(() => new Connection(process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || "https://api.devnet.solana.com"), []);
  const program = useMemo(() => (wallet.publicKey ? getProgram(wallet) : null), [wallet.publicKey]);

  useEffect(() => {
    if (!query.wallet) return;

    const fetchProfile = async () => {
      const res = await fetch(`/api/vendor/profile?wallet=${query.wallet}`);
      const data = await res.json();
      setProfile(data?.error ? null : data);
    };

    fetchProfile();
  }, [query.wallet]);

  useEffect(() => {
    if (!profile?.wallet) return;

    const fetchNFTs = async () => {
      const res = await fetch("/api/pinata/nfts");
      const pins = await res.json();

      const grouped: Record<string, { json: any; cid: string; date: string }[]> = {};

      for (const pin of pins) {
        try {
          const url = `${GATEWAY}${pin.ipfs_pin_hash}`;
          const head = await fetch(url, { method: "HEAD" });
          if (!head.headers.get("Content-Type")?.includes("application/json")) continue;

          const json = await (await fetch(url)).json();
          const mint = json.mintAddress;
          const isOwner = json.currentOwner === profile.wallet || json.attributes?.find((a: any) => a.trait_type === "Current Owner")?.value === profile.wallet;
          const isSeller = json.seller === profile.wallet;
          if (!mint || (!isOwner && !isSeller)) continue;

          grouped[mint] = grouped[mint] || [];
          grouped[mint].push({ json, cid: pin.ipfs_pin_hash, date: pin.date_pinned });
        } catch {}
      }

      const result: NFT[] = Object.entries(grouped).map(([mint, versions]) => {
        const latest = versions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].json;
        return {
          mintAddress: mint,
          title: latest.name || "Untitled",
          description: latest.description || "",
          image: latest.image || "/fallback-nft.png",
          priceSol: parseFloat(latest.priceSol || latest.attributes?.find((a: any) => a.trait_type === "Price")?.value || "0"),
          metadataUri: `${GATEWAY}${versions[0].cid}`,
          currentOwner: latest.currentOwner || latest.attributes?.find((a: any) => a.trait_type === "Current Owner")?.value || profile.wallet,
          marketStatus: latest.marketStatus || latest.attributes?.find((a: any) => a.trait_type === "Market Status")?.value || "inactive",
          nftId: mint,
          fileCid: latest.image?.split("/").pop() || "",
          timestamp: Date.now(),
          seller: latest.seller || profile.wallet,
          attributes: latest.attributes || [],
        };
      });

      setNftData(result);
    };

    fetchNFTs();
  }, [profile]);

  const handlePurchase = async (nft: NFT) => {
    if (!wallet.publicKey || !program) return alert("Connect wallet first.");
    if (!confirm(`Purchase ${nft.title} for ${nft.priceSol} SOL?`)) return;

    setLoadingMint(nft.mintAddress);

    try {
      const buyer = wallet.publicKey;
      const nftMint = new PublicKey(nft.mintAddress);
      const fundsMint = new PublicKey(FUNDS_MINT);
      const priceLamports = Math.floor(nft.priceSol * LAMPORTS_PER_SOL);

      const buyerFundsAta = await getAssociatedTokenAddress(fundsMint, buyer);
      const buyerNftAta = await getAssociatedTokenAddress(nftMint, buyer);
      const buyerFundsInfo = await connection.getAccountInfo(buyerFundsAta);
      const buyerNftInfo = await connection.getAccountInfo(buyerNftAta);

      const balance = await connection.getBalance(buyer);
      if (balance < priceLamports + 1_000_000) throw new Error("Not enough SOL.");

      const preIx: TransactionInstruction[] = [];

      if (!buyerFundsInfo) preIx.push(createAssociatedTokenAccountInstruction(buyer, buyerFundsAta, buyer, fundsMint));
      if (!buyerNftInfo) preIx.push(createAssociatedTokenAccountInstruction(buyer, buyerNftAta, buyer, nftMint));

      preIx.push(
        SystemProgram.transfer({ fromPubkey: buyer, toPubkey: buyerFundsAta, lamports: priceLamports }),
        createSyncNativeInstruction(buyerFundsAta)
      );

      const escrowAccounts = await (program.account as any).escrow.all([{ memcmp: { offset: 113, bytes: nft.mintAddress } }]);
      if (escrowAccounts.length !== 1) throw new Error("Escrow not found.");
      const escrowPda = escrowAccounts[0].publicKey;
      const vault = await getAssociatedTokenAddress(fundsMint, escrowPda, true);

      if (!(await connection.getAccountInfo(vault))) {
        preIx.push(createAssociatedTokenAccountInstruction(buyer, vault, escrowPda, fundsMint));
      }

      await program.methods
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

      alert("✅ Success!");
    } catch (e: any) {
      alert("❌ Error: " + e.message);
    } finally {
      setLoadingMint(null);
    }
  };

  if (error) return <p>{error}</p>;
  if (!profile) return <p>Loading profile...</p>;

  return (
    <div className={styles.profileContainer}>
      {profile?.bannerUrl && (
        <img src={profile.bannerUrl} className={styles.profileBanner} />
      )}
      {profile?.avatarUrl && (
        <img src={profile.avatarUrl} className={styles.profileAvatar} />
      )}
      <div className={styles.profileHeader}>
        <h1 className={styles.nameHeader}>
          {profile.name}
          {profile.verified && <FaRegCircleCheck  className={styles.verifiedIcon} />}
        </h1>
        <p className={styles.profileUsername}>@{profile.username}</p>
        <div className={styles.profileWallet}>
          <a className={styles.tooltipButton} data-tooltip="View on Solscan" href={`https://solscan.io/account/${profile.wallet}`} target="_blank" rel="noopener noreferrer">
            {profile.wallet.slice(0,4)}...{profile.wallet.slice(-4)}
          </a>
          <div className={styles.walletActions}>
              <a
                href={`https://solscan.io/account/${profile.wallet}?cluster=devnet`} // use `?cluster=mainnet-beta` if you're on mainnet
                target="_blank"
                rel="noopener noreferrer"
                className={styles.solscanLink}
                title="Visit on Solscan"
              >
                <FaGlobe />
              </a>
              <div
                className={styles.copyIcon}
                onClick={() => navigator.clipboard.writeText(profile.wallet)}
                title="Copy Address to clipboard"
              >
                <FaCopy/>
              </div>
           </div>
        </div>
        <p className={styles.profileBio}>{profile.bio}</p>
        <div className={styles.socialLinks}>
          {profile.socialLinks?.x && (
            <a
              href={profile.socialLinks.x}
              target="_blank"
              rel="noreferrer"
              className={styles.iconLink}
            >
              <FaXTwitter />
            </a>
          )}
          {profile.socialLinks?.instagram && (
            <a
              href={profile.socialLinks.instagram}
              target="_blank"
              rel="noreferrer"
              className={styles.iconLink}
            >
              <FaInstagram />
            </a>
          )}

          {profile.socialLinks?.website && (
            <a
              href={profile.socialLinks.website}
              target="_blank"
              rel="noreferrer"
              className={styles.iconLink}
            >
              <FaGlobe />
            </a>
          )}
        </div>
        {wallet.publicKey?.toBase58() === profile.wallet && (
          <button
          className={styles.dashboardButton}
          onClick={() => router.push("/vendor/vendorDashboard")}
          >
            Go to Dashboard
          </button>
        )}
      </div>

      {nftData.length > 0 ? (
        <div className={styles.nftSection}>
          <h3>Available Watches</h3>
          <div className={styles.nftGrid}>
            {nftData.map((nft, index) => (
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
                      Make Offer
                    </button>
                  ): nft.marketStatus === "inactive" ? (
                    <div className={styles.tooltipWrapper} data-tooltip="Submit your NFT for admin approval">
                      <p>Listed in marketplace<IoMdInformationCircle className={styles.infoIcon} /></p>
                    </div>
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
                    {nft.marketStatus === "active" ? "Available" : "Holding"}
                    <IoMdInformationCircle className={styles.infoIcon} />
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p style={{ marginTop: 20 }}>No items listed yet.</p>
      )}

      {selectedNFT && (
        <div className={styles.overlay}>
          <div className={styles.detailContainer}>
            <button onClick={() => setSelectedNFT(null)}>Close</button>
            <NftDetailCard
              mintAddress={selectedNFT.mintAddress}
              metadataUri={selectedNFT.metadataUri}
              onClose={() => setSelectedNFT(null)}
            />
          </div>
        </div>
      )}
    </div>
  );

};

export default VendorProfilePage;
