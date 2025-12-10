import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createWalletClient, createPublicClient, http, parseUnits, type Address, formatUnits, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { fraxtal } from 'viem/chains';

loadEnv();

const envSchema = z.object({
  RPC_URL: z.string().default('https://rpc.frax.com'),
  PRIVATE_KEY: z.string().startsWith('0x').min(1, 'PRIVATE_KEY is required'),
  MAIN_TOKEN_ADDRESS: z.string().min(1, 'MAIN_TOKEN_ADDRESS is required'),
  GAS_TOKEN_ADDRESS: z.string().min(1, 'GAS_TOKEN_ADDRESS is required'),
  DEBUG: z.coerce.boolean().default(false)
});

const env = envSchema.parse(process.env);

// ERC20 ABI for transfer function
const ERC20_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

interface BatchSendConfig {
  chainId: number;
  rpcUrl: string;
  privateKey: Hex;
  mainTokenAddress: Address;
  gasTokenAddress: Address;
  recipients: Array<{
    address: Address;
    mainTokenAmount: string; // Amount of main token (e.g., "100" for 100 tokens)
    gasTokenAmount: string;  // Amount of gas token (e.g., "50" for 50 tokens)
  }>;
}

async function batchSendTokens(config: BatchSendConfig) {
  const { chainId, rpcUrl, privateKey, mainTokenAddress, gasTokenAddress, recipients } = config;

  // Setup account
  const account = privateKeyToAccount(privateKey);

  // Setup clients
  const publicClient = createPublicClient({
    chain: chainId === 252 ? fraxtal : undefined,
    transport: http(rpcUrl)
  });

  const walletClient = createWalletClient({
    account,
    chain: chainId === 252 ? fraxtal : undefined,
    transport: http(rpcUrl)
  });

  console.log(`\n🚀 Batch Token Airdrop`);
  console.log(`📍 Network: Chain ID ${chainId}`);
  console.log(`👛 Sender: ${account.address}`);
  console.log(`🪙 Main Token: ${mainTokenAddress}`);
  console.log(`⛽ Gas Token: ${gasTokenAddress}`);
  console.log(`📊 Recipients: ${recipients.length}\n`);

  try {
    // Get token decimals for both tokens
    const [mainDecimals, gasDecimals] = await Promise.all([
      publicClient.readContract({
        address: mainTokenAddress,
        abi: ERC20_ABI,
        functionName: 'decimals'
      }),
      publicClient.readContract({
        address: gasTokenAddress,
        abi: ERC20_ABI,
        functionName: 'decimals'
      })
    ]);

    console.log(`Main token decimals: ${mainDecimals}`);
    console.log(`Gas token decimals: ${gasDecimals}\n`);

    // Check sender balances for both tokens
    const [mainBalance, gasBalance] = await Promise.all([
      publicClient.readContract({
        address: mainTokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address]
      }),
      publicClient.readContract({
        address: gasTokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address]
      })
    ]);

    console.log(`Your main token balance: ${formatUnits(mainBalance, mainDecimals)} tokens`);
    console.log(`Your gas token balance: ${formatUnits(gasBalance, gasDecimals)} tokens\n`);

    // Calculate total amounts needed
    const totalMainAmount = recipients.reduce((sum, recipient) => {
      return sum + parseUnits(recipient.mainTokenAmount, mainDecimals);
    }, 0n);

    const totalGasAmount = recipients.reduce((sum, recipient) => {
      return sum + parseUnits(recipient.gasTokenAmount, gasDecimals);
    }, 0n);

    console.log(`Total main token to send: ${formatUnits(totalMainAmount, mainDecimals)} tokens`);
    console.log(`Total gas token to send: ${formatUnits(totalGasAmount, gasDecimals)} tokens`);

    if (mainBalance < totalMainAmount) {
      throw new Error(`Insufficient main token balance. Need ${formatUnits(totalMainAmount, mainDecimals)}, have ${formatUnits(mainBalance, mainDecimals)}`);
    }

    if (gasBalance < totalGasAmount) {
      throw new Error(`Insufficient gas token balance. Need ${formatUnits(totalGasAmount, gasDecimals)}, have ${formatUnits(gasBalance, gasDecimals)}`);
    }

    console.log(`\n✅ Sufficient balance for both tokens. Starting airdrop...\n`);

    // Send tokens to each recipient
    const results = [];
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      console.log(`[${i + 1}/${recipients.length}] Airdropping to ${recipient.address}...`);
      console.log(`  Main token: ${recipient.mainTokenAmount}`);
      console.log(`  Gas token: ${recipient.gasTokenAmount}`);

      const txHashes: { main?: string; gas?: string } = {};
      let mainSuccess = false;
      let gasSuccess = false;
      let errorMsg = '';

      try {
        // Send main token
        const mainHash = await walletClient.writeContract({
          address: mainTokenAddress,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [recipient.address, parseUnits(recipient.mainTokenAmount, mainDecimals)]
        });
        txHashes.main = mainHash;
        console.log(`  ✓ Main token tx: ${mainHash}`);

        // Wait for main token confirmation
        const mainReceipt = await publicClient.waitForTransactionReceipt({ hash: mainHash });
        console.log(`  ✓ Main token confirmed in block ${mainReceipt.blockNumber}`);
        mainSuccess = true;

        // Send gas token
        const gasHash = await walletClient.writeContract({
          address: gasTokenAddress,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [recipient.address, parseUnits(recipient.gasTokenAmount, gasDecimals)]
        });
        txHashes.gas = gasHash;
        console.log(`  ✓ Gas token tx: ${gasHash}`);

        // Wait for gas token confirmation
        const gasReceipt = await publicClient.waitForTransactionReceipt({ hash: gasHash });
        console.log(`  ✓ Gas token confirmed in block ${gasReceipt.blockNumber}`);
        gasSuccess = true;
        console.log(`  ✅ Airdrop complete\n`);

        results.push({
          recipient: recipient.address,
          mainTokenAmount: recipient.mainTokenAmount,
          gasTokenAmount: recipient.gasTokenAmount,
          mainTokenHash: txHashes.main,
          gasTokenHash: txHashes.gas,
          status: 'success'
        });
      } catch (error) {
        errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`  ✗ Failed: ${errorMsg}\n`);
        results.push({
          recipient: recipient.address,
          mainTokenAmount: recipient.mainTokenAmount,
          gasTokenAmount: recipient.gasTokenAmount,
          mainTokenHash: txHashes.main,
          gasTokenHash: txHashes.gas,
          mainTokenSuccess: mainSuccess,
          gasTokenSuccess: gasSuccess,
          status: 'failed',
          error: errorMsg
        });
      }
    }

    // Summary
    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;

    console.log(`\n📊 Summary:`);
    console.log(`  ✓ Successful: ${successful}`);
    console.log(`  ✗ Failed: ${failed}`);
    console.log(`  📝 Total: ${results.length}\n`);

    return results;

  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

