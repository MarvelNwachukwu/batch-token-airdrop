import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createWalletClient, createPublicClient, http, parseUnits, type Address, formatUnits, type Hex, erc20Abi, parseEther, formatEther } from 'viem';
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


interface BatchSendConfig {
  chainId: number;
  rpcUrl: string;
  privateKey: Hex;
  mainTokenAddress: Address;
  recipients: Array<{
    address: Address;
    mainTokenAmount: string; // Amount of main token (e.g., "100" for 100 tokens)
    nativeAmount: string;     // Amount of native gas token in ether (e.g., "0.001" for 0.001 ETH)
  }>;
}

async function batchSendTokens(config: BatchSendConfig) {
  const { chainId, rpcUrl, privateKey, mainTokenAddress, recipients } = config;

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
  console.log(`⛽ Native Token: Native currency`);
  console.log(`📊 Recipients: ${recipients.length}\n`);

  try {
    // Get main token decimals
    const mainDecimals = await publicClient.readContract({
      address: mainTokenAddress,
      abi: erc20Abi,
      functionName: 'decimals'
    });

    console.log(`Main token decimals: ${mainDecimals}\n`);

    // Check sender balances
    const [mainBalance, nativeBalance] = await Promise.all([
      publicClient.readContract({
        address: mainTokenAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account.address]
      }),
      publicClient.getBalance({ address: account.address })
    ]);

    console.log(`Your main token balance: ${formatUnits(mainBalance, mainDecimals)} tokens`);
    console.log(`Your native balance: ${formatEther(nativeBalance)} ETH\n`);

    // Calculate total amounts needed
    const totalMainAmount = recipients.reduce((sum, recipient) => {
      return sum + parseUnits(recipient.mainTokenAmount, mainDecimals);
    }, 0n);

    const totalNativeAmount = recipients.reduce((sum, recipient) => {
      return sum + parseEther(recipient.nativeAmount);
    }, 0n);

    console.log(`Total main token to send: ${formatUnits(totalMainAmount, mainDecimals)} tokens`);
    console.log(`Total native to send: ${formatEther(totalNativeAmount)} ETH`);

    if (mainBalance < totalMainAmount) {
      throw new Error(`Insufficient main token balance. Need ${formatUnits(totalMainAmount, mainDecimals)}, have ${formatUnits(mainBalance, mainDecimals)}`);
    }

    if (nativeBalance < totalNativeAmount) {
      throw new Error(`Insufficient native balance. Need ${formatEther(totalNativeAmount)}, have ${formatEther(nativeBalance)}`);
    }

    console.log(`\n✅ Sufficient balance for both tokens. Starting airdrop...\n`);

    // Send tokens to each recipient
    const results = [];
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      console.log(`[${i + 1}/${recipients.length}] Airdropping to ${recipient.address}...`);
      console.log(`  Main token: ${recipient.mainTokenAmount}`);
      console.log(`  Native: ${recipient.nativeAmount} ETH`);

      const txHashes: { main?: string; native?: string } = {};
      let mainSuccess = false;
      let nativeSuccess = false;
      let errorMsg = '';

      try {
        // Send main token (ERC20)
        const mainHash = await walletClient.writeContract({
          address: mainTokenAddress,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [recipient.address, parseUnits(recipient.mainTokenAmount, mainDecimals)]
        });
        txHashes.main = mainHash;
        console.log(`  ✓ Main token tx: ${mainHash}`);

        // Wait for main token confirmation
        const mainReceipt = await publicClient.waitForTransactionReceipt({ hash: mainHash });
        console.log(`  ✓ Main token confirmed in block ${mainReceipt.blockNumber}`);
        mainSuccess = true;

        // Send native currency
        const nativeHash = await walletClient.sendTransaction({
          to: recipient.address,
          value: parseEther(recipient.nativeAmount)
        });
        txHashes.native = nativeHash;
        console.log(`  ✓ Native tx: ${nativeHash}`);

        // Wait for native confirmation
        const nativeReceipt = await publicClient.waitForTransactionReceipt({ hash: nativeHash });
        console.log(`  ✓ Native confirmed in block ${nativeReceipt.blockNumber}`);
        nativeSuccess = true;
        console.log(`  ✅ Airdrop complete\n`);

        results.push({
          recipient: recipient.address,
          mainTokenAmount: recipient.mainTokenAmount,
          nativeAmount: recipient.nativeAmount,
          mainTokenHash: txHashes.main,
          nativeHash: txHashes.native,
          status: 'success'
        });
      } catch (error) {
        errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`  ✗ Failed: ${errorMsg}\n`);
        results.push({
          recipient: recipient.address,
          mainTokenAmount: recipient.mainTokenAmount,
          nativeAmount: recipient.nativeAmount,
          mainTokenHash: txHashes.main,
          nativeHash: txHashes.native,
          mainTokenSuccess: mainSuccess,
          nativeSuccess: nativeSuccess,
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
    recipients: [
      {
        address: '0xc1b4d877f267c998a2cde3762622e0c0aa0d65e0' as Address,
        mainTokenAmount: '100',
        nativeAmount: '0.001'
      },
      {
        address: '0xc1b4d877f267c998a2cde3762622e0c0aa0d65e0' as Address,
        mainTokenAmount: '50',
        nativeAmount: '0.001'
      },
      // Add more recipients as needed
    ]
  };

  if (env.DEBUG) {
    console.log('Loaded config', {
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
      mainTokenAddress: config.mainTokenAddress,
      recipients: config.recipients
    });
  }

  if (!config.privateKey) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }

  if (!config.mainTokenAddress) {
    throw new Error('MAIN_TOKEN_ADDRESS environment variable is required');
  }

  await batchSendTokens(config);
}

// Run if called directly (ESM-safe check)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(console.error);
}

export { batchSendTokens, type BatchSendConfig };
