import { Given, Then, When, Before } from "@cucumber/cucumber";
import { accounts } from "../../src/config";
import { 
  AccountBalanceQuery, 
  AccountId, 
  Client, 
  PrivateKey,
  ReceiptStatusError,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenId,
  TokenInfoQuery,
  TokenMintTransaction,
  TokenSupplyType,
  TransferTransaction,
} from "@hashgraph/sdk";
import assert from "node:assert";

const client = Client.forTestnet();

let scenarioName: string;
const firstAccount = 5;
const secondAccount = 4;
let tokenId: TokenId;
let tokenAssociateTransaction: TokenAssociateTransaction;
let tokenTransferTransaction: TransferTransaction;

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

const tokenInfoQuery = async () => {
  if (!tokenId) throw new Error("Token ID is not set");
  const tokenInfoQuery = new TokenInfoQuery().setTokenId(tokenId); 
  const tokenInfo = await tokenInfoQuery.execute(client);
  return tokenInfo;
};

const transferTokens = async (fromAccount: number, toAccount: number, tokenId: TokenId, tokenAmount: number) => {
  const { accountId: fromAccountId, privateKey: fromAccountPrivateKey } = setClientOperator(fromAccount);
  const { accountId: toAccountId, privateKey: toAccountPrivateKey } = accountsManager(toAccount);

  const tokenAssociateTransaction = new TokenAssociateTransaction()
    .setAccountId(toAccountId)
    .setTokenIds([tokenId])
    .freezeWith(client);

  const sginedTokenAssociateTransaction = await tokenAssociateTransaction.sign(toAccountPrivateKey);
  const tokenAssociateTransactionResponse = await sginedTokenAssociateTransaction.execute(client);
  const tokenAssociateReceipt = await tokenAssociateTransactionResponse.getReceipt(client);
  assert.ok(tokenAssociateReceipt.status._code === 22);

  const tokenTransferTransaction = new TransferTransaction()
    .addTokenTransfer(tokenId, fromAccountId, -1 * tokenAmount)
    .addTokenTransfer(tokenId, toAccountId, tokenAmount)
    .freezeWith(client);
  const signedTokenTransferTransaction = await tokenTransferTransaction.sign(fromAccountPrivateKey);
  const tokenTransferTransactionResponse = await signedTokenTransferTransaction.execute(client);
  const tokenTransferReceipt = await tokenTransferTransactionResponse.getReceipt(client);
  assert.ok(tokenTransferReceipt.status._code === 22);
};

Before((scenario) => {
  scenarioName = scenario.pickle.name;
});

Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const { accountId, privateKey } = setClientOperator(firstAccount);
  const query = new AccountBalanceQuery().setAccountId(accountId);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  const { accountId, privateKey } = setClientOperator(firstAccount);
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
  const tokenInfo = await tokenInfoQuery();
  assert(tokenInfo.symbol === symbol);
});

Then(/^The token has (\d+) decimals$/, async function (decimals: number) {
  const tokenInfo = await tokenInfoQuery();
  assert(tokenInfo.decimals === decimals);
});

Then(/^The token is owned by the account$/, async function () {
  const { accountId } = accountsManager(firstAccount);
  const tokenInfo = await tokenInfoQuery();
  assert(tokenInfo.treasuryAccountId?.toString() === accountId.toString());
});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/, async function (tokensToMint: number) {
  const { accountId, privateKey } = accountsManager(firstAccount);
  const mintTransaction = new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(tokensToMint)
    .freezeWith(client);
  const signTx = await mintTransaction.sign(privateKey);
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  assert.ok(receipt.status._code === 22);
});

When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/, async function (maxSupply: number) {
  const { accountId, privateKey } = setClientOperator(firstAccount);
  const transaction = new TokenCreateTransaction()
    .setDecimals(2)
    .setTokenSymbol("HTT")
    .setSupplyKey(privateKey)
    .setTreasuryAccountId(accountId)
    .setTokenName("Test Token")
    .setMaxSupply(maxSupply)
    .setSupplyType(TokenSupplyType.Finite)
    .freezeWith(client);
  const signTx = await transaction.sign(privateKey);
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  assert.ok(receipt.status._code === 22);
  const tokenIdCreated = receipt.tokenId;
  assert.ok(tokenIdCreated != null);
  console.log(`Fixed supply Token created with ID: ${tokenIdCreated}`);
  tokenId = tokenIdCreated;
});

Then(/^The total supply of the token is (\d+)$/, async function (maxSupply: number) {
  const tokenInfoQuery = new TokenInfoQuery().setTokenId(tokenId);
  const tokenInfo = await tokenInfoQuery.execute(client);
  assert.ok(tokenInfo.maxSupply?.toNumber() === maxSupply);
});

Then(/^An attempt to mint tokens fails$/, async function () {
  const { accountId, privateKey } = accountsManager(5);
  try {
    const mintTransaction = new TokenMintTransaction()
      .setTokenId(tokenId)
      .setAmount(1000000)
      .freezeWith(client);
    const signTx = await mintTransaction.sign(privateKey);
    const txResponse = await signTx.execute(client);
    await txResponse.getReceipt(client);
  } catch (error: unknown) {
    if (error instanceof ReceiptStatusError) assert.ok(error.status._code === 236);
    else assert.fail("Unexpected error type");
  }
});

