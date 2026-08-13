import { useEffect, useState } from "react";
import { ZeroAddress, parseUnits } from "ethers";
import { useWallet } from "../context/WalletContext";
import ConnectPrompt from "../components/ConnectPrompt";
import { getToken } from "../lib/erc20";
import { tokenMeta, formatAmount } from "../lib/tokens";
import { shortHash, shortAddress, txUrl } from "../lib/format";

const STATUS = ["Pending", "Paid", "Cancelled"];

export default function Invoices() {
  const { account, chainId, contracts, signer } = useWallet();

  // create form
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [memo, setMemo] = useState("");

  // pay by id
  const [payId, setPayId] = useState("");
  const [payData, setPayData] = useState(null);

  const [myInvoices, setMyInvoices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  async function loadMyInvoices() {
    if (!contracts?.invoice || !account) return;
    const logs = await contracts.invoice.queryFilter(
      contracts.invoice.filters.InvoiceCreated(undefined, account)
    );
    const items = [];
    for (const log of logs) {
      const id = log.args[0];
      const data = await contracts.invoice.invoices(id);
      const meta = await tokenMeta(log.args[2], signer);
      items.push({
        id,
        token: log.args[2],
        amount: log.args[3],
        dueDate: log.args[4],
        memo: log.args[5],
        status: Number(data.status),
        meta,
      });
    }
    setMyInvoices(items);
  }

  useEffect(() => {
    loadMyInvoices().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, account]);

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (!contracts?.invoice) return;
    setBusy(true);
    try {
      const meta = await tokenMeta(token, signer);
      const amountWei = parseUnits(amount, meta.decimals);
      const dueSec = dueDate ? Math.floor(new Date(dueDate).getTime() / 1000) : 0;
      const tx = await contracts.invoice.createInvoice(
        token || ZeroAddress,
        amountWei,
        dueSec,
        memo
      );
      await tx.wait();
      setMsg(`Invoice created in tx ${shortHash(tx.hash)}`);
      setAmount("");
      setMemo("");
      setDueDate("");
      await loadMyInvoices();
    } catch (err) {
      setError(err.shortMessage || err.reason || err.message || "Transaction failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLookup(e) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (!contracts?.invoice) return;
    try {
      const data = await contracts.invoice.invoices(payId);
      if (data.merchant === ZeroAddress) {
        setPayData(null);
        setError("Invoice not found.");
        return;
      }
      const meta = await tokenMeta(data.token, signer);
      setPayData({ id: payId, ...data, status: Number(data.status), meta });
    } catch (err) {
      setPayData(null);
      setError(err.shortMessage || err.message || "Lookup failed.");
    }
  }

  async function handlePay() {
    setError(null);
    setMsg(null);
    if (!contracts?.invoice || !payData) return;
    setBusy(true);
    try {
      const invoice = contracts.invoice;
      let tx;
      if (payData.token === ZeroAddress) {
        tx = await invoice.payInvoice(payData.id, { value: payData.amount });
      } else {
        const tokenContract = getToken(payData.token, signer);
        const invoiceAddress = await invoice.getAddress();
        const allowance = await tokenContract.allowance(account, invoiceAddress);
        if (allowance < payData.amount) {
          const approveTx = await tokenContract.approve(invoiceAddress, payData.amount);
          await approveTx.wait();
        }
        tx = await invoice.payInvoice(payData.id);
      }
      await tx.wait();
      setMsg(`Invoice ${payData.id.toString()} paid in tx ${shortHash(tx.hash)}`);
      setPayData(null);
      setPayId("");
      await loadMyInvoices();
    } catch (err) {
      setError(err.shortMessage || err.reason || err.message || "Payment failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(id) {
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      const tx = await contracts.invoice.cancelInvoice(id);
      await tx.wait();
      setMsg(`Invoice ${id.toString()} cancelled`);
      await loadMyInvoices();
    } catch (err) {
      setError(err.shortMessage || err.reason || err.message || "Cancel failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!account) return <ConnectPrompt title="Invoices" />;

  return (
    <div>
      <div className="panel">
        <h2>Create invoice</h2>
        <form onSubmit={handleCreate}>
          <div className="field">
            <label>Token (leave empty for ETH)</label>
            <input
              className="mono"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="0x… ERC-20 address, or empty for ETH"
            />
          </div>
          <div className="row">
            <div className="field">
              <label>Amount</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="field">
              <label>Due date (optional)</label>
              <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Memo</label>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. web design" />
          </div>
          <button type="submit" disabled={busy}>
            {busy ? "Processing…" : "Create invoice"}
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>Pay an invoice</h2>
        <form onSubmit={handleLookup}>
          <div className="row">
            <div className="field">
              <label>Invoice ID</label>
              <input
                value={payId}
                onChange={(e) => setPayId(e.target.value)}
                placeholder="e.g. 0"
                required
              />
            </div>
            <button type="submit" disabled={busy}>
              Look up
            </button>
          </div>
        </form>

        {payData && (
          <div style={{ marginTop: 12 }}>
            <p>
              <strong>{formatAmount(payData.amount, payData.meta)} {payData.meta.symbol}</strong>{" "}
              to <span className="mono">{shortAddress(payData.merchant)}</span>
              {payData.memo ? ` — "${payData.memo}"` : ""}
              <span className="muted">
                {" "}
                (status: {STATUS[payData.status]})
              </span>
            </p>
            {payData.status === 0 && (
              <button onClick={handlePay} disabled={busy}>
                {busy ? "Processing…" : "Pay invoice"}
              </button>
            )}
          </div>
        )}
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
        <h2>My invoices</h2>
        {myInvoices.length === 0 ? (
          <p className="muted">No invoices yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Amount</th>
                <th>Memo</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {myInvoices.map((inv) => (
                <tr key={inv.id.toString()}>
                  <td className="mono">{inv.id.toString()}</td>
                  <td>
                    {formatAmount(inv.amount, inv.meta)} {inv.meta.symbol}
                  </td>
                  <td>{inv.memo}</td>
                  <td>
                    <span className={`badge ${STATUS[inv.status].toLowerCase()}`}>
                      {STATUS[inv.status]}
                    </span>
                  </td>
                  <td>
                    {inv.status === 0 && (
                      <button className="danger" onClick={() => handleCancel(inv.id)} disabled={busy}>
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
