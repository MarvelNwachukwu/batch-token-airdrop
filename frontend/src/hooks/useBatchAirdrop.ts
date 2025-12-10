import { useState } from 'react';
import { usePublicClient, useWalletClient } from 'wagmi';
import { parseUnits, parseEther, formatUnits, formatEther, erc20Abi, type Address } from 'viem';

export interface Recipient {
  id: string; // for React key
  address: string;
  mainTokenAmount: string; // e.g., "100"
  nativeAmount: string; // e.g., "0.001"
}

export interface AirdropConfig {
  mainTokenAddress: string;
  recipients: Recipient[];
}

export function useBatchAirdrop() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);
  const clearLogs = () => setLogs([]);

  const executeAirdrop = async (config: AirdropConfig) => {
    if (!walletClient || !publicClient) {
      addLog('❌ Wallet not connected');
      return;
    }

    setLoading(true);
    clearLogs();
    addLog('🚀 Starting Batch Airdrop...');

    try {
      const { mainTokenAddress, recipients } = config;
        
      if (!mainTokenAddress || !mainTokenAddress.startsWith('0x')) {
          throw new Error('Invalid Main Token Address');
      }

      const sender = walletClient.account.address;
      addLog(`Wallet: ${sender}`);
      
      // Get Decimals
      addLog(`Reading token info for ${mainTokenAddress}...`);
      const decimals = await publicClient.readContract({
        address: mainTokenAddress as Address,
        abi: erc20Abi,
        functionName: 'decimals'
      });
      addLog(`Decimals: ${decimals}`);

      // Calculate Totals
      const totalMain = recipients.reduce((acc, r) => acc + parseUnits(r.mainTokenAmount || '0', decimals), 0n);
      const totalNative = recipients.reduce((acc, r) => acc + parseEther(r.nativeAmount || '0'), 0n);

      addLog(`Total Main Token Required: ${formatUnits(totalMain, decimals)}`);
      addLog(`Total Native Required: ${formatEther(totalNative)} ETH`);

      addLog('--- Starting Transactions ---');

      for (let i = 0; i < recipients.length; i++) {
          const recipient = recipients[i];
          if (!recipient.address || !recipient.address.startsWith('0x')) {
            addLog(`❌ Skipping invalid address: ${recipient.address}`);
            continue;
          }

          addLog(`[${i + 1}/${recipients.length}] Processing ${recipient.address}...`);

          try {
            // 1. Send Main Token
            if (recipient.mainTokenAmount && parseFloat(recipient.mainTokenAmount) > 0) {
                addLog(`  Sending ${recipient.mainTokenAmount} Tokens...`);
                const hash = await walletClient.writeContract({
                    address: mainTokenAddress as Address,
                    abi: erc20Abi,
                    functionName: 'transfer',
                    args: [recipient.address as Address, parseUnits(recipient.mainTokenAmount, decimals)],
                    chain: walletClient.chain
                });
                addLog(`  ✓ Tokens sent! Tx: ${hash.slice(0, 10)}...`);
                
                addLog(`  Waiting for confirmation...`);
                await publicClient.waitForTransactionReceipt({ hash });
                addLog(`  ✓ Confirmed`);
            }

            // 2. Send Native Token
            if (recipient.nativeAmount && parseFloat(recipient.nativeAmount) > 0) {
                addLog(`  Sending ${recipient.nativeAmount} Native...`);
                const hash = await walletClient.sendTransaction({
                    to: recipient.address as Address,
                    value: parseEther(recipient.nativeAmount),
                    chain: walletClient.chain
                });
                addLog(`  ✓ Native sent! Tx: ${hash.slice(0, 10)}...`);

                addLog(`  Waiting for confirmation...`);
                await publicClient.waitForTransactionReceipt({ hash });
                addLog(`  ✓ Confirmed`);
            }

          } catch (err) {
              console.error(err);
              addLog(`  ❌ Failed to send to ${recipient.address}: ${err instanceof Error ? err.message : 'Unknown error'}`);
              // Continue to next? Yes.
          }
      }

      addLog('✅ Airdrop Batch Completed!');
    } catch (error) {
      console.error(error);
      addLog(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return {
    executeAirdrop,
    loading,
    logs
  };
}
