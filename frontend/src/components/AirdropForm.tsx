import { useState } from 'react';
import { Plus, Trash2, Send, AlertCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { useBatchAirdrop, type Recipient } from '../hooks/useBatchAirdrop';
import { useAccount } from 'wagmi';

export function AirdropForm() {
  const { isConnected } = useAccount();
  const { executeAirdrop, loading, logs } = useBatchAirdrop();

  const [mainTokenAddress, setMainTokenAddress] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([
    { id: '1', address: '', mainTokenAmount: '', nativeAmount: '' }
  ]);

  const addRecipient = () => {
    setRecipients([
      ...recipients,
      { id: crypto.randomUUID(), address: '', mainTokenAmount: '', nativeAmount: '' }
    ]);
  };

  const removeRecipient = (id: string) => {
    if (recipients.length > 1) {
      setRecipients(recipients.filter(r => r.id !== id));
    }
  };

  const updateRecipient = (id: string, field: keyof Recipient, value: string) => {
    setRecipients(recipients.map(r => 
      r.id === id ? { ...r, [field]: value } : r
    ));
  };

  const handleSubmit = () => {
    executeAirdrop({
      mainTokenAddress,
      recipients
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Form Section */}
      <div className="space-y-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">Configuration</h2>
           <Input 
            label="Main Token Address (ERC20)"
            placeholder="0x..."
            value={mainTokenAddress}
            onChange={(e) => setMainTokenAddress(e.target.value)} 
          />
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Recipients</h2>
            <Button size="sm" variant="outline" onClick={addRecipient}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>

          <div className="space-y-4">
            {recipients.map((recipient, index) => (
              <div key={recipient.id} className="relative p-4 rounded-lg bg-background/50 border border-border space-y-3">
                 <div className="absolute top-2 right-2">
                   {recipients.length > 1 && (
                     <button onClick={() => removeRecipient(recipient.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                       <Trash2 className="w-4 h-4" />
                     </button>
                   )}
                 </div>
                 
                 <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-muted-foreground bg-surface px-2 py-1 rounded">#{index + 1}</span>
                 </div>

                 <Input 
                    placeholder="Recipient Address (0x...)" 
                    value={recipient.address}
                    onChange={(e) => updateRecipient(recipient.id, 'address', e.target.value)}
                 />
                 
                 <div className="grid grid-cols-2 gap-4">
                    <Input 
                      placeholder="Token Amount" 
                      type="number"
                      value={recipient.mainTokenAmount}
                      onChange={(e) => updateRecipient(recipient.id, 'mainTokenAmount', e.target.value)}
                    />
                    <Input 
                      placeholder="Native Amount (ETH)" 
                      type="number"
                      value={recipient.nativeAmount}
                      onChange={(e) => updateRecipient(recipient.id, 'nativeAmount', e.target.value)}
                    />
                 </div>
              </div>
            ))}
          </div>
        </Card>

        <Button 
          className="w-full" 
          size="lg" 
          disabled={!isConnected || loading}
          onClick={handleSubmit}
        >
          {!isConnected ? 'Connect Wallet First' : loading ? 'Processing...' : (
            <>
              <Send className="w-4 h-4 mr-2" /> Execute Airdrop
            </>
          )}
        </Button>
      </div>

      {/* Status/Logs Section */}
      <div className="space-y-6">
        <Card className="p-6 h-full flex flex-col">
          <h2 className="text-xl font-semibold mb-4">Activity Log</h2>
          <div className="flex-1 bg-background rounded-lg border border-border p-4 font-mono text-sm overflow-y-auto max-h-[600px]">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
                 <AlertCircle className="w-8 h-8 mb-2" />
                 <p>Ready to start</p>
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((log, i) => (
                  <div key={i} className="border-b border-border/50 last:border-0 pb-1 last:pb-0">
                    <span className="text-primary mr-2">›</span>
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
