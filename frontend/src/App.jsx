import { WalletProvider } from "./context/WalletContext.jsx";
import Escrows from "./pages/Escrows.jsx";

export default function App() {
  return (
    <WalletProvider>
      <header className="app-header">
        <span className="logo-dot" aria-hidden="true" />
        <strong>smart-contract-escrow</strong>
        <span className="tagline">Stellar · Soroban escrow</span>
      </header>
      <main>
        <Escrows />
      </main>
      <footer className="app-footer">
        Unaudited — testnet only.{" "}
        <a href="https://github.com/Yinklekay64/smart-contract-escrow" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </WalletProvider>
  );
}
