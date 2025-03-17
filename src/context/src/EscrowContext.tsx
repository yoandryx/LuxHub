import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getProgram, Listing } from "../../utils/programUtils";

interface EscrowContextType {
  listings: Listing[];
  fetchListings: () => Promise<Listing[]>;
}

const EscrowContext = createContext<EscrowContextType | null>(null);

export const EscrowProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const wallet = useWallet();
  const [listings, setListings] = useState<Listing[]>([]);

  useEffect(() => {
    if (wallet.connected) {
      fetchListings();
    }
  }, [wallet]);

  const fetchListings = async (): Promise<Listing[]> => {
  if (!wallet.publicKey) return [];
  try {
    const program = getProgram(wallet);
    const escrowAccounts = await program.provider.connection.getProgramAccounts(
      program.programId
    );

    const parsedListings: Listing[] = escrowAccounts.map((account) => {
      const data = program.coder.accounts.decode("Escrow", account.account.data);
      return {
        pubkey: account.pubkey.toBase58(),
        initializer: data.initializer.toBase58(),
        nftMint: data.mint.toBase58(),
        price: data.price.toNumber(),
        status: data.status,
      };
    });

    setListings(parsedListings);
    return parsedListings;
  } catch (error) {
    console.error("Failed to fetch escrow listings:", error);
    return [];
  }
};

  return (
    <EscrowContext.Provider value={{ listings, fetchListings }}>
      {children}
    </EscrowContext.Provider>
  );
};

export const useEscrow = () => {
  const context = useContext(EscrowContext);
  if (!context) {
    throw new Error("useEscrow must be used within an EscrowProvider");
  }
  return context;
};
