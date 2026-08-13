import {
  BASE_FEE,
  Networks,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { Api, Server } from "@stellar/stellar-sdk/rpc";
import { signTransaction } from "@stellar/freighter-api";

export const DEFAULT_RPC_URL =
  import.meta.env.VITE_RPC_URL || "https://soroban-testnet.stellar.org";

export const DEFAULT_NETWORK_PASSPHRASE =
  import.meta.env.VITE_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015";

// ---- ScVal builders ---------------------------------------------------------

export const addr = (value) => nativeToScVal(value, { type: "address" });
export const i128 = (value) => nativeToScVal(String(value), { type: "i128" });
export const u64 = (value) => nativeToScVal(String(value), { type: "u64" });
export const bool = (value) => nativeToScVal(Boolean(value), { type: "bool" });
export const optAddr = (value) => (value ? addr(value) : xdr.ScVal.scvVoid());

// ---- Read (simulate a view/read call, no signing) ---------------------------

export async function read({ contractId, fn, args = [], publicKey, rpcUrl, networkPassphrase }) {
  const server = new Server(rpcUrl);
  const account = await server.getAccount(publicKey);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(Operation.invokeContractFunction({ contract: contractId, function: fn, args }))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) {
    throw new Error(`Read failed: ${sim.error}`);
  }
  return scValToNative(sim.result.retval);
}

// ---- Invoke (sign the transaction with Freighter and submit) ----------------

export async function invoke({ contractId, fn, args = [], publicKey, rpcUrl, networkPassphrase }) {
  const server = new Server(rpcUrl);
  const account = await server.getAccount(publicKey);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(Operation.invokeContractFunction({ contract: contractId, function: fn, args }))
    .setTimeout(30)
    .build();

  const prepared = await server.prepareTransaction(tx);

  const signed = await signTransaction(prepared.toXDR("base64"), {
    networkPassphrase,
    address: publicKey,
  });
  if (signed.error || !signed.signedTxXdr) {
    throw new Error(signed.error?.message || "Freighter failed to sign the transaction");
  }

  const signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, networkPassphrase);
  const response = await server.sendTransaction(signedTx);

  if (response.status === "ERROR") {
    throw new Error(describeError(response) || "Transaction failed");
  }
  return response;
}

function describeError(response) {
  try {
    return response.errorResult?.result?.()?.value?.()?.value?.()?.debugMsg?.toString?.();
  } catch {
    return undefined;
  }
}

export { Networks };
