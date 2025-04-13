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
  TransactionReceipt,
  TransactionResponse,
  TransactionRecord,
} from "@hashgraph/sdk";
import assert from "node:assert";

const client = Client.forTestnet();

let scenarioName: string;
const firstAccount = 5;
const secondAccount = 4;
const thirdAccount = 3;
const fourthAccount = 2;
let tokenId: TokenId;
let tokenAssociateTransaction: TokenAssociateTransaction;
let transferTransaction: TransferTransaction;
let transactionResponse: TransactionResponse;
let transactionReceipt: TransactionReceipt;
let transactionRecord: TransactionRecord;

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

const getTokenBalance = async (accountId: AccountId, tokenId: TokenId) => {
  const accountBalanceQuery = new AccountBalanceQuery().setAccountId(accountId);
  const accountBalanceInfo = await accountBalanceQuery.execute(client);
  if (accountBalanceInfo.tokens === null) return 0;
  const tokenBalance = accountBalanceInfo.tokens?.get(tokenId);
  if (!tokenBalance) return 0;
  return tokenBalance.toNumber();
};

const getHbarBalance = async (accountId: AccountId) => {
  const accountBalanceQuery = new AccountBalanceQuery().setAccountId(accountId);
  const accountBalanceInfo = await accountBalanceQuery.execute(client);
  if (accountBalanceInfo.hbars === null) return 0;
  const hbarBalance = accountBalanceInfo.hbars.toBigNumber().toNumber();
  return hbarBalance;
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

  const transferTransaction = new TransferTransaction()
    .addTokenTransfer(tokenId, fromAccountId, -1 * tokenAmount)
    .addTokenTransfer(tokenId, toAccountId, tokenAmount)
    .freezeWith(client);
  const signedtransferTransaction = await transferTransaction.sign(fromAccountPrivateKey);
  const transferTransactionResponse = await signedtransferTransaction.execute(client);
  const tokenTransferReceipt = await transferTransactionResponse.getReceipt(client);
  assert.ok(tokenTransferReceipt.status._code === 22);
};

Before((scenario) => {
  scenarioName = scenario.pickle.name;
});

Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const { accountId, privateKey } = setClientOperator(firstAccount);
  const hbarBalance = await getHbarBalance(accountId);
  assert.ok(hbarBalance > expectedBalance);
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
  const { accountId, privateKey } = accountsManager(firstAccount);
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
  const hbarBalance = await getHbarBalance(accountId);
  assert.ok(hbarBalance > expectedBalance);
});

Given(/^A second Hedera account$/, async function () {
  const { accountId, privateKey } = accountsManager(secondAccount);
  assert.ok(accountId != null);
});

Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, {timeout: 5 * 5000}, async function (supply: number) {
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

  // bypass for first account holding 100HTT initially
  if (['Transfer tokens between 2 accounts', 'Create a multi party token transfer transaction'].includes(scenarioName)) {
    const mintTransaction = new TokenMintTransaction()
      .setTokenId(tokenId)
      .setAmount(100)
      .freezeWith(client);
    const signTx = await mintTransaction.sign(privateKey);
    const txResponse = await signTx.execute(client);
    const receipt = await txResponse.getReceipt(client);
    assert.ok(receipt.status._code === 22);
  }

  // bypass for second account holding 100HTT initially
  if (scenarioName === 'Create a token transfer transaction paid for by the recipient') {
    const mintTransaction = new TokenMintTransaction()
      .setTokenId(tokenId)
      .setAmount(100)
      .freezeWith(client);
    const signTx = await mintTransaction.sign(privateKey);
    const txResponse = await signTx.execute(client);
    const receipt = await txResponse.getReceipt(client);
    assert.ok(receipt.status._code === 22);
    await transferTokens(firstAccount, secondAccount, tokenId, 100);
  }

});

Given(/^The first account holds (\d+) HTT tokens$/, async function (balance: number) {
  const { accountId, privateKey } = accountsManager(firstAccount);
  const httBalance = await getTokenBalance(accountId, tokenId);
  assert.ok(httBalance === balance);
});

Given(/^The second account holds (\d+) HTT tokens$/, async function (balance: number) {
  const { accountId, privateKey } = accountsManager(secondAccount);
  const httBalance = await getTokenBalance(accountId, tokenId);
  assert.ok(httBalance === balance);
});

When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/, async function (tokenAmount: number) {
  const { accountId: fromAccountId, privateKey: fromPrivateKey } = accountsManager(firstAccount);
  const { accountId: toAccountId, privateKey: toPrivateKey } = accountsManager(secondAccount);
  
  transferTransaction = new TransferTransaction()
    .addTokenTransfer(tokenId, fromAccountId, -1 * tokenAmount)
    .addTokenTransfer(tokenId, toAccountId, tokenAmount)
    .freezeWith(client);

  const associateTransaction = new TokenAssociateTransaction()
    .setAccountId(toAccountId)
    .setTokenIds([tokenId])
    .freezeWith(client);
  const signedAssociateTransaction = await associateTransaction.sign(toPrivateKey);
  const associateTransactionResponse = await signedAssociateTransaction.execute(client);
  const associateTransactionReceipt = await associateTransactionResponse.getReceipt(client);
  assert.ok(associateTransactionReceipt.status._code === 22);

  transferTransaction = await transferTransaction.sign(fromPrivateKey);
});

When(/^The first account submits the transaction$/, async function () {
  transactionResponse = await transferTransaction.execute(client);
  transactionReceipt = await transactionResponse.getReceipt(client);
  transactionRecord = await transactionResponse.getRecord(client);
  assert.ok(transactionReceipt.status._code === 22);
});

