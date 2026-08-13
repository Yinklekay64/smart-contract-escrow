import { Routes, Route, NavLink } from "react-router-dom";
import { WalletProvider } from "./context/WalletContext";
import ConnectButton from "./components/ConnectButton";
import ConfigBanner from "./components/ConfigBanner";
import SendPayment from "./pages/SendPayment";
import Invoices from "./pages/Invoices";
import Subscriptions from "./pages/Subscriptions";
import Dashboard from "./pages/Dashboard";

export default function App() {
  return (
    <WalletProvider>
      <div className="app">
        <header className="topbar">
          <div className="brand">stellar-payment-gateway-sdk-main</div>
          <nav>
            <NavLink to="/" end>
              Send
            </NavLink>
            <NavLink to="/invoices">Invoices</NavLink>
            <NavLink to="/subscriptions">Subscriptions</NavLink>
            <NavLink to="/dashboard">Dashboard</NavLink>
          </nav>
          <ConnectButton />
        </header>

        <ConfigBanner />

        <main>
          <Routes>
            <Route path="/" element={<SendPayment />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </WalletProvider>
  );
}
