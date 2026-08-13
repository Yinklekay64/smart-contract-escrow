import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext.jsx";
import {
  addr,
  bool,
  i128,
  invoke,
  nativeXlmTokenId,
  optAddr,
  read,
  u64,
} from "../lib/sdk.js";
import { formatAmount, shortAddress } from "../lib/format.js";

const FACTORY_ID = import.meta.env.VITE_FACTORY_CONTRACT_ID || "";

const STATE_LABELS = {
  AwaitingPayment: "Awaiting payment",
  AwaitingDelivery: "Awaiting delivery",
  Complete: "Complete",
  Disputed: "Disputed",
  Resolved: "Resolved",
  Refunded: "Refunded",
};

export default function Escrows() {
  const { publicKey, networkPassphrase, rpcUrl, error, busy, connect, disconnect } = useWallet();
  const [count, setCount] = useState(0);
  const [escrows, setEscrows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [notice, setNotice] = useState(null);
  const [creating, setCreating] = useState(false);

  // Create-escrow form state.
  const [form, setForm] = useState({
    buyer: "",
    seller: "",
    arbiter: "",
    token: "",
    amount: "",
    timeout: "604800",
  });

  const refresh = useCallback(async () => {
    if (!publicKey || !FACTORY_ID) return;
    try {
      const n = await read({
        contractId: FACTORY_ID,
        fn: "escrow_count",
        args: [],
        publicKey,
        rpcUrl,
        networkPassphrase,
      });
      setCount(Number(n));
      const list = [];
      for (let id = 0; id < Number(n); id++) {
        const address = await read({
          contractId: FACTORY_ID,
          fn: "get_escrow",
          args: [u64(id)],
          publicKey,
          rpcUrl,
          networkPassphrase,
        });
        if (address) list.push({ id, address });
      }
      setEscrows(list);
    } catch (e) {
      setNotice(e.message);
    }
  }, [publicKey, rpcUrl, networkPassphrase]);

  useEffect(() => {
    if (publicKey && FACTORY_ID) refresh();
  }, [publicKey, FACTORY_ID, refresh]);

  async function loadDetail(escrow) {
    setSelected(escrow);
    setDetail(null);
    try {
      const [state, buyer, seller, arbiter, token, amount, deadline, delivered] =
        await Promise.all([
          read({ contractId: escrow.address, fn: "state", args: [], publicKey, rpcUrl, networkPassphrase }),
          read({ contractId: escrow.address, fn: "buyer", args: [], publicKey, rpcUrl, networkPassphrase }),
          read({ contractId: escrow.address, fn: "seller", args: [], publicKey, rpcUrl, networkPassphrase }),
          read({ contractId: escrow.address, fn: "arbiter", args: [], publicKey, rpcUrl, networkPassphrase }),
          read({ contractId: escrow.address, fn: "token", args: [], publicKey, rpcUrl, networkPassphrase }),
          read({ contractId: escrow.address, fn: "amount", args: [], publicKey, rpcUrl, networkPassphrase }),
          read({ contractId: escrow.address, fn: "deadline", args: [], publicKey, rpcUrl, networkPassphrase }),
          read({ contractId: escrow.address, fn: "delivered", args: [], publicKey, rpcUrl, networkPassphrase }),
        ]);
      setDetail({ state, buyer, seller, arbiter, token, amount, deadline, delivered });
    } catch (e) {
      setNotice(e.message);
    }
  }

  async function act(fn, args = []) {
    if (!selected) return;
    setNotice(null);
    try {
      await invoke({
        contractId: selected.address,
        fn,
        args,
        publicKey,
        rpcUrl,
        networkPassphrase,
      });
      setNotice(`✔ ${fn} submitted`);
      await loadDetail(selected);
    } catch (e) {
      setNotice(`✘ ${e.message}`);
    }
  }

  async function createEscrow(e) {
    e.preventDefault();
    setCreating(true);
    setNotice(null);
    try {
      await invoke({
        contractId: FACTORY_ID,
        fn: "create_escrow",
        args: [
          addr(form.buyer),
          addr(form.seller),
          optAddr(form.arbiter),
          addr(form.token),
          i128(form.amount),
          u64(form.timeout),
        ],
        publicKey,
        rpcUrl,
        networkPassphrase,
      });
      setNotice("✔ Escrow created");
      await refresh();
    } catch (err) {
      setNotice(`✘ ${err.message}`);
    } finally {
      setCreating(false);
    }
  }

  if (!publicKey) {
    return (
      <div className="card">
        <h2>Connect your wallet</h2>
        <p className="muted">
          This app uses the Freighter browser extension to interact with Soroban
          contracts on Stellar.
        </p>
        {error && <p className="error">{error}</p>}
        <button onClick={connect} disabled={busy}>
          {busy ? "Connecting…" : "Connect Freighter"}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h2>Wallet</h2>
        <p className="mono">{publicKey}</p>
        <p className="muted">Network passphrase: {networkPassphrase}</p>
        <button className="secondary" onClick={disconnect}>
          Disconnect
        </button>
      </div>

      {!FACTORY_ID && (
        <div className="card">
          <h2>Configuration required</h2>
          <p className="muted">
            Set <code>VITE_FACTORY_CONTRACT_ID</code> to your deployed EscrowFactory
            address (see <code>scripts/deploy.sh</code>).
          </p>
        </div>
      )}

      {FACTORY_ID && (
        <>
          <div className="card">
            <h2>Create escrow</h2>
            <p className="muted">
              Factory <span className="mono">{FACTORY_ID}</span> · {count} escrow(s)
            </p>
            <form onSubmit={createEscrow}>
              <div className="row">
                <div className="field">
                  <label>Buyer (G…)</label>
                  <input value={form.buyer} onChange={(e) => setForm({ ...form, buyer: e.target.value })} required />
                </div>
                <div className="field">
                  <label>Seller (G…)</label>
                  <input value={form.seller} onChange={(e) => setForm({ ...form, seller: e.target.value })} required />
                </div>
                <div className="field">
                  <label>Arbiter (G…, optional)</label>
                  <input value={form.arbiter} onChange={(e) => setForm({ ...form, arbiter: e.target.value })} />
                </div>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <div className="field">
                  <label>Token contract id (USDC/SAC)</label>
                  <input value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} required />
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setForm({ ...form, token: nativeXlmTokenId(networkPassphrase) })}
                  >
                    Use native XLM
                  </button>
                </div>
                <div className="field">
                  <label>Amount (raw units)</label>
                  <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                </div>
                <div className="field">
                  <label>Timeout (seconds)</label>
                  <input value={form.timeout} onChange={(e) => setForm({ ...form, timeout: e.target.value })} required />
                </div>
              </div>
              <div className="actions">
                <button type="submit" disabled={creating}>
                  {creating ? "Creating…" : "Create escrow"}
                </button>
              </div>
            </form>
          </div>

          <div className="card">
            <h2>Escrows</h2>
            {escrows.length === 0 ? (
              <p className="muted">No escrows yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>id</th>
                    <th>address</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {escrows.map((escrow) => (
                    <tr key={escrow.id}>
                      <td>{escrow.id}</td>
                      <td className="mono">{shortAddress(escrow.address)}</td>
                      <td>
                        <button className="secondary" onClick={() => loadDetail(escrow)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {selected && detail && (
            <div className="card">
              <h2>
                Escrow #{selected.id} <span className="badge">{STATE_LABELS[detail.state] || detail.state}</span>
              </h2>
              <p className="mono">{selected.address}</p>
              <p className="muted">
                Buyer {shortAddress(detail.buyer)} · Seller {shortAddress(detail.seller)} · Arbiter{" "}
                {detail.arbiter ? shortAddress(detail.arbiter) : "none"}
              </p>
              <p className="muted">
                Amount {formatAmount(detail.amount)} · Token {shortAddress(detail.token)} · Delivered{" "}
                {String(detail.delivered)} · Deadline {String(detail.deadline)}
              </p>
              <div className="actions">
                <button onClick={() => act("deposit")} disabled={detail.state !== "AwaitingPayment"}>
                  Deposit (buyer)
                </button>
                <button onClick={() => act("mark_delivered")} disabled={detail.state !== "AwaitingDelivery"}>
                  Mark delivered (seller)
                </button>
                <button onClick={() => act("confirm")} disabled={detail.state !== "AwaitingDelivery"}>
                  Confirm (buyer)
                </button>
                <button
                  onClick={() => act("dispute", [addr(publicKey)])}
                  disabled={detail.state !== "AwaitingDelivery"}
                >
                  Dispute (buyer/seller)
                </button>
                <button onClick={() => act("refund")} disabled={detail.state !== "AwaitingDelivery" || detail.delivered}>
                  Refund (seller)
                </button>
                <button onClick={() => act("release")} disabled={detail.state !== "AwaitingDelivery" || !detail.delivered}>
                  Release (auto)
                </button>
                <button
                  className="danger"
                  onClick={() => act("resolve", [bool(true)])}
                  disabled={detail.state !== "Disputed"}
                >
                  Resolve → seller (arbiter)
                </button>
                <button
                  className="danger"
                  onClick={() => act("resolve", [bool(false)])}
                  disabled={detail.state !== "Disputed"}
                >
                  Resolve → buyer (arbiter)
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {notice && (
        <div className="card">
          <p className={notice.startsWith("✔") ? "muted" : "error"}>{notice}</p>
        </div>
      )}
    </>
  );
}
