import { Layout } from './components/Layout'
import { AirdropForm } from './components/AirdropForm'

function App() {
  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Batch Airdrop</h1>
          <p className="text-muted-foreground">
            Distribute ERC20 tokens and native currency to multiple recipients in a single flow.
          </p>
        </div>

        <AirdropForm />
      </div>
    </Layout>
  )
}

export default App
