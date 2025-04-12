import { Given, Then, When } from "@cucumber/cucumber";
import { accounts } from "../../src/config";
import { 
  AccountBalanceQuery, 
  AccountId, 
  Client, 
  PrivateKey,
  TokenCreateTransaction,
  TokenId,
  TokenInfoQuery,
} from "@hashgraph/sdk";
import assert from "node:assert";

const client = Client.forTestnet();

let tokenId: TokenId;

const accountsManager = (index: number) => {
  const account = accounts[index];
  const accountId = AccountId.fromString(account.id);
  const privateKey = PrivateKey.fromStringED25519(account.privateKey);
  const publicKey = privateKey.publicKey;
  return {
    accountId,
    privateKey,
    publicKey,
  };
};

const setClientOperator = (index: number) => {
  const { accountId, privateKey } = accountsManager(index);
  client.setOperator(accountId, privateKey);
  return {
    accountId,
    privateKey,
  };
};

Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const { accountId, privateKey } = setClientOperator(2);
  const query = new AccountBalanceQuery().setAccountId(accountId);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  const { accountId, privateKey } = setClientOperator(2);
  const transaction = new TokenCreateTransaction()
    .setDecimals(2)
    .setTokenSymbol("HTT")
    .setSupplyKey(privateKey)
    .setTokenName("Test Token")
    .setTreasuryAccountId(accountId)
    .freezeWith(client);
  const signTx = await transaction.sign(privateKey);
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  const tokenIdCreated = receipt.tokenId;
  assert.ok(tokenIdCreated != null);
  console.log(`Token created with ID: ${tokenIdCreated}`);
  tokenId = tokenIdCreated;
});

Then(/^The token has the name "([^"]*)"$/, async function (tokenName: string) {
  const tokenInfoQuery = new TokenInfoQuery().setTokenId(tokenId);
  const tokenInfo = await tokenInfoQuery.execute(client);
  assert(tokenInfo.name === tokenName);
});

Then(/^The token has the symbol "([^"]*)"$/, async function (symbol: string) {
  const tokenInfoQuery = new TokenInfoQuery().setTokenId(tokenId);
  const tokenInfo = await tokenInfoQuery.execute(client);
  assert(tokenInfo.symbol === symbol);
});

Then(/^The token has (\d+) decimals$/, async function () {
  

});

Then(/^The token is owned by the account$/, async function () {

});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/, async function () {

});
When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/, async function () {

});
Then(/^The total supply of the token is (\d+)$/, async function () {

});
Then(/^An attempt to mint tokens fails$/, async function () {

});

Given(/^A first hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const { accountId, privateKey } = setClientOperator(2);
  const query = new AccountBalanceQuery().setAccountId(accountId);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

Given(/^A second Hedera account$/, async function () {

});
Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, async function () {

});
Given(/^The first account holds (\d+) HTT tokens$/, async function () {

});
Given(/^The second account holds (\d+) HTT tokens$/, async function () {

});
When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/, async function () {

});
When(/^The first account submits the transaction$/, async function () {

});
When(/^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/, async function () {

});
Then(/^The first account has paid for the transaction fee$/, async function () {

});
Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/, async function () {

});
Given(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function () {

});
Given(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function () {

});
Given(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function () {

});
When(/^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/, async function () {

});
Then(/^The third account holds (\d+) HTT tokens$/, async function () {

});
Then(/^The fourth account holds (\d+) HTT tokens$/, async function () {

});
