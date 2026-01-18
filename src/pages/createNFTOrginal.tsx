// src/pages/createNFT.tsx
import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getProgram } from '../utils/programUtils';
import {
  PublicKey,
  SystemProgram,
  Keypair,
  SYSVAR_RENT_PUBKEY,
  Connection,
  ParsedAccountData,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getMint,
  getAccount,
  createAssociatedTokenAccountInstruction,
  AccountLayout,
} from '@solana/spl-token';
import { Metaplex, walletAdapterIdentity, toBigNumber } from '@metaplex-foundation/js';
import { uploadToPinata } from '../utils/pinata';
import { createMetadata, updateNftMetadata } from '../utils/metadata';
import { NftDetailCard } from '../components/marketplace/NftDetailCard';
import { NftForm } from '../components/admins/NftForm';
import styles from '../styles/CreateNFT.module.css';
import { BN } from '@coral-xyz/anchor';
import type { WalletAdapter } from '@solana/wallet-adapter-base';

import NFTPreviewCard from '../components/admins/NFTPreviewCard';
import { FaCopy } from 'react-icons/fa';

// Extended MintedNFT interface with optional ipfs_pin_hash and marketStatus fields.
interface MintedNFT {
  title: string;
  description: string;
  image: string;
  priceSol: number;
  metadataUri: string;
  mintAddress?: string; // Created on-chain
  currentOwner?: string; // Wallet that currently owns it
  ipfs_pin_hash?: string; // Pinata hash
  marketStatus?: string; // e.g. "inactive" or "active"
  updatedAt?: string; // Date of last update
}

// Define a fallback gateway constant.
const fallbackGateway = 'https://gateway.pinata.cloud/ipfs/';

