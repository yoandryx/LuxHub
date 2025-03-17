import { useEscrow } from "../context/src/EscrowContext";
import { useWallet } from "@solana/wallet-adapter-react";
import { getProgram, Listing } from "../utils/programUtils"; // ✅ Import function
import { PublicKey } from "@solana/web3.js";

export default function EscrowMarketplace() {
  const { listings, fetchListings } = useEscrow();
  const wallet = useWallet();

  const handleBuy = async (listing: Listing) => {
    if (!wallet.publicKey) {
      alert("Please connect your wallet to proceed.");
      return;
    }

    try {
      const program = getProgram(wallet);

      await program.methods.exchange().accounts({
        escrowAccount: new PublicKey(listing.pubkey),
        buyer: wallet.publicKey,
        initializer: new PublicKey(listing.initializer),
        mint: new PublicKey(listing.nftMint),
        systemProgram: new PublicKey("11111111111111111111111111111111"),
      }).rpc();

      alert("Purchase successful!");
      fetchListings();
    } catch (error) {
      console.error("Error buying NFT:", error);
      alert("Transaction failed.");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">LuxHub Watch Marketplace</h1>
      {listings.map((listing) => (
        <div key={listing.pubkey}>
          <p>NFT Mint: {listing.nftMint}</p>
          <p>Price: {listing.price} SOL</p>
          <p>Status: {listing.status}</p>
          <button 
            onClick={() => handleBuy(listing)} 
            disabled={!wallet.publicKey}
            className={`px-4 py-2 rounded ${
              !wallet.publicKey ? "bg-gray-400 cursor-not-allowed" : "bg-blue-500 hover:bg-blue-700"
            }`}
          >
            Buy NFT
          </button>
        </div>
      ))}
    </div>
  );
}
