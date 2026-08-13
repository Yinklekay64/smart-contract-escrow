import { useEffect, useState } from "react";
import { ZeroAddress, formatUnits } from "ethers";
import { useWallet } from "../context/WalletContext";
import ConnectPrompt from "../components/ConnectPrompt";
import { shortAddress } from "../lib/format";

export default function Dashboard() {
  const { account, contracts } = useWallet();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!contracts?.processor || !contracts?.invoice || !contracts?.subscription || !account) {
        return;
      }
      const processor = contracts.processor;
      const invoice = contracts.invoice;
      const subscription = contracts.subscription;

      const paymentLogs = await processor.queryFilter(
        processor.filters.PaymentSent(undefined, undefined, account)
      );
      const refundLogs = await processor.queryFilter(processor.filters.Refunded(undefined, account));
      const invoiceLogs = await invoice.queryFilter(
        invoice.filters.InvoiceCreated(undefined, account)
      );
      const subLogs = await subscription.queryFilter(
        subscription.filters.SubscriptionCreated(undefined, undefined, account)
      );

      let ethReceived = 0n;
      let erc20Count = 0;
      for (const log of paymentLogs) {
        if (log.args[3] === ZeroAddress) ethReceived += log.args[4];
        else erc20Count += 1;
      }

      let ethRefunded = 0n;
      for (const log of refundLogs) {
        const payment = await processor.payments(log.args[0]);
        if (payment.token === ZeroAddress) ethRefunded += log.args[2];
      }

      let paidInvoices = 0;
      for (const log of invoiceLogs) {
        const data = await invoice.invoices(log.args[0]);
        if (Number(data.status) === 1) paidInvoices += 1;
      }

      let activeSubs = 0;
      for (const log of subLogs) {
        const data = await subscription.subscriptions(log.args[0]);
        if (data.active) activeSubs += 1;
      }

      if (!cancelled) {
        setStats({
          payments: paymentLogs.length,
          ethReceived,
          erc20Count,
          refunds: refundLogs.length,
          ethRefunded,
          invoices: invoiceLogs.length,
          paidInvoices,
          merchantSubs: subLogs.length,
          activeSubs,
        });
        setRecent(paymentLogs.slice(-5).reverse());
      }
    }
    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [contracts, account]);

  if (!account) return <ConnectPrompt title="Merchant dashboard" />;
  if (!stats) return <div className="panel muted">Loading…</div>;

  return (
    <div>
      <div className="panel">
        <h2>Merchant dashboard</h2>
        <p className="muted">
          Account: <span className="mono">{account}</span>
        </p>
        <div className="row">
          <Stat label="Payments received" value={String(stats.payments)} />
          <Stat label="ETH received" value={`${formatUnits(stats.ethReceived, 18)} ETH`} />
          <Stat label="ERC-20 payments" value={String(stats.erc20Count)} />
          <Stat label="Refunds given" value={String(stats.refunds)} />
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <Stat label="Invoices created" value={String(stats.invoices)} />
          <Stat label="Invoices paid" value={String(stats.paidInvoices)} />
          <Stat label="Subscriptions (merchant)" value={String(stats.merchantSubs)} />
          <Stat label="Active subscriptions" value={String(stats.activeSubs)} />
        </div>
      </div>

      <div className="panel">
        <h3>Recent payments received</h3>
        {recent.length === 0 ? (
          <p className="muted">No payments received yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Payer</th>
                <th>Token</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((log) => (
                <tr key={log.args[0].toString()}>
                  <td className="mono">{log.args[0].toString()}</td>
                  <td className="mono">{shortAddress(log.args[1])}</td>
                  <td className="mono">
                    {log.args[3] === ZeroAddress ? "ETH" : shortAddress(log.args[3])}
                  </td>
                  <td>
                    {log.args[3] === ZeroAddress
                      ? `${formatUnits(log.args[4], 18)} ETH`
                      : `${log.args[4].toString()} wei`}
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

function Stat({ label, value }) {
  return (
    <div className="field" style={{ minWidth: 160 }}>
      <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.03em" }}>
        {label}
      </div>
      <div className="stat">{value}</div>
    </div>
  );
}
