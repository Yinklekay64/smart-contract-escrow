import { getAddress, getNetwork, isConnected } from "@stellar/freighter-api";

const FALLBACK_NETWORK = {
  network: "testnet",
  networkPassphrase: "Test SDF Network ; September 2015",
};

/** Returns true if the Freighter extension is installed and unlocked. */
export async function isFreighterAvailable() {
  try {
    const res = await isConnected();
    return res.isConnected === true;
  } catch {
    return false;
  }
}

/** Requests the current Freighter address, or throws. */
export async function connectFreighter() {
  if (!(await isFreighterAvailable())) {
    throw new Error("Freighter is not installed or unlocked");
  }
  const { address, error } = await getAddress();
  if (error || !address) {
    throw new Error(error?.message || "Freighter: access denied");
  }
  return address;
}

/** Returns the network Freighter is currently pointed at. */
export async function getFreighterNetwork() {
  try {
    const { network, networkPassphrase, error } = await getNetwork();
    if (!error && networkPassphrase) return { network, networkPassphrase };
  } catch {
    // fall through to the default
  }
  return FALLBACK_NETWORK;
}
