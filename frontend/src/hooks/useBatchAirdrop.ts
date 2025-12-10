import { useState } from 'react';
import { usePublicClient, useWalletClient } from 'wagmi';
import { parseUnits, parseEther, formatUnits, formatEther, erc20Abi, type Address, encodeFunctionData } from 'viem';

export interface Recipient {
  id: string;
  address: string;
  mainTokenAmount: string;
  nativeAmount: string;
}

export interface AirdropConfig {
  mainTokenAddress: string;
  recipients: Recipient[];
}

const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

const multicall3Abi = [
  {
    inputs: [{ components: [{ name: 'target', type: 'address' }, { name: 'allowFailure', type: 'bool' }, { name: 'value', type: 'uint256' }, { name: 'callData', type: 'bytes' }], name: 'calls', type: 'tuple[]' }],
    name: 'aggregate3Value',
    outputs: [{ components: [{ name: 'success', type: 'bool' }, { name: 'returnData', type: 'bytes' }], name: 'returnData', type: 'tuple[]' }],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [{ components: [{ name: 'target', type: 'address' }, { name: 'allowFailure', type: 'bool' }, { name: 'callData', type: 'bytes' }], name: 'calls', type: 'tuple[]' }],
    name: 'aggregate3',
    outputs: [{ components: [{ name: 'success', type: 'bool' }, { name: 'returnData', type: 'bytes' }], name: 'returnData', type: 'tuple[]' }],
    stateMutability: 'payable',
    type: 'function'
  }
] as const;

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
    addLog('🚀 Starting Optimized Batch Airdrop...');

    try {
      const { mainTokenAddress, recipients } = config;
      const sender = walletClient.account.address;

      if (!mainTokenAddress || !mainTokenAddress.startsWith('0x')) {
          throw new Error('Invalid Main Token Address');
      }

      addLog(`Wallet: ${sender}`);
      
      // 1. Get Token Info
      addLog(`Reading token info...`);
      const decimals = await publicClient.readContract({
        address: mainTokenAddress as Address,
        abi: erc20Abi,
        functionName: 'decimals'
      });
      addLog(`Decimals: ${decimals}`);

      // 2. Calculate Totals and Prepare Calls
      let totalMain = 0n;
      let totalNative = 0n;
      const calls: { target: Address; allowFailure: boolean; value: bigint; callData: `0x${string}` }[] = [];

      for (const recipient of recipients) {
        if (!recipient.address || !recipient.address.startsWith('0x')) continue;

        // ERC20 Transfer
        if (recipient.mainTokenAmount && parseFloat(recipient.mainTokenAmount) > 0) {
            const amount = parseUnits(recipient.mainTokenAmount, decimals);
            totalMain += amount;
            
            // For Multicall, we need to use transferFrom(user, recipient, amount)
            // The Multicall contract is the caller, so it needs allowance.
            const callData = encodeFunctionData({
                abi: erc20Abi,
                functionName: 'transferFrom',
                args: [sender, recipient.address as Address, amount]
            });

            calls.push({
                target: mainTokenAddress as Address,
                allowFailure: true, // If one fails, others generally proceed or we can set false to revert all
                value: 0n,
                callData
            });
        }

        // Native Transfer
        if (recipient.nativeAmount && parseFloat(recipient.nativeAmount) > 0) {
            const amount = parseEther(recipient.nativeAmount);
            totalNative += amount;
            
            // Multicall3 supports sending value. We just call a simple empty call or specific function?
            // Actually aggregate3Value calls.target.call{value: value}(callData)
            // To just send ETH, target is recipient, callData empty.
            calls.push({
                target: recipient.address as Address,
                allowFailure: true,
                value: amount,
                callData: '0x'
            });
        }
      }

      addLog(`Total ERC20: ${formatUnits(totalMain, decimals)}`);
      addLog(`Total Native: ${formatEther(totalNative)} ETH`);
      addLog(`Total Actions: ${calls.length}`);

      if (calls.length === 0) {
          addLog('⚠ No actions to execute.');
          setLoading(false);
          return;
      }

      // 3. Check Allowance for ERC20
      if (totalMain > 0n) {
          const allowance = await publicClient.readContract({
              address: mainTokenAddress as Address,
              abi: erc20Abi,
              functionName: 'allowance',
              args: [sender, MULTICALL3_ADDRESS]
          });

          if (allowance < totalMain) {
              addLog(`⚠ Insufficient Allowance. Approving Multicall...`);
              try {
                  const hash = await walletClient.writeContract({
                      address: mainTokenAddress as Address,
                      abi: erc20Abi,
                      functionName: 'approve',
                      args: [MULTICALL3_ADDRESS, totalMain],
                      chain: walletClient.chain
                  });
                  addLog(`  Approve Tx: ${hash.slice(0, 10)}...`);
                  addLog(`  Waiting for approval...`);
                  await publicClient.waitForTransactionReceipt({ hash });
                  addLog(`  ✓ Approved!`);
              } catch (e) {
                  throw new Error(`Approval failed: ${e instanceof Error ? e.message : 'Unknown'}`);
              }
          } else {
              addLog(`✓ Allowance sufficient.`);
          }
      }

      // 4. Execute Batch via Multicall
      addLog(`📦 Executing Batch Transaction...`);
      
      const hash = await walletClient.writeContract({
          address: MULTICALL3_ADDRESS,
          abi: multicall3Abi,
          functionName: 'aggregate3Value',
          args: [calls],
          // Need to send total Native value with the multicall
          value: totalNative,
          chain: walletClient.chain
      });

      addLog(`  ✓ Batch Tx Sent: ${hash.slice(0, 10)}...`);
      addLog(`  Waiting for confirmation...`);
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      addLog(`  ✅ Confirmed in block ${receipt.blockNumber}`);
      addLog('✅ Airdrop Complete!');

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
