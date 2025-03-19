import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getProgram } from "../utils/programUtils";
import { 
  PublicKey, 
  SystemProgram, 
  Keypair, 
  SYSVAR_RENT_PUBKEY,
  Connection
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { Metaplex, walletAdapterIdentity } from "@metaplex-foundation/js";
import { uploadToPinata } from "../utils/pinata";
import { createMetadata } from "../utils/metadata";

const CreateNFT = () => {
  const wallet = useWallet();
  const [fileCid, setFileCid] = useState<string>("");
  const [priceSol, setPriceSol] = useState<number>(0);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [minting, setMinting] = useState<boolean>(false);
  const [mintedNFTs, setMintedNFTs] = useState<any[]>([]);

  // Fetch existing pinned NFT metadata from your API and then from IPFS
  useEffect(() => {
    const fetchExistingNFTs = async () => {
      try {
        const res = await fetch("/api/pinata/nfts");
        if (!res.ok) throw new Error("Failed to fetch existing NFTs");
        const data = await res.json();
        console.log("Raw data from /api/pinata/nfts:", data);

        // For each NFT pin, fetch its actual JSON metadata from IPFS using the ipfs_pin_hash
        const transformed = await Promise.all(
          data.map(async (nft: any) => {
            // Adjust the field name if needed (here we expect ipfs_pin_hash)
            const ipfsHash = nft.ipfs_pin_hash;
            try {
              const ipfsRes = await fetch(`${process.env.NEXT_PUBLIC_GATEWAY_URL}${ipfsHash}`);
              const jsonData = await ipfsRes.json();
              return {
                title: jsonData.name || "No Title",
                description: jsonData.description || "No Description",
                image: jsonData.image || `${process.env.NEXT_PUBLIC_GATEWAY_URL}${ipfsHash}`,
                priceSol: jsonData.priceSol ? parseFloat(jsonData.priceSol) : 0,
              };
            } catch (err) {
              console.error("Error fetching JSON for hash:", ipfsHash, err);
              return null;
            }
          })
        );
        // Filter out any null results
        const validNFTs = transformed.filter((item) => item !== null);
        setMintedNFTs(validNFTs);
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
    try {
      const program = getProgram(wallet);
      console.log("✅ Using programId:", program.programId.toString());
      const [adminListPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("admin_list")],
        program.programId
      );
      console.log("✅ Available adminListPda:", adminListPda);
      
      const mintKeypair = Keypair.generate();
      console.log("🔑 New Mint Keypair:", mintKeypair.publicKey.toBase58());
      
      const recipientAta = await getAssociatedTokenAddress(
        mintKeypair.publicKey,
        wallet.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

      // Create NFT metadata and upload it to Pinata
      const metadataJson = createMetadata(title, description, fileCid, wallet.publicKey.toBase58());
      const metadataUri = await uploadToPinata(metadataJson, title);
      console.log("✅ Metadata uploaded to Pinata:", metadataUri);

      // Mint the NFT on-chain via your program
      const tx = await program.methods.mintNft().accounts({
        adminList: adminListPda,
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

      console.log("✅ NFT minted successfully, tx:", tx);

      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || "https://api.devnet.solana.com"
      );
      const metaplex = Metaplex.make(connection).use(walletAdapterIdentity(wallet));

      console.log("✅ Assigning metadata to NFT...");
      const { nft } = await metaplex.nfts().create({
        uri: metadataUri,
        name: title,
        sellerFeeBasisPoints: 500,
        symbol: "MYNFT",
        creators: [
          {
            address: wallet.publicKey,
            share: 100,
          },
        ],
      });

      console.log("✅ NFT Metadata Created:", nft);
      alert("🎉 NFT minted successfully with metadata!");

      // Fetch the final minted NFT data from the chain
      const mintAddress = new PublicKey(nft.mint.toString());
      const fetchedNft = await metaplex.nfts().findByMint({ mintAddress });
      if (!fetchedNft.json) {
        throw new Error("Fetched NFT metadata is null");
      }
      console.log("✅ Fetched NFT data:", fetchedNft.json);
      const metadata = fetchedNft.json;

      // Update state with the final NFT metadata from IPFS (on-chain)
      setMintedNFTs((prev) => [
        ...prev,
        {
          title: metadata.name,
          description: metadata.description,
          image: metadata.image, // This should be the full URL from IPFS
          priceSol, // Use the price provided from the form
        },
      ]);

    } catch (error) {
      console.error("❌ Minting error:", error);
      alert("Minting failed.");
    } finally {
      setMinting(false);
    }
  };

  return (
    <div>
      <h1>Create and List NFT</h1>
      <div style={{ marginBottom: "2rem" }}>
        <input
          type="text"
          placeholder="Enter CID (e.g., Qm...)"
          value={fileCid}
          onChange={(e) => setFileCid(e.target.value)}
        />
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="text"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          type="number"
          placeholder="Price in SOL"
          value={priceSol}
          onChange={(e) => setPriceSol(parseFloat(e.target.value))}
        />
        <button onClick={mintNFT} disabled={minting}>
          {minting ? "Minting..." : "Mint NFT"}
        </button>
      </div>
      {fileCid && (
        <div>
          <h2>NFT Preview</h2>
          <img
            src={`${process.env.NEXT_PUBLIC_GATEWAY_URL}${fileCid}`}
            alt="NFT Preview"
            style={{ maxWidth: "200px", marginTop: "20px" }}
          />
          <div>Title: {title}</div>
          <div>Description: {description}</div>
          <div>Price: {priceSol}</div>
        </div>
      )}
      <h2>Minted NFTs</h2>
      <div>
        {mintedNFTs.length > 0 ? (
          mintedNFTs.map((nft, index) => (
            <div
              key={index}
              style={{
                border: "1px solid #ccc",
                padding: "1rem",
                marginBottom: "1rem",
              }}
            >
              <h3>{nft.title}</h3>
              <p>{nft.description}</p>
              <p>Price: {nft.priceSol} SOL</p>
              <img
                src={nft.image}
                alt={nft.title}
                style={{ maxWidth: "200px" }}
              />
            </div>
          ))
        ) : (
          <p>No minted NFTs yet.</p>
        )}
      </div>
    </div>
  );
};

export default CreateNFT;
