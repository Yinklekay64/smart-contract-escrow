import { useWallet } from "../context/WalletContext";
import { ADDRESSES_CONFIGURED, CHAIN_ID } from "../lib/config";
import { chainName } from "../lib/format";

export default function ConfigBanner() {
  const { account, chainId } = useWallet();

  if (!ADDRESSES_CONFIGURED) {
    return (
      <div className="banner warn">
        Contract addresses are not configured. Deploy the contracts and set{" "}
        <span className="mono">VITE_PAYMENT_PROCESSOR_ADDRESS</span>,{" "}
        <span className="mono">VITE_INVOICE_ADDRESS</span>, and{" "}
        <span className="mono">VITE_SUBSCRIPTION_ADDRESS</span> in{" "}
        <span className="mono">frontend/.env</span> (see{" "}
        <span className="mono">frontend/.env.example</span>).
      </div>
    );
  }

  if (account && chainId && chainId !== CHAIN_ID) {
    return (
      <div className="banner warn">
        You are connected to {chainName(chainId)} but this app targets{" "}
        {chainName(CHAIN_ID)}. Switch networks in your wallet.
      </div>
    );
  }

  return null;
}
