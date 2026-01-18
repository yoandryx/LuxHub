// src/pages/createNFT.tsx
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
} from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { mplCore } from "@metaplex-foundation/mpl-core";
import { generateSigner } from "@metaplex-foundation/umi";
import { create as createAsset } from "@metaplex-foundation/mpl-core";
import { update as updateAsset, fetchAsset } from "@metaplex-foundation/mpl-core";
import { uploadToPinata } from "../utils/pinata";
import { createMetadata } from "../utils/metadata";
import { NftDetailCard } from "../components/marketplace/NftDetailCard";
import { NftForm } from "../components/admins/NftForm";
import styles from "../styles/CreateNFT.module.css";
import type { WalletAdapter } from "@solana/wallet-adapter-base";

import NFTPreviewCard from "../components/admins/NFTPreviewCard";
import { FaCopy } from "react-icons/fa";
import csvParser from "csv-parser";
import pLimit from "p-limit";

import bs58 from "bs58";

// Extended MintedNFT interface with optional ipfs_pin_hash and marketStatus fields.
interface MintedNFT {
  title: string;
  description: string;
  image: string;
  priceSol: number;
  metadataUri: string;
  mintAddress?: string;    
  currentOwner?: string;   
  ipfs_pin_hash?: string;  
  marketStatus?: string;   
  updatedAt?: string;     
}

// CSV Row interface (for bulk)
interface CsvRow {
  model: string;
  serialNumber: string;
  // Add all possible columns with optional
  [key: string]: string | undefined;
}

// Define a fallback gateway constant.
const fallbackGateway = "https://gateway.pinata.cloud/ipfs/";

type Props = {
  initialMintedNFTs: MintedNFT[];
  initialSolPrice: number;
};