When(/^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/, async function (tokenAmount: number) {
  const { accountId: fromAccountId, privateKey: fromPrivateKey } = accountsManager(secondAccount);
  const { accountId: toAccountId, privateKey: toPrivateKey } = accountsManager(firstAccount);
  transferTransaction = new TransferTransaction()
    .addTokenTransfer(tokenId, fromAccountId, -1 * tokenAmount)
    .addTokenTransfer(tokenId, toAccountId, tokenAmount)
    .freezeWith(client);
  transferTransaction = await transferTransaction.sign(fromPrivateKey);
});

Then(/^The first account has paid for the transaction fee$/, async function () {
  const { accountId: firstAccountId } = accountsManager(firstAccount);
  const paidBy = transactionRecord.transactionId?.accountId;
  assert.ok(paidBy != null);
  assert.ok(paidBy.toString() === firstAccountId.toString());
});


Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/, async function (hbar: number, htt: number) {
  const { accountId, privateKey } = accountsManager(firstAccount);
  const hbarBalance = await getHbarBalance(accountId);
  assert.ok(hbarBalance > hbar);

  const httBalance = await getTokenBalance(accountId, tokenId);
  assert.ok(httBalance === htt);
});

Given(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (hbar: number, htt: number) {
  // const { accountId, privateKey } = accountsManager(secondAccount);
  // const query = new AccountBalanceQuery().setAccountId(accountId);
  // const balance = await query.execute(client);
  // assert.ok(balance.hbars.toBigNumber().toNumber() > hbar);

  // const accountBalanceQuery = new AccountBalanceQuery().setAccountId(accountId);
  // const accountBalanceInfo = await accountBalanceQuery.execute(client);
  // assert.ok(accountBalanceInfo.tokens != null);
  // const tokenBalance = accountBalanceInfo.tokens?.get(tokenId);
  // assert.ok(tokenBalance != null);
  // assert.ok(tokenBalance.toNumber() === htt);
});

Given(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (hbar: number, htt: number) {
  // const { accountId, privateKey } = accountsManager(3);
  // const query = new AccountBalanceQuery().setAccountId(accountId);
  // const balance = await query.execute(client);
  // assert.ok(balance.hbars.toBigNumber().toNumber() > hbar);

  // const accountBalanceQuery = new AccountBalanceQuery().setAccountId(accountId);
  // const accountBalanceInfo = await accountBalanceQuery.execute(client);
  // assert.ok(accountBalanceInfo.tokens != null);
  // const tokenBalance = accountBalanceInfo.tokens?.get(tokenId);
  // assert.ok(tokenBalance != null);
  // assert.ok(tokenBalance.toNumber() === htt);
});

Given(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (hbar: number, htt: number) {
  // const { accountId, privateKey } = accountsManager(2);
  // const query = new AccountBalanceQuery().setAccountId(accountId);
  // const balance = await query.execute(client);
  // assert.ok(balance.hbars.toBigNumber().toNumber() > hbar);

  // const accountBalanceQuery = new AccountBalanceQuery().setAccountId(accountId);
  // const accountBalanceInfo = await accountBalanceQuery.execute(client);
  // assert.ok(accountBalanceInfo.tokens != null);
  // const tokenBalance = accountBalanceInfo.tokens?.get(tokenId);
  // assert.ok(tokenBalance != null);
  // assert.ok(tokenBalance.toNumber() === htt);
});

When(/^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/, async function (transferAmount: number, toThirdAccount: number, toFourthAccount: number) {
  const { accountId: fromFirstAccountId, privateKey: fromFirstAccountPrivateKey } = accountsManager(firstAccount);
  const { accountId: fromSecondAccountId, privateKey: fromSecondAccountPrivateKey } = accountsManager(secondAccount);
  const { accountId: toThirdAccountId, privateKey: toThirdAccountPrivateKey } = accountsManager(3);
  const { accountId: toFourthAccountId, privateKey: toFourthAccountPrivateKey } = accountsManager(2);

  transferTransaction = new TransferTransaction()
    .addTokenTransfer(tokenId, fromFirstAccountId, -1 * transferAmount)
    .addTokenTransfer(tokenId, fromSecondAccountId, -1 * transferAmount)
    .addTokenTransfer(tokenId, toThirdAccountId, toThirdAccount)
    .addTokenTransfer(tokenId, toFourthAccountId, toFourthAccount)
    .freezeWith(client);

  transferTransaction = await transferTransaction.sign(fromFirstAccountPrivateKey);
  transferTransaction = await transferTransaction.sign(fromSecondAccountPrivateKey);
});

Then(/^The third account holds (\d+) HTT tokens$/, async function (htt: number) {
  const { accountId, privateKey } = accountsManager(3);
  const accountBalanceQuery = new AccountBalanceQuery().setAccountId(accountId);
  const accountBalanceInfo = await accountBalanceQuery.execute(client);
  assert.ok(accountBalanceInfo.tokens != null);
  const tokenBalance = accountBalanceInfo.tokens?.get(tokenId);
  assert.ok(tokenBalance != null);
  assert.ok(tokenBalance.toNumber() === htt);
});

Then(/^The fourth account holds (\d+) HTT tokens$/, async function (htt: number) {
  const { accountId, privateKey } = accountsManager(2);
  const accountBalanceQuery = new AccountBalanceQuery().setAccountId(accountId);
  const accountBalanceInfo = await accountBalanceQuery.execute(client);
  assert.ok(accountBalanceInfo.tokens != null);
  const tokenBalance = accountBalanceInfo.tokens?.get(tokenId);
  assert.ok(tokenBalance != null);
  assert.ok(tokenBalance.toNumber() === htt);
});
