import {
  Blockfrost,
  C,
  Constr,
  Data,
  Lucid,
  SpendingValidator,
  TxHash,
  fromHex,
  toHex,
  utf8ToHex,
} from "https://deno.land/x/lucid@0.8.3/mod.ts";
import * as cbor from "https://deno.land/x/cbor@v1.4.1/index.js";
import { BLOCKFROST_PROJECT_ID } from "./env.ts";

const lucid = await Lucid.new(
  new Blockfrost(
    "https://cardano-preview.blockfrost.io/api/v0",
    BLOCKFROST_PROJECT_ID
  ),
  "Preview"
);

async function readValidator(): Promise<SpendingValidator> {
  const validator = JSON.parse(await Deno.readTextFile("plutus.json"))
    .validators[0];
  return {
    type: "PlutusV2",
    script: toHex(cbor.encode(fromHex(validator.compiledCode))),
  };
}

const validator = await readValidator();

async function lock(
  lovelace: bigint,
  { into, owner }: { into: SpendingValidator; owner: string }
): Promise<TxHash> {
  const contractAddress = lucid.utils.validatorToAddress(into);

  const tx = await lucid
    .newTx()
    .payToContract(contractAddress, { inline: owner }, { lovelace })
    .complete();

  const signedTx = await tx.sign().complete();

  return signedTx.submit();
}

async function unlock(
  ref: OutRef,
  { from, using }: { from: SpendingValidator; using: Redeemer }
): Promise<TxHash> {
  const [utxo] = await lucid.utxosByOutRef([ref]);

  const tx = await lucid
    .newTx()
    .collectFrom([utxo], using)
    .addSigner(await lucid.wallet.address())
    .attachSpendingValidator(from)
    .complete();

  const signedTx = await tx.sign().complete();

  return signedTx.submit();
}

async function runTests() {
  let txHash;
  /** 1. Add funds in contract */
  try {
    // a. selecting the wallet with funds
    lucid.selectWalletFromPrivateKey(
      await Deno.readTextFile("./scripts/owner.sk")
    );

    // b. lock funds in contract
    const publicKeyHash = lucid.utils.getAddressDetails(
      await lucid.wallet.address()
    ).paymentCredential?.hash;

    const datum = Data.to(new Constr(0, [publicKeyHash]));

    txHash = await lock(1000000n, { into: validator, owner: datum });

    await lucid.awaitTx(txHash);

    console.log(`1 tADA locked into the contract at:
          Tx ID: ${txHash}
          Datum: ${datum}
      `);
  } catch (e) {
    console.error(`Error while locking funds in contract: ${e} `);
  }

  /** 2. Try to get fund using different account and failing */
  try {
    // a. selecting the wallet with funds
    lucid.selectWalletFromPrivateKey(
      await Deno.readTextFile("./scripts/other.sk")
    );

    // b. unlock funds from contract and fail
    const utxo: OutRef = { txHash, outputIndex: 0 };

    const redeemer = Data.to(new Constr(0, [utf8ToHex("Hello, World!")]));

    const txHash2 = await unlock(utxo, {
      from: validator,
      using: redeemer,
    });

    await lucid.awaitTx(txHash2);

    console.log(`1 tADA unlocked from the contract
        Tx ID:    ${txHash2}
        Redeemer: ${redeemer}
    `);
  } catch (e) {
    console.log("Correct error");
    console.error(`Error while unlocking funds from other account: ${e}`);
  }

  /** 3. Get fund from contract*/
  try {
    // a. selecting the wallet with funds
    lucid.selectWalletFromPrivateKey(
      await Deno.readTextFile("./scripts/owner.sk")
    );

    // b. unlock funds from contract
    const utxo: OutRef = { txHash, outputIndex: 0 };

    const redeemer = Data.to(new Constr(0, [utf8ToHex("Hello, World!")]));

    const txHash2 = await unlock(utxo, {
      from: validator,
      using: redeemer,
    });

    await lucid.awaitTx(txHash2);

    console.log(`1 tADA unlocked from the contract
        Tx ID:    ${txHash2}
        Redeemer: ${redeemer}
    `);
  } catch (e) {
    console.error(`Error while unlocking funds from contract: ${e}`);
  }
}

await runTests();