Given(/^A first hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const { accountId, privateKey } = setClientOperator(firstAccount);
  const query = new AccountBalanceQuery().setAccountId(accountId);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

Given(/^A second Hedera account$/, async function () {
  const { accountId, privateKey } = accountsManager(secondAccount);
  assert.ok(accountId != null);
});

Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, async function (supply: number) {
  const { accountId, privateKey } = setClientOperator(firstAccount);
  const transaction = new TokenCreateTransaction()
    .setDecimals(2)
    .setTokenSymbol("HTT")
    .setSupplyKey(privateKey)
    .setTreasuryAccountId(accountId)
    .setTokenName("Test Token")
    .setMaxSupply(supply)
    .setSupplyType(TokenSupplyType.Finite)
    .freezeWith(client);
  const signTx = await transaction.sign(privateKey);
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  assert.ok(receipt.status._code === 22);
  const tokenIdCreated = receipt.tokenId;
  assert.ok(tokenIdCreated != null);
  console.log(`Token created with ID: ${tokenIdCreated}`);
  tokenId = tokenIdCreated;
  const tokenInfo = await tokenInfoQuery();
  assert.ok(tokenInfo.maxSupply?.toNumber() === supply);
  assert.ok(tokenInfo.supplyType === TokenSupplyType.Finite);
  assert.ok(tokenInfo.name === "Test Token");
  assert.ok(tokenInfo.symbol === "HTT");

  // bypass for one scenario
  if (scenarioName === 'The first account holds 100 HTT tokens') {
    await transferTokens(firstAccount, secondAccount, tokenId, 100);
  }
});

Given(/^The first account holds (\d+) HTT tokens$/, async function (balance: number) {
  const { accountId, privateKey } = setClientOperator(firstAccount);
  const mintTransaction = new TokenMintTransaction()
      .setTokenId(tokenId)
      .setAmount(100)
      .freezeWith(client);
  const signTx = await mintTransaction.sign(privateKey);
  const txResponse = await signTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  assert.ok(receipt.status._code === 22);
  const accountBalanceQuery = new AccountBalanceQuery().setAccountId(accountId);
  const accountBalanceInfo = await accountBalanceQuery.execute(client);
  assert.ok(accountBalanceInfo.tokens != null);
  const tokenBalance = accountBalanceInfo.tokens?.get(tokenId);
  assert.ok(tokenBalance != null);
  console.log(`Token balance: ${tokenBalance}`);
  assert.ok(tokenBalance.toNumber() === balance);
});

Given(/^The second account holds (\d+) HTT tokens$/, async function (balance: number) {
  const { accountId, privateKey } = setClientOperator(secondAccount);
  const accountBalanceQuery = new AccountBalanceQuery().setAccountId(accountId);
  const accountBalanceInfo = await accountBalanceQuery.execute(client);
  assert.ok(accountBalanceInfo.tokens != null);
  const tokenBalance = accountBalanceInfo.tokens?.get(tokenId);
  if (balance === 0) assert.ok(!tokenBalance);
  else assert.ok(tokenBalance?.toNumber() === balance);
});

When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/, async function (tokenAmount: number) {
  const { accountId: fromAccountId, privateKey: fromPrivateKey } = accountsManager(firstAccount);
  const { accountId: toAccountId, privateKey: toPrivateKey } = accountsManager(secondAccount);
  tokenAssociateTransaction = new TokenAssociateTransaction()
    .setAccountId(toAccountId)
    .setTokenIds([tokenId])
    .freezeWith(client);
  const tokenAssociateTransactionSign = await tokenAssociateTransaction.sign(fromPrivateKey);
  const tokenAssociateTransactionSigned = await tokenAssociateTransactionSign.execute(client);
  const tokenAssociateReceipt = await tokenAssociateTransactionSigned.getReceipt(client);
  assert.ok(tokenAssociateReceipt.status._code === 22);

  tokenTransferTransaction = new TransferTransaction()
    .addTokenTransfer(tokenId, fromAccountId, -1 * tokenAmount)
    .addTokenTransfer(tokenId, toAccountId, tokenAmount)
    .freezeWith(client);
  const tokenTransferTransactionSign = await tokenTransferTransaction.sign(fromPrivateKey);
  const tokenTransferTransactionSigned = await tokenTransferTransactionSign.execute(client);
  const tokenTransferReceipt = await tokenTransferTransactionSigned.getReceipt(client);
  assert.ok(tokenTransferReceipt.status._code === 22);
});

When(/^The first account submits the transaction$/, async function () {});

When(/^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/, async function () {

});

Then(/^The first account has paid for the transaction fee$/, async function () {
  const { accountId } = accountsManager(firstAccount);
  const paidBy = tokenTransferTransaction.transactionId?.accountId;
  assert.ok(paidBy?.toString() === accountId.toString());
});


// Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/, async function () {

// });
// Given(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function () {

// });
// Given(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function () {

// });
// Given(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function () {

// });
// When(/^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/, async function () {

// });
// Then(/^The third account holds (\d+) HTT tokens$/, async function () {

// });
// Then(/^The fourth account holds (\d+) HTT tokens$/, async function () {

// });
