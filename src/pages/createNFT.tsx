// src/pages/createNFT.tsx
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getProgram } from "../utils/programUtils";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  SYSVAR_RENT_PUBKEY,
  Connection,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getMint,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { Metaplex, walletAdapterIdentity } from "@metaplex-foundation/js";
import { uploadToPinata } from "../utils/pinata";
import { createMetadata, updateNftMetadata } from "../utils/metadata";
import { NftDetailCard } from "../components/marketplace/NftDetailCard";
import { NftForm } from "../components/admins/NftForm";
import styles from "../styles/CreateNFT.module.css";
import { BN } from "@coral-xyz/anchor";
import type { WalletAdapter } from "@solana/wallet-adapter-base";

// Extended MintedNFT interface
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
}

const fallbackGateway = "https://gateway.pinata.cloud/ipfs/";

const CreateNFT = () => {
  const wallet = useWallet();
  const adminWallet = wallet.publicKey?.toBase58();

  const confirmTransfer = async (transferDetails: string): Promise<boolean> => {
    console.log("Transfer confirmation requested:", transferDetails);
    return true;
  };

  // NFT Creation Form State
  const [fileCid, setFileCid] = useState<string>("");
  const [priceSol, setPriceSol] = useState<number>(0);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  // Additional attributes
  const [brand, setBrand] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [serialNumber, setSerialNumber] = useState<string>("");
  const [material, setMaterial] = useState<string>("");
  const [productionYear, setProductionYear] = useState<string>("");
  const [limitedEdition, setLimitedEdition] = useState<string>("");
  const [certificate, setCertificate] = useState<string>("");
  const [warrantyInfo, setWarrantyInfo] = useState<string>("");
  const [provenance, setProvenance] = useState<string>(adminWallet || "");
  const [marketStatus, setMarketStatus] = useState<string>("inactive");

  // Optional attributes
  const [movement, setMovement] = useState<string>("Automatic");
  const [caseSize, setCaseSize] = useState<string>("42mm");
  const [waterResistance, setWaterResistance] = useState<string>("300m");
  const [dialColor, setDialColor] = useState<string>("Black");
  const [country, setCountry] = useState<string>("Switzerland");
  const [releaseDate, setReleaseDate] = useState<string>("2023-05-01");

  // Minting and UI State
  const [minting, setMinting] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>("");

  // Display State
  const [mintedNFTs, setMintedNFTs] = useState<MintedNFT[]>([]);
  const [selectedMetadataUri, setSelectedMetadataUri] = useState<string | null>(null);

  const [transferInputs, setTransferInputs] = useState<{ [key: string]: string }>({});
  const [saleRequestSent, setSaleRequestSent] = useState<{ [mint: string]: boolean }>({});

  // Request Sale Handler
  const handleSaleRequest = async (nftId: string, ipfs_pin_hash?: string) => {
    if (!ipfs_pin_hash) {
      console.error("No ipfs_pin_hash provided. Cannot request sale.");
      return;
    }
    if (!wallet.publicKey) {
      console.error("Wallet not connected. Cannot request sale.");
      return;
    }
    try {
      const uniqueSeed = Date.now();
      const payload = {
        nftId,
        ipfs_pin_hash,
        seller: wallet.publicKey.toBase58(),
        seed: uniqueSeed,
        initializerAmount: priceSol,
        takerAmount: 0,
        fileCid,
        salePrice: priceSol,
      };

      const res = await fetch("/api/nft/requestSale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Request failed");
      setSaleRequestSent((prev) => ({ ...prev, [nftId]: true }));
      console.log("Sale request succeeded for seed:", uniqueSeed);
    } catch (error) {
      console.error("Sale request error:", error);
    }
  };

  const handleTransferInputChange = (key: string, value: string) => {
    setTransferInputs((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    const fetchExistingNFTs = async () => {
      try {
        console.log("🔍 Fetching existing NFTs from /api/pinata/nfts...");
        const res = await fetch("/api/pinata/nfts");
        if (!res.ok) throw new Error("Failed to fetch existing NFTs");
        const data = await res.json();
        console.log("Raw data from /api/pinata/nfts:", data);

        const seenMintAddresses = new Set<string>();
        const transformed: MintedNFT[] = await Promise.all(
          data.map(async (nft: any) => {
            const ipfsHash = nft.ipfs_pin_hash;
            try {
              console.log(`🔗 Fetching JSON metadata from IPFS hash: ${ipfsHash}`);
              const ipfsRes = await fetch(`${process.env.NEXT_PUBLIC_GATEWAY_URL}${ipfsHash}`);
              const contentType = ipfsRes.headers.get("Content-Type");
              if (!contentType || !contentType.includes("application/json")) {
                console.warn(`Skipping pin ${ipfsHash} due to non-JSON content type: ${contentType}`);
                return null;
              }
              const jsonData = await ipfsRes.json();
              console.log("✅ Fetched JSON metadata:", jsonData);
              if (!jsonData.mintAddress) return null;
              if (seenMintAddresses.has(jsonData.mintAddress)) return null;
              seenMintAddresses.add(jsonData.mintAddress);
              const currentOwner = jsonData.attributes?.find((attr: any) => attr.trait_type === "Provenance")?.value || "";
              return {
                title: jsonData.name || "No Title",
                description: jsonData.description || "No Description",
                image: jsonData.image && jsonData.image.startsWith("http")
                  ? jsonData.image
                  : `${process.env.NEXT_PUBLIC_GATEWAY_URL}${ipfsHash}`,
                priceSol: jsonData.priceSol ? parseFloat(jsonData.priceSol) : 0,
                metadataUri: `${process.env.NEXT_PUBLIC_GATEWAY_URL}${ipfsHash}`,
                mintAddress: jsonData.mintAddress,
                currentOwner,
                ipfs_pin_hash: ipfsHash,
                marketStatus: jsonData.attributes?.find((attr: any) => attr.trait_type === "Market Status")?.value || "inactive",
              } as MintedNFT;
            } catch (err) {
              console.error("Error fetching JSON for hash:", ipfsHash, err);
              return null;
            }
          })
        );
        const validNFTs = transformed.filter((item) => item !== null) as MintedNFT[];
        setMintedNFTs(validNFTs.filter((nft) => nft.mintAddress));
      } catch (error) {
        console.error("Error fetching existing NFTs:", error);
      }
    };
    fetchExistingNFTs();
  }, []);

  const mintNFT = async () => {
    if (!wallet.publicKey) {
      alert("Please connect your wallet.");
      return;
    }
    if (!fileCid) {
      alert("Please provide a valid CID.");
      return;
    }
    setMinting(true);
    setProgress(0);
    setStatusMessage("Starting NFT mint process...");

    try {
      const program = getProgram(wallet);
      setProgress(10);
      setStatusMessage("Program loaded. Deriving admin list PDA...");
      // Use adminListPda obtained via getProgram (not a variable adminList)
      const [adminListPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("admin_list")],
        program.programId
      );
      const mintKeypair = Keypair.generate();
      setProgress(20);
      const recipientAta = await getAssociatedTokenAddress(
        mintKeypair.publicKey,
        wallet.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );
      setProgress(30);
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
        priceSol
      );
      (metadataJson as any).mintAddress = mintKeypair.publicKey.toBase58();
      console.log("📝 Created metadata JSON with mintAddress:", metadataJson);
      const metadataUri = await uploadToPinata(metadataJson, title);
      console.log("✅ Metadata uploaded to Pinata. URI:", metadataUri);
      setProgress(40);
      const gateway = process.env.NEXT_PUBLIC_GATEWAY_URL || fallbackGateway;
      const ipfs_pin_hash = metadataUri.replace(gateway, "");
      setStatusMessage("Minting NFT on-chain...");
      const tx = await program.methods
        .mintNft()
        .accounts({
          adminList: adminListPda, // Use adminListPda here
          admin: wallet.publicKey,
          recipient: wallet.publicKey,
          nftMint: mintKeypair.publicKey,
          recipientTokenAccount: recipientAta,
          mintAuthority: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();
      setProgress(50);
      setStatusMessage("Waiting for on-chain propagation...");
      await new Promise((resolve) => setTimeout(resolve, 15000));
      setProgress(60);
      const connection = new Connection(
        process.env.NEXT_PUBLIC_ENDPOINT || "https://api.devnet.solana.com"
      );
      const mintState = await getMint(connection, mintKeypair.publicKey, "finalized");
      const ataState = await getAccount(connection, recipientAta, "finalized", TOKEN_PROGRAM_ID);
      if (mintState.supply !== BigInt(1) || ataState.amount !== BigInt(1)) {
        throw new Error("Mint supply or ATA balance is not exactly 1");
      }
      setProgress(70);
      setStatusMessage("Building transaction for NFT metadata...");
      const metaplex = Metaplex.make(connection).use(walletAdapterIdentity(wallet));
      const createNftBuilder = await metaplex.nfts().builders().create({
        useExistingMint: mintKeypair.publicKey,
        tokenOwner: wallet.publicKey,
        uri: metadataUri,
        name: title,
        sellerFeeBasisPoints: 300,
        symbol: "LUXHUB",
        creators: [{ address: wallet.publicKey, share: 100 }],
        maxSupply: 0,
        mintTokens: false,
      });
      setProgress(80);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
      const transaction = createNftBuilder.toTransaction({ blockhash, lastValidBlockHeight });
      setProgress(85);
      if (!wallet.signTransaction) {
        throw new Error("Wallet does not support transaction signing.");
      }
      const signedTx = await wallet.signTransaction(transaction);
      setStatusMessage("Sending transaction to network...");
      const txId = await connection.sendRawTransaction(signedTx.serialize());
      setProgress(90);
      setStatusMessage("Confirming transaction on-chain...");
      await connection.confirmTransaction({ signature: txId, blockhash, lastValidBlockHeight });
      setProgress(95);
      setStatusMessage("Fetching NFT metadata...");
      const mintAddress = mintKeypair.publicKey;
      const fetchedNft = await metaplex.nfts().findByMint({ mintAddress });
      if (!fetchedNft.json) {
        throw new Error("Fetched NFT metadata is null");
      }
      const currentOwner = fetchedNft.json.attributes?.find((attr: any) => attr.trait_type === "Provenance")?.value || "";
      setMintedNFTs((prev) => [
        ...prev,
        {
          title: fetchedNft.json?.name || "Unknown Title",
          description: fetchedNft.json?.description || "No Description",
          image: fetchedNft.json?.image || "",
          priceSol,
          metadataUri,
          mintAddress: mintAddress.toBase58(),
          currentOwner,
          ipfs_pin_hash,
          marketStatus,
        },
      ]);
      setProgress(100);
      setStatusMessage("NFT minted successfully!");
      alert("🎉 NFT minted successfully with metadata!");
    } catch (error: any) {
      console.error("❌ Minting error:", error);
      alert("Minting failed: " + error.message);
    } finally {
      setMinting(false);
    }
  };

  const transferNftToSellerAuto = async (mintAddress: string, newOwnerAddress: string) => {
    if (!wallet.publicKey) {
      alert("Please connect admin wallet.");
      return;
    }
    try {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_ENDPOINT || "https://api.devnet.solana.com"
      );
      const fromAta = await getAssociatedTokenAddress(new PublicKey(mintAddress), wallet.publicKey);
      const toAta = await getAssociatedTokenAddress(new PublicKey(mintAddress), new PublicKey(newOwnerAddress));
      const toAtaInfo = await connection.getAccountInfo(toAta);
      let createAtaIx = null;
      if (!toAtaInfo) {
        createAtaIx = createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          toAta,
          new PublicKey(newOwnerAddress),
          new PublicKey(mintAddress)
        );
      }
      const transferDetails = `Transfer NFT?\n\nMint: ${mintAddress}\nFrom Wallet: ${wallet.publicKey}\nTo Wallet: ${newOwnerAddress}`;
      const confirmed = await confirmTransfer(transferDetails);
      if (!confirmed) {
        alert("Transfer canceled by admin.");
        return;
      }
      const program = getProgram(wallet);
      const [adminListPda] = PublicKey.findProgramAddressSync([Buffer.from("admin_list")], program.programId);
      let txBuilder = program.methods
        .restrictedTransferInstruction(new BN(1))
        .accounts({
          admin: wallet.publicKey,
          adminList: adminListPda,
          nftMint: new PublicKey(mintAddress),
          fromAta,
          toAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        });
      if (createAtaIx) {
        txBuilder = txBuilder.preInstructions([createAtaIx]);
      }
      const tx = await txBuilder.rpc();
      alert("NFT transferred while keeping admin control!");
      await updateMetadataOnTransfer(mintAddress, newOwnerAddress);
    } catch (err) {
      console.error("❌ Transfer failed:", err);
    }
  };

  const updateMetadataOnTransfer = async (mintAddress: string, newOwner: string) => {
    if (!wallet.publicKey) {
      alert("Please connect your admin wallet.");
      return;
    }
    try {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_ENDPOINT || "https://api.devnet.solana.com"
      );
      const metaplex = Metaplex.make(connection).use(walletAdapterIdentity(wallet));
      const nft = await metaplex.nfts().findByMint({ mintAddress: new PublicKey(mintAddress) });
      const res = await fetch(nft.uri);
      if (!res.ok) {
        throw new Error("Failed to fetch current metadata");
      }
      const currentMetadata = await res.json();
      if (currentMetadata.attributes && Array.isArray(currentMetadata.attributes)) {
        const idx = currentMetadata.attributes.findIndex(
          (attr: any) => attr.trait_type === "Provenance" || attr.trait_type === "Current Owner"
        );
        if (idx !== -1) {
          currentMetadata.attributes[idx].value = newOwner;
        } else {
          currentMetadata.attributes.push({ trait_type: "Current Owner", value: newOwner });
        }
      } else {
        currentMetadata.attributes = [{ trait_type: "Current Owner", value: newOwner }];
      }
      currentMetadata.updatedAt = new Date().toISOString();
      const newUri = await uploadToPinata(currentMetadata, "Updated NFT Metadata");
      console.log("[updateMetadataOnTransfer] New metadata URI:", newUri);
      await updateNftMetadata(wallet as unknown as WalletAdapter, mintAddress, { uri: newUri });
      alert("NFT metadata updated successfully!");
    } catch (error) {
      console.error("[updateMetadataOnTransfer] Error updating metadata:", error);
      alert("Failed to update NFT metadata.");
    }
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.sidebar}>
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
          mintNFT={mintNFT}
          minting={minting}
        />
      </div>
      <div className={styles.mainContent}>
        <div className={styles.previewSection}>
          <h2>NFT Preview</h2>
          {fileCid ? (
            <img
              src={`${process.env.NEXT_PUBLIC_GATEWAY_URL}${fileCid}`}
              alt="NFT Preview"
              style={{ maxWidth: "200px", marginTop: "20px" }}
            />
          ) : (
            <p>No image selected</p>
          )}
          <div>Title: {title}</div>
          <div>Description: {description}</div>
          <div>Price: {priceSol} SOL</div>
        </div>
        {minting && (
          <div className={styles.mintProgressContainer}>
            <p>{statusMessage}</p>
            <div className={styles.progressBar}>
              <div className={styles.progress} style={{ width: `${progress}%` }}></div>
            </div>
            <p>{progress}%</p>
          </div>
        )}
        <div className={styles.mintedSection}>
          <h2>Minted NFTs</h2>
          <div className={styles.grid}>
            {mintedNFTs.length > 0 ? (
              mintedNFTs.map((nft, index) => {
                const uniqueKey = `${nft.mintAddress ?? "nomint"}-${index}`;
                const newOwnerValue = transferInputs[uniqueKey] || "";
                const isAdminOwned = nft.currentOwner === adminWallet;
                return (
                  <div key={uniqueKey} className={styles.nftCard}>
                    {nft.image && nft.image.startsWith("http") ? (
                      <img src={nft.image} alt={nft.title} />
                    ) : (
                      <p style={{ color: "gray" }}>No valid image</p>
                    )}
                    <h3>{nft.title}</h3>
                    <p>{nft.description}</p>
                    <p>Price: {nft.priceSol} SOL</p>
                    {nft.mintAddress && (
                      <p><strong>Mint:</strong> {nft.mintAddress}</p>
                    )}
                    {nft.currentOwner && (
                      <p><strong>Current Owner:</strong> {nft.currentOwner}</p>
                    )}
                    {isAdminOwned ? (
                      <>
                        <input
                          type="text"
                          placeholder="Seller's wallet address (e.g. 9D9U8y8B6G...)"
                          value={newOwnerValue}
                          onChange={(e) => handleTransferInputChange(uniqueKey, e.target.value)}
                          style={{ marginTop: "8px" }}
                        />
                        {nft.mintAddress ? (
                          <button onClick={() => transferNftToSellerAuto(nft.mintAddress!, newOwnerValue)}>
                            Transfer NFT to Seller
                          </button>
                        ) : (
                          <p style={{ color: "red" }}>No valid mint address. Transfer disabled.</p>
                        )}
                        {nft.marketStatus && (
                          <p><strong>Status:</strong> {nft.marketStatus}</p>
                        )}
                      </>
                    ) : (
                      <p style={{ color: "green" }}>NFT already transferred.</p>
                    )}
                    <button onClick={() => setSelectedMetadataUri(nft.metadataUri)}>
                      View Details
                    </button>
                    {nft.mintAddress && (
                      <button onClick={() => {
                        if (nft.mintAddress && nft.ipfs_pin_hash) {
                          handleSaleRequest(nft.mintAddress, nft.ipfs_pin_hash);
                        } else {
                          alert("No valid mint address or IPFS hash available.");
                        }
                      }}>
                        Request NFT Sale
                      </button>
                    )}
                    {nft.mintAddress && saleRequestSent[nft.mintAddress] && (
                      <p>Sale request submitted. Await admin approval.</p>
                    )}
                  </div>
                );
              })
            ) : (
              <p>No minted NFTs yet.</p>
            )}
          </div>
        </div>
      </div>
      {selectedMetadataUri && (
        <div className={styles.detailOverlay}>
          <div className={styles.detailContainer}>
            <button className={styles.closeButton} onClick={() => setSelectedMetadataUri(null)}>
              Close
            </button>
            <NftDetailCard metadataUri={selectedMetadataUri} />
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateNFT;
