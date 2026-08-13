import { useEffect, useState } from "react";
import { parseUnits } from "ethers";
import { useWallet } from "../context/WalletContext";
import ConnectPrompt from "../components/ConnectPrompt";
import { getToken } from "../lib/erc20";
import { tokenMeta, formatAmount } from "../lib/tokens";
import { shortHash, shortAddress, txUrl } from "../lib/format";

export default function Subscriptions() {
  const { account, chainId, contracts, signer } = useWallet();

  // create form
  const [merchant, setMerchant] = useState("");
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState("");
  const [maxCharges, setMaxCharges] = useState("");

  const [mySubs, setMySubs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  async function loadMySubs() {
    if (!contracts?.subscription || !account) return;
    const logs = await contracts.subscription.queryFilter(
      contracts.subscription.filters.SubscriptionCreated(undefined, account)
    );
    const items = [];
    for (const log of logs) {
      const id = log.args[0];
      const data = await contracts.subscription.subscriptions(id);
      const meta = await tokenMeta(log.args[3], signer);
      items.push({
        id,
        merchant: log.args[2],
        token: log.args[3],
        amount: log.args[4],
        interval: log.args[5],
        maxCharges: data.maxCharges,
        chargeCount: data.chargeCount,
        nextChargeTime: data.nextChargeTime,
        active: data.active,
        meta,
      });
    }
    setMySubs(items);
  }

  useEffect(() => {
    loadMySubs().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, account]);

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (!contracts?.subscription) return;
    setBusy(true);
    try {
      const meta = await tokenMeta(token, signer);
      const amountWei = parseUnits(amount, meta.decimals);
      const sub = contracts.subscription;
      const subAddress = await sub.getAddress();

      // Approve the contract for the full subscription value.
      const tokenContract = getToken(token, signer);
      const total = amountWei * BigInt(maxCharges);
      const allowance = await tokenContract.allowance(account, subAddress);
      if (allowance < total) {
        const approveTx = await tokenContract.approve(subAddress, total);
        await approveTx.wait();
      }

      const tx = await sub.createSubscription(merchant, token, amountWei, Number(interval), Number(maxCharges));
      await tx.wait();
      setMsg(`Subscription created in tx ${shortHash(tx.hash)}`);
      setAmount("");
      setMaxCharges("");
      await loadMySubs();
    } catch (err) {
      setError(err.shortMessage || err.reason || err.message || "Transaction failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCharge(id) {
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      const tx = await contracts.subscription.charge(id);
      await tx.wait();
      setMsg(`Charge processed in tx ${shortHash(tx.hash)}`);
      await loadMySubs();
    } catch (err) {
      setError(err.shortMessage || err.reason || err.message || "Charge failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(id) {
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      const tx = await contracts.subscription.cancel(id);
      await tx.wait();
      setMsg(`Subscription ${id.toString()} cancelled`);
      await loadMySubs();
    } catch (err) {
      setError(err.shortMessage || err.reason || err.message || "Cancel failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!account) return <ConnectPrompt title="Subscriptions" />;

  const now = Math.floor(Date.now() / 1000);

  return (
    <div>
      <div className="panel">
        <h2>Create subscription</h2>
        <form onSubmit={handleCreate}>
          <div className="row">
            <div className="field">
              <label>Merchant address</label>
              <input
                className="mono"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="0x…"
                required
              />
            </div>
            <div className="field">
              <label>Token address</label>
              <input
                className="mono"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="0x… ERC-20"
                required
              />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Amount per charge</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="field">
              <label>Interval (seconds)</label>
              <input
                type="number"
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                placeholder="604800 (1 week)"
                required
              />
            </div>
            <div className="field">
              <label>Max charges</label>
              <input
                type="number"
                value={maxCharges}
                onChange={(e) => setMaxCharges(e.target.value)}
                placeholder="e.g. 12"
                required
              />
            </div>
          </div>
          <p className="muted">
            You will be prompted to approve{" "}
            <span className="mono">amount × maxCharges</span> of the token so the contract can
            pull charges automatically.
          </p>
          <button type="submit" disabled={busy}>
            {busy ? "Processing…" : "Create subscription"}
          </button>
        </form>
      </div>

      {error && <div className="banner error">{error}</div>}
      {msg && (
        <div className="banner success">
          {msg}{" "}
          {txUrl(chainId, msg.match(/0x[a-fA-F0-9]+/)?.[0]) && (
            <a
              href={txUrl(chainId, msg.match(/0x[a-fA-F0-9]+/)?.[0])}
              target="_blank"
              rel="noreferrer"
            >
              View on explorer
            </a>
          )}
        </div>
      )}

      <div className="panel">
        <h2>My subscriptions</h2>
        {mySubs.length === 0 ? (
          <p className="muted">No subscriptions yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Merchant</th>
                <th>Amount</th>
                <th>Charges</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {mySubs.map((s) => {
                const due = s.active && now >= Number(s.nextChargeTime);
                return (
                  <tr key={s.id.toString()}>
                    <td className="mono">{s.id.toString()}</td>
                    <td className="mono">{shortAddress(s.merchant)}</td>
                    <td>
                      {formatAmount(s.amount, s.meta)} {s.meta.symbol} / {s.interval}s
                    </td>
                    <td>
                      {s.chargeCount.toString()} / {s.maxCharges.toString()}
                    </td>
                    <td>
                      <span className={`badge ${s.active ? "active" : "inactive"}`}>
                        {s.active ? (due ? "Due" : "Active") : "Done"}
                      </span>
                    </td>
                    <td>
                      <div className="actions">
                        {s.active && (
                          <button onClick={() => handleCharge(s.id)} disabled={busy || !due}>
                            Charge
                          </button>
                        )}
                        {s.active && (
                          <button className="danger" onClick={() => handleCancel(s.id)} disabled={busy}>
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
