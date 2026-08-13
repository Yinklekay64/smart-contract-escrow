// Exports the compiled contract ABIs from Hardhat artifacts into the frontend
// so the React app can import them directly. Run `npx hardhat compile` first.
const fs = require("fs");
const path = require("path");

const CONTRACTS = [
  { name: "PaymentProcessor", artifact: "contracts/PaymentProcessor.sol/PaymentProcessor.json" },
  { name: "Invoice", artifact: "contracts/Invoice.sol/Invoice.json" },
  { name: "Subscription", artifact: "contracts/Subscription.sol/Subscription.json" },
];

const root = path.join(__dirname, "..");
const outDir = path.join(root, "frontend", "src", "lib", "abis");

fs.mkdirSync(outDir, { recursive: true });

for (const { name, artifact } of CONTRACTS) {
  const artifactPath = path.join(root, "artifacts", artifact);
  if (!fs.existsSync(artifactPath)) {
    console.error(`Artifact not found: ${artifactPath}. Run \`npx hardhat compile\` first.`);
    process.exit(1);
  }
  const { abi } = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const outPath = path.join(outDir, `${name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(abi, null, 2));
  console.log(`Exported ${name} ABI -> ${path.relative(root, outPath)}`);
}
