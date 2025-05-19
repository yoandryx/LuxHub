// /pages/requestMint.tsx
import React, { useState } from 'react';
import styles from '../styles/CreateNFT.module.css';
import { useWallet } from '@solana/wallet-adapter-react';

const RequestMint = () => {
  const wallet = useWallet();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [brand, setBrand] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [fileCid, setFileCid] = useState('');
  const [status, setStatus] = useState('');

  const handleSubmit = async () => {
    if (!wallet.publicKey) return alert('Connect your wallet first');
    const payload = {
      title,
      description,
      brand,
      serialNumber,
      fileCid,
      wallet: wallet.publicKey.toBase58(),
      timestamp: Date.now(),
    };

    const res = await fetch('/api/nft/requestMint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setStatus('✅ Mint request submitted!');
    } else {
      setStatus('❌ Failed to submit request.');
    }
  };

  return (
    <div className={styles.pageContainer}>
      <h2>Request Admin Mint</h2>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Watch Title" />
      <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand" />
      <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="Serial Number" />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
      <input value={fileCid} onChange={(e) => setFileCid(e.target.value)} placeholder="Image CID" />
      <button onClick={handleSubmit}>Submit Mint Request</button>
      {status && <p>{status}</p>}
    </div>
  );
};

export default RequestMint;