const CreateNFT = () => {
  const wallet = useWallet();
  const adminWallet = wallet.publicKey?.toBase58();

  // Optional step: a confirmation function
  const confirmTransfer = async (transferDetails: string): Promise<boolean> => {
    console.log('Transfer confirmation requested:', transferDetails);
    return true;
  };

  const [features, setFeatures] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'mint' | 'minted' | 'transferred'>('mint');

  const [fileCid, setFileCid] = useState('');
  const [priceSol, setPriceSol] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [material, setMaterial] = useState('');
  const [productionYear, setProductionYear] = useState('');
  const [limitedEdition, setLimitedEdition] = useState('');
  const [certificate, setCertificate] = useState('');
  const [warrantyInfo, setWarrantyInfo] = useState('');
  const [provenance, setProvenance] = useState(adminWallet || '');
  const [marketStatus, setMarketStatus] = useState('inactive');

  const [movement, setMovement] = useState('');
  const [caseSize, setCaseSize] = useState('');
  const [waterResistance, setWaterResistance] = useState('');
  const [dialColor, setDialColor] = useState('');
  const [country, setCountry] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [boxPapers, setBoxPapers] = useState('');
  const [condition, setCondition] = useState('');

  const [minting, setMinting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  const [mintedNFTs, setMintedNFTs] = useState<MintedNFT[]>([]);
  const [selectedMetadataUri, setSelectedMetadataUri] = useState<string | null>(null);
  const [transferInputs, setTransferInputs] = useState<{ [key: string]: string }>({});
  const [transferredNFTs, setTransferredNFTs] = useState<MintedNFT[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleTransferInputChange = (key: string, value: string) => {
    setTransferInputs((prev) => ({ ...prev, [key]: value }));
  };

  const isValidSolanaAddress = (address: string): boolean => {
    try {
      const pubkey = new PublicKey(address);
      return PublicKey.isOnCurve(pubkey); // Ensures it's valid and usable
    } catch (e) {
      return false;
    }
  };

  const handleCopy = (label: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1000); // Reset tooltip after 1s
  };

  // ------------------------------------------------
  // 5. Fetch Existing NFTs from Pinata on Mount
  // ------------------------------------------------
  useEffect(() => {
    const fetchExistingNFTs = async () => {
      try {
        console.log('🔍 Fetching NFTs from /api/pinata/nfts...');
        const res = await fetch('/api/pinata/nfts');
        if (!res.ok) throw new Error('❌ Failed to fetch existing NFTs');

        const pins = await res.json();
        console.log(`📦 Retrieved ${pins.length} pins from Pinata.`);

        const connection = new Connection(
          process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'
        );
        const metaplex = Metaplex.make(connection);

        const groupedByMint: Record<string, { json: any; cid: string; date: string }[]> = {};

        for (const pin of pins) {
          const url = `${process.env.NEXT_PUBLIC_GATEWAY_URL}${pin.ipfs_pin_hash}`;
          try {
            const head = await fetch(url, { method: 'HEAD' });
            const contentType = head.headers.get('Content-Type');
            if (!contentType || !contentType.includes('application/json')) {
              console.log(`⚠️ Skipping non-JSON pin: ${pin.ipfs_pin_hash}`);
              continue;
            }

            const res = await fetch(url);
            const json = await res.json();
            const mint = json.mintAddress;
            if (!mint) {
              console.warn(`⚠️ JSON missing mintAddress: ${pin.ipfs_pin_hash}`, json);
              continue;
            }

            if (!groupedByMint[mint]) groupedByMint[mint] = [];
            groupedByMint[mint].push({ json, cid: pin.ipfs_pin_hash, date: pin.date_pinned });
          } catch (e) {
            console.warn('⛔ Skipping invalid pin:', pin.ipfs_pin_hash, e);
          }
        }

        console.log(
          `🧮 Grouped pins by ${Object.keys(groupedByMint).length} unique mint addresses`
        );

        const result: MintedNFT[] = [];

        for (const mint of Object.keys(groupedByMint)) {
          try {
            console.log(`🔗 Fetching on-chain NFT for mint: ${mint}`);
            const nft = await metaplex.nfts().findByMint({ mintAddress: new PublicKey(mint) });

            const sortedPins = groupedByMint[mint].sort((a, b) => {
              const aDate = new Date(a.json.updatedAt || a.date).getTime();
              const bDate = new Date(b.json.updatedAt || b.date).getTime();
              return bDate - aDate;
            });

            const latestMetadata = sortedPins[0];
            const meta = latestMetadata.json;

            const largestAccounts = await connection.getTokenLargestAccounts(new PublicKey(mint));
            const largestAccountInfo = await connection.getParsedAccountInfo(
              largestAccounts.value[0].address
            );
            const realOwner =
              'parsed' in (largestAccountInfo.value?.data || {})
                ? (largestAccountInfo.value?.data as ParsedAccountData).parsed.info.owner
                : '';

            console.log(`✅ Resolved mint: ${mint}`);
            console.log('🆕 Latest Metadata:', meta);
            console.log('👤 Current Owner:', realOwner);

            result.push({
              title: meta.name || 'No Title',
              description: meta.description || '',
              image: meta.image?.startsWith('http') ? meta.image : nft.uri,
              priceSol: parseFloat(
                typeof meta.priceSol === 'number'
                  ? meta.priceSol
                  : meta.attributes?.find((a: any) => a.trait_type === 'Price')?.value || '0'
              ),
              metadataUri: nft.uri,
              mintAddress: mint,
              currentOwner: realOwner,
              ipfs_pin_hash: latestMetadata.cid,
              marketStatus:
                meta.attributes?.find((a: any) => a.trait_type === 'Market Status')?.value ||
                'inactive',
            });
          } catch (e) {
            console.warn(`❌ Skipping mint ${mint}:`, e);
          }
        }

        console.log(`🏁 Final result includes ${result.length} NFTs`);
        setMintedNFTs(result);
      } catch (err) {
        console.error('❌ fetchExistingNFTs failed:', err);
      }
    };

    fetchExistingNFTs();
  }, []);

  // ------------------------------------------------
  // 6. Mint NFT (with Listing Data)
  // ------------------------------------------------
  const mintNFT = async () => {
    if (!wallet.publicKey) {
      alert('Please connect your wallet.');
      return;
    }
    if (!fileCid) {
      alert('Please provide a valid CID.');
      return;
    }
    setMinting(true);
    setProgress(0);
    setStatusMessage('Starting NFT mint process...');

    try {
      const program = getProgram(wallet);
      setProgress(10);
      setStatusMessage('Program loaded. Deriving admin list PDA...');

      // Attempt to fetch AdminList
      const [adminListPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('admin_list')],
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

      setStatusMessage('Uploading metadata to Pinata...');
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
      (metadataJson as any).mintAddress = mintKeypair.publicKey.toBase58();
      console.log('📝 Created metadata JSON with mintAddress:', metadataJson);

      const metadataUri = await uploadToPinata(metadataJson, title);
      console.log('✅ Metadata uploaded to Pinata. URI:', metadataUri);
      setProgress(40);

      const gateway = process.env.NEXT_PUBLIC_GATEWAY_URL || fallbackGateway;
      const ipfs_pin_hash = metadataUri.replace(gateway, '');

      setStatusMessage('Minting NFT on-chain...');
      const tx = await program.methods
        .mintNft()
        .accounts({
          adminList: adminListPda,
          admin: wallet.publicKey,
          recipient: wallet.publicKey,
          nftMint: mintKeypair.publicKey,
          recipientTokenAccount: recipientAta,
          mintAuthority: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();
      setProgress(50);

      setStatusMessage('Waiting for on-chain propagation...');
      await new Promise((resolve) => setTimeout(resolve, 15000));
      setProgress(60);

      // Validate on-chain
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'
      );
      const mintState = await getMint(connection, mintKeypair.publicKey, 'finalized');
      const ataState = await getAccount(connection, recipientAta, 'finalized', TOKEN_PROGRAM_ID);
      if (mintState.supply !== BigInt(1) || ataState.amount !== BigInt(1)) {
        throw new Error('Mint supply or ATA balance is not exactly 1');
      }
      setProgress(70);

      setStatusMessage('Building transaction for NFT metadata...');
      const metaplex = Metaplex.make(connection).use(walletAdapterIdentity(wallet));
      const createNftBuilder = await metaplex
        .nfts()
        .builders()
        .create({
          useExistingMint: mintKeypair.publicKey,
          tokenOwner: wallet.publicKey,
          uri: metadataUri,
          name: title,
          sellerFeeBasisPoints: 500,
          symbol: 'LUXHUB',
          creators: [
            {
              address: wallet.publicKey,
              share: 100,
            },
          ],
          maxSupply: toBigNumber(0),
          mintTokens: false,
        });
      setProgress(80);

      // Prepare + send the transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      const transaction = createNftBuilder.toTransaction({ blockhash, lastValidBlockHeight });
      setProgress(85);

      if (!wallet.signTransaction) {
        throw new Error('Wallet does not support transaction signing.');
      }
      const signedTx = await wallet.signTransaction(transaction);
      setStatusMessage('Sending transaction to network...');
      const txId = await connection.sendRawTransaction(signedTx.serialize());
      setProgress(90);

      setStatusMessage('Confirming transaction on-chain...');
      await connection.confirmTransaction({
        signature: txId,
        blockhash,
        lastValidBlockHeight,
      });
      setProgress(95);

      // Retrieve the minted NFT's JSON, store in mintedNFTs
      setStatusMessage('Fetching NFT metadata...');
      const mintAddress = mintKeypair.publicKey;
      const fetchWithRetry = async (retries = 10, delayMs = 1500) => {
        for (let i = 0; i < retries; i++) {
          try {
            const nft = await metaplex.nfts().findByMint({ mintAddress });
            return nft;
          } catch (err) {
            console.warn(`Retry ${i + 1}/${retries} - Metadata not found yet`);
            await new Promise((res) => setTimeout(res, delayMs));
          }
        }
        throw new Error('Failed to fetch NFT metadata after multiple retries.');
      };

      const fetchedNft = await fetchWithRetry();
      if (!fetchedNft.json) {
        throw new Error('Fetched NFT metadata is null');
      }
      const currentOwner =
        fetchedNft.json.attributes?.find((attr: any) => attr.trait_type === 'Provenance')?.value ||
        '';

      setMintedNFTs((prev) => [
        ...prev,
        {
          title: fetchedNft.json?.name || 'Unknown Title',
          description: fetchedNft.json?.description || 'No Description',
          image: fetchedNft.json?.image || '',
          priceSol,
          metadataUri,
          mintAddress: mintAddress.toBase58(),
          currentOwner,
          ipfs_pin_hash,
          marketStatus,
        },
      ]);
      setProgress(100);
      setStatusMessage('NFT minted successfully!');
    } catch (error: any) {
      console.error('❌ Minting error:', error);
      alert('Minting failed: ' + error.message);
    } finally {
      setMinting(false);
    }
  };

  // ------------------------------------------------
  // 7. Auto-Derived Transfer with Automatic Metadata Update
  // ------------------------------------------------
  const transferNftToSellerAuto = async (mintAddress: string, newOwnerAddress: string) => {
    if (!wallet.publicKey) {
      alert('Please connect admin wallet.');
      return;
    }
    try {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'
      );
      const nftMint = new PublicKey(mintAddress);
      const tokenAccounts = await connection.getTokenAccountsByOwner(wallet.publicKey, {
        mint: nftMint,
      });

      const userTokenAccount = tokenAccounts.value.find((accInfo) => {
        const data = AccountLayout.decode(accInfo.account.data);
        return data.amount === BigInt(1);
      });

      if (!userTokenAccount) {
        alert('You do not own this NFT and cannot transfer it.');
        return;
      }

      const fromAta = await getAssociatedTokenAddress(new PublicKey(mintAddress), wallet.publicKey);
      const toAta = await getAssociatedTokenAddress(
        new PublicKey(mintAddress),
        new PublicKey(newOwnerAddress)
      );
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
      const transferDetails = `Transfer NFT?\n\nMint: ${mintAddress}\nFrom Wallet: ${
        wallet.publicKey
      }\nTo Wallet: ${newOwnerAddress}`;
      const confirmed = await confirmTransfer(transferDetails);
      if (!confirmed) {
        alert('Transfer canceled by admin.');
        return;
      }

      const program = getProgram(wallet);
      const [adminListPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('admin_list')],
        program.programId
      );
      let txBuilder = program.methods.restrictedTransferInstruction(new BN(1)).accounts({
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
      alert('NFT transferred while keeping admin control!');

      // Update metadata with new Owner
      await updateMetadataOnTransfer(mintAddress, newOwnerAddress);
    } catch (err) {
      console.error('❌ Transfer failed:', err);
    }
  };

  // ------------------------------------------------
  // 8. Update NFT Metadata on Transfer (Preserving All Original Data)
  // ------------------------------------------------
  const updateMetadataOnTransfer = async (mintAddress: string, newOwner: string) => {
    if (!wallet.publicKey) {
      alert('Please connect your admin wallet.');
      return;
    }
    try {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'
      );
      const metaplex = Metaplex.make(connection).use(walletAdapterIdentity(wallet));

      const nft = await metaplex.nfts().findByMint({ mintAddress: new PublicKey(mintAddress) });
      const res = await fetch(nft.uri);
      if (!res.ok) {
        throw new Error('Failed to fetch current metadata');
      }
      const currentMetadata = await res.json();

      if (currentMetadata.attributes && Array.isArray(currentMetadata.attributes)) {
        // Update or add the 'Current Owner' attribute
        if (!currentMetadata.attributes) {
          currentMetadata.attributes = [];
        }

        const updateAttribute = (trait: string, value: string) => {
          const index = currentMetadata.attributes.findIndex(
            (attr: any) => attr.trait_type === trait
          );
          if (index !== -1) {
            currentMetadata.attributes[index].value = value;
          } else {
            currentMetadata.attributes.push({ trait_type: trait, value });
          }
        };

        updateAttribute('Provenance', wallet.publicKey.toBase58());
        updateAttribute('Current Owner', newOwner);
      } else {
        // No attributes? Create them
        currentMetadata.attributes = [{ trait_type: 'Current Owner', value: newOwner }];
      }

      // Force a new CID by updating a timestamp
      currentMetadata.updatedAt = new Date().toISOString();

      const newUri = await uploadToPinata(currentMetadata, 'Updated NFT Metadata');
      console.log('New metadata URI:', newUri);

      // Notice the partial param here: we rename 'uri' to 'image' or something else in updateNftMetadata
      await updateNftMetadata(wallet as unknown as WalletAdapter, mintAddress, { uri: newUri });
      alert('NFT metadata updated successfully!');
    } catch (error) {
      console.error('❌ Error updating metadata:', error);
      alert('Failed to update NFT metadata.');
    }
  };

  // ------------------------------------------------
  // 9. Render
  // ------------------------------------------------

  return (
    <div className={styles.pageContainer}>
      {/* Tabs */}
      <div className={styles.tabContainer}>
        <button
          className={activeTab === 'mint' ? styles.activeTab : ''}
          onClick={() => setActiveTab('mint')}
        >
          Mint New NFT
        </button>
        <button
          className={activeTab === 'minted' ? styles.activeTab : ''}
          onClick={() => setActiveTab('minted')}
        >
          Minted NFTs
        </button>
        <button
          className={activeTab === 'transferred' ? styles.activeTab : ''}
          onClick={() => setActiveTab('transferred')}
        >
          Transferred NFTs
        </button>
      </div>

      {/* Mint Tab */}
      {activeTab === 'mint' && (
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

      {/* Minted NFTs Tab */}
      {activeTab === 'minted' &&
        (() => {
          const userWalletAddress = wallet.publicKey?.toBase58();

          const dedupedMintedNFTs = Object.values(
            mintedNFTs.reduce(
              (acc, nft) => {
                if (!nft.mintAddress) return acc;

                const existing = acc[nft.mintAddress];
                const currentUpdated = new Date(nft.updatedAt ?? 0);
                const existingUpdated = existing ? new Date(existing.updatedAt ?? 0) : new Date(0);

                if (!existing || currentUpdated > existingUpdated) {
                  acc[nft.mintAddress] = nft;
                }

                return acc;
              },
              {} as Record<string, MintedNFT>
            )
          );

          console.log(
            '🔁 Rendering deduped NFTs:',
            dedupedMintedNFTs.map((nft) => ({
              name: nft.title,
              mint: nft.mintAddress,
              owner: nft.currentOwner,
              price: nft.priceSol,
            }))
          );

          return (
            <div className={styles.mintedSection}>
              <h2>Minted NFTs</h2>
              <div className={styles.grid}>
                {dedupedMintedNFTs.length > 0 ? (
                  dedupedMintedNFTs.map((nft, index) => {
                    const uniqueKey = `${nft.mintAddress ?? 'nomint'}-${index}`;
                    const newOwnerValue = transferInputs[uniqueKey] || '';
                    const isCurrentUserOwner = nft.currentOwner === userWalletAddress;

                    return (
                      <div key={uniqueKey} className={styles.nftCard}>
                        <img
                          src={nft.image?.startsWith('http') ? nft.image : '/fallback.png'}
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
                                onClick={() => handleCopy(`mint-${index}`, nft.mintAddress || '')}
                              >
                                {nft.mintAddress.slice(0, 4)}...{nft.mintAddress.slice(-4)}{' '}
                                <FaCopy style={{ marginLeft: '6px' }} />
                                <span className={styles.tooltip}>
                                  {copiedField === `mint-${index}` ? 'Copied!' : 'Copy Address'}
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
                                onClick={() => handleCopy(`owner-${index}`, nft.currentOwner || '')}
                              >
                                {nft.currentOwner.slice(0, 4)}...{nft.currentOwner.slice(-4)}{' '}
                                <FaCopy style={{ marginLeft: '6px' }} />
                                <span className={styles.tooltip}>
                                  {copiedField === `owner-${index}` ? 'Copied!' : 'Copy Address'}
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
                              onChange={(e) =>
                                handleTransferInputChange(uniqueKey, e.target.value.trim())
                              }
                            />
                            {newOwnerValue && !isValidSolanaAddress(newOwnerValue) && (
                              <p className={styles.transferWarning}>Invalid wallet address</p>
                            )}
                            <button
                              onClick={() =>
                                transferNftToSellerAuto(nft.mintAddress!, newOwnerValue)
                              }
                              disabled={!isValidSolanaAddress(newOwnerValue)}
                            >
                              Transfer NFT to Seller
                            </button>
                          </div>
                        ) : (
                          <p style={{ color: 'red' }}>Only the NFT owner can transfer this item.</p>
                        )}
                        <button onClick={() => setSelectedMetadataUri(nft.metadataUri)}>
                          View Details
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p>No minted NFTs yet.</p>
                )}
              </div>
            </div>
          );
        })()}

      {/* Transferred Tab (optional filtered version) */}
      {activeTab === 'transferred' && (
        <div className={styles.mintedSection}>
          <h2>Transferred NFTs</h2>
          <div className={styles.grid}>
            {mintedNFTs.filter((n) => n.currentOwner !== adminWallet).length > 0 ? (
              mintedNFTs
                .filter((n) => n.currentOwner !== adminWallet)
                .map((nft, index) => (
                  <div key={index} className={styles.nftCard}>
                    <img src={nft.image} alt={nft.title} />
                    <h3>{nft.title}</h3>
                    <p>
                      <strong>Owner:</strong> {nft.currentOwner?.slice(0, 4)}...
                      {nft.currentOwner?.slice(-4)}
                    </p>
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

      {/* Detail Overlay */}
      {selectedMetadataUri && (
        <div className={styles.detailOverlay}>
          <div className={styles.detailContainer}>
            <button className={styles.closeButton} onClick={() => setSelectedMetadataUri(null)}>
              Close
            </button>
            <NftDetailCard
              metadataUri={selectedMetadataUri}
              mintAddress={
                mintedNFTs.find((n) => n.metadataUri === selectedMetadataUri)?.mintAddress
              }
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
                  { trait_type: 'Brand', value: brand },
                  { trait_type: 'Model', value: model },
                  { trait_type: 'Serial Number', value: serialNumber },
                  { trait_type: 'Material', value: material },
                  { trait_type: 'Production Year', value: productionYear },
                  { trait_type: 'Movement', value: movement },
                  { trait_type: 'Water Resistance', value: waterResistance },
                  { trait_type: 'Dial Color', value: dialColor },
                  { trait_type: 'Country', value: country },
                  { trait_type: 'Release Date', value: releaseDate },
                  { trait_type: 'Box & Papers', value: boxPapers },
                  { trait_type: 'Condition', value: condition },
                  { trait_type: 'Warranty Info', value: warrantyInfo },
                  { trait_type: 'Certificate', value: certificate },
                  { trait_type: 'Features', value: features },
                  { trait_type: 'Limited Edition', value: limitedEdition },
                ],
              }} // as above
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateNFT;
