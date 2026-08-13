import { useEffect, useState } from "react";
import { ZeroAddress, parseUnits } from "ethers";
import { useWallet } from "../context/WalletContext";
import ConnectPrompt from "../components/ConnectPrompt";
import { getToken } from "../lib/erc20";
import { tokenMeta } from "../lib/tokens";
import { shortHash, txUrl } from "../lib/format";

export default function SendPayment() {
  const { account, chainId, contracts, signer } = useWallet();
  const [recipient, setRecipient] = useState("");
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [whitelisted, setWhitelisted] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const isEth = token === "" || token === ZeroAddress;

  useEffect(() => {
    if (!contracts?.processor) return;
    contracts.processor
      .queryFilter("TokenWhitelisted")
      .then((logs) => setWhitelisted(logs.map((l) => l.args[0])))
      .catch(() => {});
  }, [contracts]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!contracts?.processor) {
      setError("Connect your wallet first.");
      return;
    }
    setBusy(true);
    try {
      const processor = contracts.processor;
      const decimals = isEth ? 18 : (await tokenMeta(token, signer)).decimals;
      const amountWei = parseUnits(amount, decimals);

      let tx;
      if (isEth) {
        tx = await processor.pay(recipient, ZeroAddress, amountWei, { value: amountWei });
      } else {
        const tokenContract = getToken(token, signer);
        const processorAddress = await processor.getAddress();
        const allowance = await tokenContract.allowance(account, processorAddress);
        if (allowance < amountWei) {
          const approveTx = await tokenContract.approve(processorAddress, amountWei);
          await approveTx.wait();
        }
        tx = await processor.pay(recipient, token, amountWei);
      }
      await tx.wait();
      setResult(tx.hash);
    } catch (err) {
      setError(err.shortMessage || err.reason || err.message || "Transaction failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!account) return <ConnectPrompt title="Send payment" />;

  return (
    <div className="panel">
      <h2>Send payment</h2>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Recipient address</label>
          <input
            className="mono"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x…"
            required
          />
        </div>

        <div className="field">
          <label>Token</label>
          <select value={token} onChange={(e) => setToken(e.target.value)}>
            <option value="">ETH (native)</option>
            {whitelisted.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <div className="muted" style={{ marginTop: 4 }}>
            ERC-20 payments must be whitelisted by the{" "}
            <span className="mono">WHITELIST_MANAGER_ROLE</span>.
          </div>
        </div>

        <div className="field">
          <label>Amount</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={isEth ? "0.0 ETH" : "0.0"}
            required
          />
        </div>

        {error && <div className="banner error">{error}</div>}
        {result && (
          <div className="banner success">
            Payment sent!{" "}
            {txUrl(chainId, result) ? (
              <a href={txUrl(chainId, result)} target="_blank" rel="noreferrer">
                {shortHash(result)}
              </a>
            ) : (
              <span className="mono">{shortHash(result)}</span>
            )}
          </div>
        )}

        <button type="submit" disabled={busy}>
          {busy ? "Processing…" : "Send payment"}
        </button>
      </form>
    </div>
  );
}
