const { Connection, PublicKey } = require('@solana/web3.js');
const multisig = require('@sqds/multisig');
require('dotenv').config({ path: '.env.local' });

async function checkMembers() {
  const msigAddress = process.env.NEXT_PUBLIC_SQUADS_MSIG;
  console.log('Multisig Address:', msigAddress);
  
  if (!msigAddress) {
    console.log('No NEXT_PUBLIC_SQUADS_MSIG configured');
    return;
  }
  
  const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com');
  
  try {
    const msigPk = new PublicKey(msigAddress);
    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);
    
    console.log('\nMultisig Details:');
    console.log('  Threshold:', multisigAccount.threshold);
    console.log('  Members:', multisigAccount.members.length);
    console.log('\nMembers List:');
    multisigAccount.members.forEach((m, i) => {
      console.log('  ' + (i+1) + '. ' + m.key.toBase58());
      console.log('     Permissions:', JSON.stringify(m.permissions));
    });
    
    // Check admin wallets
    console.log('\n--- Checking Admin Wallets ---');
    const adminWallets = process.env.ADMIN_WALLETS ? process.env.ADMIN_WALLETS.split(',').map(w => w.trim()) : [];
    const superAdminWallets = process.env.SUPER_ADMIN_WALLETS ? process.env.SUPER_ADMIN_WALLETS.split(',').map(w => w.trim()) : [];
    const allAdmins = [...new Set([...adminWallets, ...superAdminWallets])];
    
    console.log('Admin wallets configured:', allAdmins.length);
    allAdmins.forEach(wallet => {
      const isMember = multisigAccount.members.some(m => m.key.toBase58() === wallet);
      console.log('  ' + wallet.slice(0,8) + '...' + wallet.slice(-4) + ' : ' + (isMember ? 'IS MEMBER' : 'NOT MEMBER'));
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkMembers();
