# Batch Token Airdrop

A TypeScript script for batch sending two tokens (main token + gas token) to multiple addresses on Fraxtal network using viem.

## Features

- ✅ Batch airdrop to multiple addresses
- ✅ Sends two tokens per address (main token + gas token)
- ✅ Validates balances before sending
- ✅ Transaction confirmation tracking
- ✅ Detailed progress logging
- ✅ Error handling with partial success tracking

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file or set environment variables:

```bash
PRIVATE_KEY=0x...
MAIN_TOKEN_ADDRESS=0x...
GAS_TOKEN_ADDRESS=0x...
RPC_URL=https://rpc.frax.com  # Optional, defaults to Fraxtal RPC
```

## Usage

### Via Environment Variables

Edit the recipients array in `index.ts` and run:

```bash
npm start
```

### Programmatic Usage

```typescript
import { batchSendTokens } from './index';

await batchSendTokens({
  chainId: 252,
  rpcUrl: 'https://rpc.frax.com',
  privateKey: '0x...',
  mainTokenAddress: '0x...',
  gasTokenAddress: '0x...',
  recipients: [
    {
      address: '0x1234567890123456789012345678901234567890',
      mainTokenAmount: '100',
      gasTokenAmount: '10'
    },
    {
      address: '0x2345678901234567890123456789012345678901',
      mainTokenAmount: '50',
      gasTokenAmount: '5'
    }
  ]
});
```

## Network

- **Chain ID:** 252 (Fraxtal)
- **RPC:** https://rpc.frax.com

## Safety

- ⚠️ **Never commit your `.env` file or expose your private key**
- ✅ The script validates balances before sending
- ✅ Each transaction is confirmed before proceeding to the next

## License

MIT
