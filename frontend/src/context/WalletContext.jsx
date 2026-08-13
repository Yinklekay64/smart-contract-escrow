import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { connectFreighter, getFreighterNetwork } from "../lib/freighter";
import { DEFAULT_NETWORK_PASSPHRASE, DEFAULT_RPC_URL } from "../lib/sdk";

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [publicKey, setPublicKey] = useState(null);
  const [networkPassphrase, setNetworkPassphrase] = useState(DEFAULT_NETWORK_PASSPHRASE);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const rpcUrl = DEFAULT_RPC_URL;

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [address, network] = await Promise.all([
        connectFreighter(),
        getFreighterNetwork(),
      ]);
      setPublicKey(address);
      setNetworkPassphrase(network.networkPassphrase);
    } catch (e) {
      setError(e.message || "Failed to connect");
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setPublicKey(null);
    setError(null);
  }, []);

  // Auto-connect if Freighter is already unlocked.
  useEffect(() => {
    connect().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <WalletContext.Provider
      value={{ publicKey, networkPassphrase, rpcUrl, error, busy, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
