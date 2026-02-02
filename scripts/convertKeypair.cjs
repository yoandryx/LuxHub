const fs = require('fs');
const path = require('path');

// Input and output paths
const inputPath = process.argv[2] || '/home/ycstudio/luxhub-squads-member.json';
const outputPath = process.argv[3] || path.join(path.dirname(inputPath), 'keypair-base58.json');

// Base58 alphabet (Bitcoin/Solana standard)
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(buffer) {
  const bytes = Uint8Array.from(buffer);
  const digits = [0];

  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  // Handle leading zeros
  let output = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    output += ALPHABET[0];
  }

  // Convert digits to string
  for (let i = digits.length - 1; i >= 0; i--) {
    output += ALPHABET[digits[i]];
  }

  return output;
}

try {
  // Read the keypair JSON (byte array format)
  const keypairBytes = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  // Convert to Base58
  const base58Key = encodeBase58(keypairBytes);

  // Create output JSON
  const output = {
    format: 'base58',
    privateKey: base58Key,
    note: 'Import this privateKey into Phantom or other Solana wallets'
  };

  // Write to file
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`Converted keypair saved to: ${outputPath}`);
  console.log('You can now import the privateKey value into your wallet.');

} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
