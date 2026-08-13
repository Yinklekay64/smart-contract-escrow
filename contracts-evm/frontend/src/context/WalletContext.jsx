import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract } from "ethers";
import {
  PAYMENT_PROCESSOR_ADDRESS,
  INVOICE_ADDRESS,
  SUBSCRIPTION_ADDRESS,
} from "../lib/config";
import PaymentProcessorABI from "../lib/abis/PaymentProcessor.json";
import InvoiceABI from "../lib/abis/Invoice.json";
import SubscriptionABI from "../lib/abis/Subscription.json";

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!window.ethereum) return;
    const p = new BrowserProvider(window.ethereum);
    setProvider(p);
    try {
      const accounts = await p.listAccounts();
      if (accounts.length) {
        const s = await p.getSigner();
        setSigner(s);
        setAccount(await s.getAddress());
        setChainId(Number((await p.getNetwork()).chainId));
      }
    } catch {
      /* wallet locked or unavailable */
    }
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("No wallet detected. Please install MetaMask.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const p = new BrowserProvider(window.ethereum);
      await p.send("eth_requestAccounts", []);
      setProvider(p);
      const s = await p.getSigner();
      const network = await p.getNetwork();
      setSigner(s);
      setAccount(await s.getAddress());
      setChainId(Number(network.chainId));
    } catch (e) {
      setError(e.message || "Failed to connect wallet.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setSigner(null);
    setAccount(null);
    setChainId(null);
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    refresh();
    const onAccountsChanged = () => refresh();
    const onChainChanged = () => window.location.reload();
    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged", onChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccountsChanged);
      window.ethereum.removeListener("chainChanged", onChainChanged);
    };
  }, [refresh]);

  const contracts = useMemo(() => {
    if (!signer) return null;
    const mk = (abi, addr) => (addr ? new Contract(addr, abi, signer) : null);
    return {
      processor: mk(PaymentProcessorABI, PAYMENT_PROCESSOR_ADDRESS),
      invoice: mk(InvoiceABI, INVOICE_ADDRESS),
      subscription: mk(SubscriptionABI, SUBSCRIPTION_ADDRESS),
    };
  }, [signer]);

  const value = useMemo(
    () => ({ account, chainId, connecting, error, connect, disconnect, contracts, signer }),
    [account, chainId, connecting, error, connect, disconnect, contracts, signer]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  return useContext(WalletContext);
}