// Example usage
async function main() {
  const config: BatchSendConfig = {
    chainId: 252, // Fraxtal
    rpcUrl: env.RPC_URL,
    privateKey: env.PRIVATE_KEY as Hex,
    mainTokenAddress: env.MAIN_TOKEN_ADDRESS as Address,
    gasTokenAddress: env.GAS_TOKEN_ADDRESS as Address,
    recipients: [
      {
        address: '0xc1b4d877f267c998a2cde3762622e0c0aa0d65e0' as Address,
        mainTokenAmount: '100',
        gasTokenAmount: '0.001'
      },
      {
        address: '0x2a175aea05465fc6ccfaa1de550bf611aa379a18' as Address,
        mainTokenAmount: '50',
        gasTokenAmount: '0.001'
      },
      // Add more recipients as needed
    ]
  };

  if (env.DEBUG) {
    console.log('Loaded config', {
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
      mainTokenAddress: config.mainTokenAddress,
      gasTokenAddress: config.gasTokenAddress,
      recipients: config.recipients
    });
  }

  if (!config.privateKey) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }

  if (!config.mainTokenAddress) {
    throw new Error('MAIN_TOKEN_ADDRESS environment variable is required');
  }

  if (!config.gasTokenAddress) {
    throw new Error('GAS_TOKEN_ADDRESS environment variable is required');
  }

  await batchSendTokens(config);
}

// Run if called directly (ESM-safe check)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(console.error);
}

export { batchSendTokens, type BatchSendConfig };
