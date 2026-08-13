import { useWallet } from "../context/WalletContext";
import { shortAddress, chainName } from "../lib/format";

export default function ConnectButton() {
  const { account, chainId, connecting, connect, disconnect } = useWallet();

  if (account) {
    return (
      <button className="secondary" onClick={disconnect} title="Disconnect wallet">
        {shortAddress(account)} · {chainName(chainId)}
      </button>
    );
  }

  return (
    <button onClick={connect} disabled={connecting}>
      {connecting ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
