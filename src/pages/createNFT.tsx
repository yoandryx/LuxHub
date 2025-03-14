import { useState, useEffect } from "react";
import { useListings } from "../context/src/ListingsContext";

const CreateNFT = () => {
  // Form state for creating a new NFT listing
  const [fileCid, setFileCid] = useState<string>("");
  const [priceSol, setPriceSol] = useState<number>(0);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  // State to hold NFTs fetched from your API route (pinned NFTs from Pinata)
  const [nfts, setNfts] = useState<any[]>([]);

  // Get the escrow functions from your listings context
  const { addListing, commitToBuy, settleEscrow } = useListings();

  // Fetch NFTs from your API route on component mount
  useEffect(() => {
    const fetchNFTs = async () => {
      try {
        const res = await fetch("http://localhost:3000/api/pinata/nfts");
        if (!res.ok) {
          throw new Error("Failed to fetch NFTs");
        }
        const data = await res.json();
        // Data should be an array of NFT objects from Pinata.
        setNfts(data);
      } catch (error) {
        console.error("Error fetching NFTs:", error);
      }
    };

    fetchNFTs();
  }, []);

  // Form handlers for new NFT listing
  const handleFileCidChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileCid(e.target.value);
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPriceSol(parseFloat(e.target.value));
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDescription(e.target.value);
  };

  // Submit the new NFT listing to your smart contract via your listings context
  const handleSubmit = async () => {
    if (!fileCid) {
      alert("Please provide a valid CID.");
      return;
    }

    const newListing = {
      id: Date.now().toString(),
      title,
      description,
      priceSol,
      serialNumber: "NFT_SERIAL_NUMBER", // Replace or generate a unique serial if needed
      // This line constructs the image URL using your IPFS gateway and the provided CID.
      image: `${process.env.NEXT_PUBLIC_GATEWAY_URL}${fileCid}`,
    };

    console.log("Creating listing with image URL:", `${process.env.NEXT_PUBLIC_GATEWAY_URL}${fileCid}`);
    // Call your Anchor program function via context
    await addListing(newListing);
    // Optionally, refresh the NFT list here if needed.
  };

  // This function handles the purchase flow by committing to buy and settling escrow.
  const handleExchange = async (listingId: string) => {
    try {
      await commitToBuy(listingId);
      await settleEscrow(listingId);
      alert("Purchase successful! NFT exchanged and funds released.");
    } catch (error) {
      console.error("Exchange failed:", error);
      alert("Transaction failed. Funds returned or escrow canceled.");
    }
  };

  return (
    <div>
      <h1>Create and List NFT</h1>
      <div style={{ marginBottom: "2rem" }}>
        <input
          type="text"
          placeholder="Enter CID (e.g., Qm... )"
          value={fileCid}
          onChange={handleFileCidChange}
        />
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={handleTitleChange}
        />
        <input
          type="text"
          placeholder="Description"
          value={description}
          onChange={handleDescriptionChange}
        />
        <input
          type="number"
          placeholder="Price in SOL"
          value={priceSol}
          onChange={handlePriceChange}
        />
        <button onClick={handleSubmit}>Create Listing</button>
      </div>

      {/* Preview for new NFT */}
      {fileCid && (
        <div>
          <h2>NFT Preview</h2>
          <img
            src={`${process.env.NEXT_PUBLIC_GATEWAY_URL}${fileCid}`}
            alt="NFT Preview"
            style={{ maxWidth: "300px", marginTop: "20px" }}
          />
        </div>
      )}

      <h2>Existing NFTs on IPFS</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}>
        {nfts.length > 0 ? (
          nfts.map((nft) => (
            <div key={nft.ipfs_pin_hash} style={{ border: "1px solid #ccc", padding: "10px" }}>
              <img
                src={`${process.env.NEXT_PUBLIC_GATEWAY_URL}${nft.ipfs_pin_hash}`}
                alt={nft.metadata?.name || "NFT"}
                style={{ maxWidth: "200px" }}
              />
              <h3>{nft.metadata?.name || "Untitled NFT"}</h3>
              <p>{nft.metadata?.keyvalues?.description || "No description"}</p>
              {/* Add a Buy NFT button which triggers the escrow purchase flow */}
              <button onClick={() => handleExchange(nft.id)}>Buy NFT</button>
            </div>
          ))
        ) : (
          <p>No NFTs found.</p>
        )}
      </div>
    </div>
  );
};

export default CreateNFT;