const CreateNFT = ({ initialMintedNFTs, initialSolPrice }: Props) => {
  const wallet = useWallet();
  const adminWallet = wallet.publicKey?.toBase58() || "";

  const [features, setFeatures] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"mint" | "minted" | "transferred">("mint");

  const [fileCid, setFileCid] = useState("");
  const [priceSol, setPriceSol] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [material, setMaterial] = useState("");
  const [productionYear, setProductionYear] = useState("");
  const [limitedEdition, setLimitedEdition] = useState("");
  const [certificate, setCertificate] = useState("");
  const [warrantyInfo, setWarrantyInfo] = useState("");
  const [provenance, setProvenance] = useState(adminWallet);
  const [marketStatus, setMarketStatus] = useState("inactive");

  const [movement, setMovement] = useState("");
  const [caseSize, setCaseSize] = useState("");
  const [waterResistance, setWaterResistance] = useState("");
  const [dialColor, setDialColor] = useState("");
  const [country, setCountry] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [boxPapers, setBoxPapers] = useState("");
  const [condition, setCondition] = useState("");

  const [minting, setMinting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");

  const [mintedNFTs, setMintedNFTs] = useState<MintedNFT[]>(initialMintedNFTs);
  const [selectedMetadataUri, setSelectedMetadataUri] = useState<string | null>(null);
  const [transferInputs, setTransferInputs] = useState<{ [key: string]: string }>({});
  const [showPreview, setShowPreview] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [bulkCsvFile, setBulkCsvFile] = useState<File | null>(null);
  const [editingNft, setEditingNft] = useState<MintedNFT | null>(null);
  const [poolEligible, setPoolEligible] = useState(false);
  const [currentVendorId, setCurrentVendorId] = useState<string>("luxhub_owned");

  const [solPrice, setSolPrice] = useState(initialSolPrice);

  useEffect(() => {
    // Placeholder - replace with real oracle call if needed
    setSolPrice(150);
  }, []);

  const handleTransferInputChange = (key: string, value: string) => {
    setTransferInputs((prev) => ({ ...prev, [key]: value }));
  };

  const isValidSolanaAddress = (address: string): boolean => {
    try {
      const pubkey = new PublicKey(address);
      return PublicKey.isOnCurve(pubkey);
    } catch (e) {
      return false;
    }
  };  

  const handleCopy = (label: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1000);
  };

  const calculateLuxScore = (proofs: string[]) => {
    return proofs.length * 10;
  };

 const mintNFT = async () => {
    if (!wallet.publicKey) return alert("Connect wallet");

    setMinting(true);
    setProgress(0);
    setStatusMessage("Minting...");

    try {
      const umi = createUmi(process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || "https://api.devnet.solana.com")
        .use(walletAdapterIdentity(wallet))
        .use(mplCore());

      setProgress(10);
      setStatusMessage("Uploading metadata to Pinata...");

      const metadataJson = createMetadata(
        title,
        description,
        fileCid,
        wallet.publicKey.toBase58(),
        brand,
        model,
        serialNumber,
        material,
        productionYear,
        limitedEdition,
        certificate,
        warrantyInfo,
        provenance,
        movement,
        caseSize,
        waterResistance,
        dialColor,
        country,
        releaseDate,
        wallet.publicKey.toBase58(),
        marketStatus,
        priceSol,
        boxPapers,
        condition
      );

      const metadataUri = await uploadToPinata(metadataJson, title);
      setProgress(40);

      setStatusMessage("Minting Core NFT...");
      const assetSigner = generateSigner(umi);
      const tx = await createAsset(umi, {
        asset: assetSigner,
        name: title,
        uri: metadataUri,
      }).sendAndConfirm(umi);

      const mintAddress = assetSigner.publicKey.toString();
      setProgress(100);
      setStatusMessage("Minted successfully!");

      // Optimistic UI update (DB save moved to API route)
      const newImage = fileCid ? `${process.env.NEXT_PUBLIC_GATEWAY_URL || fallbackGateway}${fileCid}` : "/fallback.png";
      setMintedNFTs(prev => [...prev, {
        title,
        description,
        image: newImage,
        priceSol,
        metadataUri,
        mintAddress,
        currentOwner: wallet.publicKey?.toBase58() || "",
        ipfs_pin_hash: fileCid,
        marketStatus,
      }]);

      // In mintNFT, after optimistic update
        try {
        const response = await fetch('/api/assets/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
            vendor: currentVendorId,
            model,
            serial: serialNumber,
            description,
            priceUSD: priceSol * solPrice,
            imageIpfsUrls: fileCid ? [fileCid] : [],
            metadataIpfsUrl: metadataUri,
            nftMint: mintAddress,
            nftOwnerWallet: wallet.publicKey?.toBase58(),
            status: marketStatus,
            poolEligible,
            }),
        });

        if (!response.ok) throw new Error('DB save failed');
        } catch (err) {
        console.error(err);
        // Rollback optimistic update on failure
        setMintedNFTs(prev => prev.filter(n => n.mintAddress !== mintAddress));
        setStatusMessage('Mint succeeded on-chain but DB save failed');
        }

      // TODO: Call /api/assets/create (or similar) to save to MongoDB
      // await fetch('/api/assets/create', { method: 'POST', body: JSON.stringify({ ... }) });

    } catch (error) {
      console.error(error);
      setStatusMessage("Mint failed");
    } finally {
      setMinting(false);
    }
  };

  const bulkMintFromCsv = async () => {
    if (!bulkCsvFile) return;
    setMinting(true);

    const limit = pLimit(3);
    const rows: CsvRow[] = [];

    const csvContent = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsText(bulkCsvFile);
    });

    csvContent.split('\n').forEach(line => {
      const row = line.split(',');
      rows.push({ model: row[0], serialNumber: row[1] /* etc */ });
    });

    const mintPromises = rows.map(row => limit(() => mintSingleFromRow(row)));
    await Promise.all(mintPromises);
    setMinting(false);
  };

  const mintSingleFromRow = async (row: CsvRow) => {
    // Dynamic mapping + mint logic (adapt for no DB save)
  };

  const updateNFT = async () => {
    if (!editingNft || !editingNft.mintAddress) return;

    setMinting(true);
    try {
      const umi = createUmi(process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || "https://api.devnet.solana.com")
        .use(walletAdapterIdentity(wallet))
        .use(mplCore());

      const updatedJson = createMetadata(
        title,
        description,
        fileCid,
        wallet.publicKey?.toBase58() || "",
        brand,
        model,
        serialNumber,
        material,
        productionYear,
        limitedEdition,
        certificate,
        warrantyInfo,
        provenance,
        movement,
        caseSize,
        waterResistance,
        dialColor,
        country,
        releaseDate,
        wallet.publicKey?.toBase58() || "",
        marketStatus,
        priceSol,
        boxPapers,
        condition
      );

      const newUri = await uploadToPinata(updatedJson, title);

      const asset = await fetchAsset(umi, editingNft.mintAddress);

      const updateTx = await updateAsset(umi, {
        asset,
        uri: newUri,
        // name: title, // Uncomment if you want to update on-chain name
      }).sendAndConfirm(umi);

      setStatusMessage("Updated successfully!");

      // Optimistic UI update
      const newImage = fileCid ? `${process.env.NEXT_PUBLIC_GATEWAY_URL || fallbackGateway}${fileCid}` : editingNft.image;
      setMintedNFTs(prev => prev.map(n => 
        n.mintAddress === editingNft.mintAddress ? {
          ...n,
          title,
          description,
          priceSol,
          metadataUri: newUri,
          image: newImage,
          ipfs_pin_hash: fileCid || n.ipfs_pin_hash,
          marketStatus,
        } : n
      ));

      // In updateNFT, after optimistic update
        try {
        const response = await fetch('/api/assets/update', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
            nftMint: editingNft.mintAddress,
            priceUSD: priceSol * solPrice,
            metadataIpfsUrl: newUri,
            imageIpfsUrls: fileCid ? [fileCid] : editingNft.ipfs_pin_hash ? [editingNft.ipfs_pin_hash] : [],
            status: marketStatus,
            }),
        });

        if (!response.ok) throw new Error('DB update failed');
        } catch (err) {
        console.error(err);
        // Optional: revert optimistic changes or refetch from DB
        setStatusMessage('Update succeeded on-chain but DB save failed');
        }

      // TODO: Call /api/assets/update to save changes to MongoDB

    } catch (error) {
      console.error("Update failed:", error);
      setStatusMessage("Update failed");
    } finally {
      setMinting(false);
      setEditingNft(null);
    }
  };

  const transferNftToSellerAuto = async (mintAddress: string, newOwner: string) => {
    console.log("Transfer to", newOwner);
    // TODO: Implement on-chain transfer + API call to update owner in DB
  };

  const startEditing = (nft: MintedNFT) => {
    setEditingNft(nft);
    // TODO: Populate form fields from nft (fetch metadata for full attributes if needed)
    setTitle(nft.title);
    setDescription(nft.description);
    setPriceSol(nft.priceSol);
    setMarketStatus(nft.marketStatus || "inactive");
    // Add more field population as needed
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.tabContainer}>
        <button className={activeTab === "mint" ? styles.activeTab : ""} onClick={() => setActiveTab("mint")}>
          Mint New NFT
        </button>
        <button className={activeTab === "minted" ? styles.activeTab : ""} onClick={() => setActiveTab("minted")}>
          Minted NFTs
        </button>
        <button className={activeTab === "transferred" ? styles.activeTab : ""} onClick={() => setActiveTab("transferred")}>
          Transferred NFTs
        </button>
      </div>

      {activeTab === "mint" && (
        <div className={styles.mainContent}>
          <div className={styles.mintCard}>
            <div className={styles.leftColumn}>
              <NftForm
                fileCid={fileCid}
                setFileCid={setFileCid}
                title={title}
                setTitle={setTitle}
                description={description}
                setDescription={setDescription}
                priceSol={priceSol}
                setPriceSol={setPriceSol}
                brand={brand}
                setBrand={setBrand}
                model={model}
                setModel={setModel}
                serialNumber={serialNumber}
                setSerialNumber={setSerialNumber}
                material={material}
                setMaterial={setMaterial}
                productionYear={productionYear}
                setProductionYear={setProductionYear}
                limitedEdition={limitedEdition}
                setLimitedEdition={setLimitedEdition}
                certificate={certificate}
                setCertificate={setCertificate}
                warrantyInfo={warrantyInfo}
                setWarrantyInfo={setWarrantyInfo}
                provenance={provenance}
                setProvenance={setProvenance}
                movement={movement}
                setMovement={setMovement}
                caseSize={caseSize}
                setCaseSize={setCaseSize}
                waterResistance={waterResistance}
                setWaterResistance={setWaterResistance}
                dialColor={dialColor}
                setDialColor={setDialColor}
                country={country}
                setCountry={setCountry}
                releaseDate={releaseDate}
                setReleaseDate={setReleaseDate}
                boxPapers={boxPapers}
                setBoxPapers={setBoxPapers}
                condition={condition}
                setCondition={setCondition}
                mintNFT={mintNFT}
                minting={minting}
                features={features}
                setFeatures={setFeatures}
              />
              <div className={styles.bulkUpload}>
                <input type="file" accept=".csv" onChange={(e) => setBulkCsvFile(e.target.files?.[0] || null)} />
                <button onClick={bulkMintFromCsv}>Bulk Mint from CSV</button>
              </div>
              <div>
                <label>
                  Pool Eligible?
                  <input type="checkbox" checked={poolEligible} onChange={(e) => setPoolEligible(e.target.checked)} />
                </label>
              </div>
              <button onClick={mintNFT}>Mint NFT</button>
              {editingNft && <button onClick={updateNFT}>Update NFT</button>}
            </div>
            <div className={styles.rightColumn}>
              <div className={styles.formTitle}>Lux.NFT Preview</div>
              <NFTPreviewCard
                fileCid={fileCid}
                title={title}
                description={description}
                priceSol={priceSol}
                brand={brand}
                onViewDetails={() => setShowPreview(true)}
              />
              {minting && (
                <div className={styles.mintProgressContainer}>
                  <p>{statusMessage}</p>
                  <div className={styles.progressBar}>
                    <div className={styles.progress} style={{ width: `${progress}%` }} />
                  </div>
                  <p>{progress}%</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "minted" && (
        <div className={styles.mintedSection}>
          <h2>Minted NFTs</h2>
          <div className={styles.grid}>
            {mintedNFTs.length > 0 ? (
              mintedNFTs.map((nft, index) => {
                const uniqueKey = `${nft.mintAddress ?? "nomint"}-${index}`;
                const newOwnerValue = transferInputs[uniqueKey] || "";
                const isCurrentUserOwner = nft.currentOwner === adminWallet;

                return (
                  <div key={uniqueKey} className={styles.nftCard}>
                    <img
                      src={nft.image?.startsWith("http") ? nft.image : "/fallback.png"}
                      alt={nft.title}
                    />
                    <h3>{nft.title}</h3>
                    <div className={styles.cardInfoHolder}>
                      <div className={styles.cardInfoHead}>Price:</div> 
                      <p>{nft.priceSol}</p>
                    </div>
                    {nft.marketStatus && (
                      <div className={styles.cardInfoHolder}>
                        <div className={styles.cardInfoHead}>Status:</div> 
                        <p>{nft.marketStatus}</p>
                      </div>
                    )}
                    {nft.mintAddress && (
                      <div className={styles.cardInfoHolder}>
                        <div className={styles.cardInfoHead}>Mint:</div>
                        <div className={styles.copyWrapper}>
                          <p
                            className={styles.copyableText}
                            onClick={() => handleCopy(`mint-${index}`, nft.mintAddress || "")}
                          >
                            {nft.mintAddress.slice(0, 4)}...{nft.mintAddress.slice(-4)} <FaCopy style={{ marginLeft: "6px" }} />
                            <span className={styles.tooltip}>
                              {copiedField === `mint-${index}` ? "Copied!" : "Copy Address"}
                            </span>
                          </p>
                        </div>
                      </div>
                    )}

                    {nft.currentOwner && (
                      <div className={styles.cardInfoHolder}>
                        <div className={styles.cardInfoHead}>Current Owner:</div>
                        <div className={styles.copyWrapper}>
                          <p
                            className={styles.copyableText}
                            onClick={() => handleCopy(`owner-${index}`, nft.currentOwner || "")}
                          >
                            {nft.currentOwner.slice(0, 4)}...{nft.currentOwner.slice(-4)} <FaCopy style={{ marginLeft: "6px" }} />
                            <span className={styles.tooltip}>
                              {copiedField === `owner-${index}` ? "Copied!" : "Copy Address"}
                            </span>
                          </p>
                        </div>
                      </div>
                    )}


                    {isCurrentUserOwner ? (
                      <div className={styles.transferSection}>
                        <div>NFT Transfer</div>
                        <input
                          className={styles.transferInput}
                          type="text"
                          placeholder="Seller's wallet address..."
                          value={newOwnerValue}
                          onChange={(e) => handleTransferInputChange(uniqueKey, e.target.value.trim())}
                        />
                        {newOwnerValue && !isValidSolanaAddress(newOwnerValue) && (
                          <p className={styles.transferWarning}>Invalid wallet address</p>
                        )}
                        <button
                          onClick={() => transferNftToSellerAuto(nft.mintAddress!, newOwnerValue)}
                          disabled={!isValidSolanaAddress(newOwnerValue)}
                        >
                          Transfer NFT to Seller
                        </button>
                      </div>
                    ) : (
                      <p style={{ color: "red" }}>Only the NFT owner can transfer this item.</p>
                    )}
                    <button onClick={() => setSelectedMetadataUri(nft.metadataUri)}>
                      View Details
                    </button>
                    <button onClick={() => startEditing(nft)}>Edit</button>
                  </div>
                );
              })
            ) : (
              <p>No minted NFTs yet.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === "transferred" && (
        <div className={styles.mintedSection}>
          <h2>Transferred NFTs</h2>
          <div className={styles.grid}>
            {mintedNFTs.filter(n => n.currentOwner !== adminWallet).length > 0 ? (
              mintedNFTs.filter(n => n.currentOwner !== adminWallet).map((nft, index) => (
                <div key={index} className={styles.nftCard}>
                  <img src={nft.image} alt={nft.title} />
                  <h3>{nft.title}</h3>
                  <p><strong>Owner:</strong> {nft.currentOwner?.slice(0,4)}...{nft.currentOwner?.slice(-4)}</p>
                  <button onClick={() => setSelectedMetadataUri(nft.metadataUri)}>
                    View Details
                  </button>
                </div>
              ))
            ) : (
              <p>No transferred NFTs yet.</p>
            )}
          </div>
        </div>
      )}

      {selectedMetadataUri && (
        <div className={styles.detailOverlay}>
          <div className={styles.detailContainer}>
            <button className={styles.closeButton} onClick={() => setSelectedMetadataUri(null)}>
              Close
            </button>
            <NftDetailCard
              metadataUri={selectedMetadataUri}
              mintAddress={mintedNFTs.find(n => n.metadataUri === selectedMetadataUri)?.mintAddress}
              onClose={() => setSelectedMetadataUri(null)}
            />
          </div>
        </div>
      )}

      {showPreview && (
        <div className={styles.modalBackdrop} onClick={() => setShowPreview(false)}>
          <div className={styles.modalWrapper} onClick={(e) => e.stopPropagation()}>
            <NftDetailCard
              onClose={() => setShowPreview(false)}
              previewData={{
                title,
                description,
                image: `${process.env.NEXT_PUBLIC_GATEWAY_URL}${fileCid}`,
                priceSol,
                attributes: [
                  { trait_type: "Brand", value: brand },
                  { trait_type: "Model", value: model },
                  { trait_type: "Serial Number", value: serialNumber },
                  { trait_type: "Material", value: material },
                  { trait_type: "Production Year", value: productionYear },
                  { trait_type: "Movement", value: movement },
                  { trait_type: "Water Resistance", value: waterResistance },
                  { trait_type: "Dial Color", value: dialColor },
                  { trait_type: "Country", value: country },
                  { trait_type: "Release Date", value: releaseDate },
                  { trait_type: "Box & Papers", value: boxPapers },
                  { trait_type: "Condition", value: condition },
                  { trait_type: "Warranty Info", value: warrantyInfo },
                  { trait_type: "Certificate", value: certificate },
                  { trait_type: "Features", value: features },
                  { trait_type: "Limited Edition", value: limitedEdition },
                ],
              }} 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export async function getServerSideProps() {
  try {
    const dbConnect = (await import("@/lib/database/mongodb")).default;
    await dbConnect();

    const { Asset } = await import("../lib/models/Assets"); // Adjust path if your models are elsewhere

    const assets = await Asset.find({ deleted: false }).populate('vendor').lean();

    let solPrice = 150; // fallback
    try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    if (res.ok) {
        const data = await res.json();
        solPrice = data.solana.usd;
    }
    } catch (err) {
    console.error("Failed to fetch SOL price, using fallback:", err);
    }

    const gateway = process.env.NEXT_PUBLIC_GATEWAY_URL || fallbackGateway;

    const minted: MintedNFT[] = assets.map((asset: any) => ({
      title: asset.model,
      description: asset.description,
      image: asset.imageIpfsUrls?.[0] ? `${gateway}${asset.imageIpfsUrls[0]}` : "/fallback.png",
      priceSol: asset.priceUSD / solPrice,
      metadataUri: asset.metadataIpfsUrl || "",
      mintAddress: asset.nftMint,
      currentOwner: asset.nftOwnerWallet,
      ipfs_pin_hash: asset.imageIpfsUrls?.[0],
      marketStatus: asset.status,
      updatedAt: asset.updatedAt ? new Date(asset.updatedAt).toISOString() : undefined,
    }));

    return {
      props: {
        initialMintedNFTs: minted,
        initialSolPrice: solPrice,
      },
    };
  } catch (err) {
    console.error("getServerSideProps error:", err);
    return {
      props: {
        initialMintedNFTs: [],
        initialSolPrice: 150,
      },
    };
  }
}

export default CreateNFT;