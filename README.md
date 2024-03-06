# Steps to run

1. Open the project folder in terminal and run `npm i`

2. Run command, `aiken check` to verify the smart contract and the tests inside.

3. Run command, `aiken build` to build the contract.

4. Install Deno gloabally to run deno commands.

5. Run command, `deno run --allow-net --allow-read --allow-env scripts/test.ts` to run the test script to lock and unlock funds in the contract.
