import { Given, Then, When, Before } from "@cucumber/cucumber";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey, RequestType,
  TopicCreateTransaction, TopicInfoQuery,
  TopicMessageQuery, TopicMessageSubmitTransaction,
  KeyList, Key,
  TopicMessage,
} from "@hashgraph/sdk";
import { accounts } from "../../src/config";
import assert from "node:assert";

// Pre-configured client for test network (testnet)
const client = Client.forTestnet()

// Selected accounts
let scenarioName: string;
const firstAccount = 5;
const secondAccount = 4;
let thresholdKeyList = new KeyList();
let topicId: string;

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

const getHbarBalance = async (accountId: AccountId) => {
  const accountBalanceQuery = new AccountBalanceQuery().setAccountId(accountId);
  const accountBalanceInfo = await accountBalanceQuery.execute(client);
  if (accountBalanceInfo.hbars === null) return 0;
  const hbarBalance = accountBalanceInfo.hbars.toBigNumber().toNumber();
  return hbarBalance;
};

Before((scenario) => {
  scenarioName = scenario.pickle.name;
});

Given(/^a first account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const { accountId, privateKey } = accountsManager(firstAccount);
  const hbarBalance = await getHbarBalance(accountId);
  assert.ok(hbarBalance > expectedBalance);
});

Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const { accountId, privateKey } = accountsManager(secondAccount);
  const hbarBalance = await getHbarBalance(accountId);
  assert.ok(hbarBalance > expectedBalance);
});

Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, async function (requiredSigns: number, totalSigns: number) {
  const { privateKey: firstAccountPrivateKey } = accountsManager(firstAccount);
  const { privateKey: secondAccountPrivateKey } = accountsManager(secondAccount);
  const firstAccountPublicKey = firstAccountPrivateKey.publicKey;
  const secondAccountPublicKey = secondAccountPrivateKey.publicKey;
  thresholdKeyList = new KeyList([firstAccountPublicKey, secondAccountPublicKey], requiredSigns);
});

When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo: string) {
  const { accountId, privateKey } = accountsManager(firstAccount);
  const transaction = new TopicCreateTransaction()
    .setAdminKey(client.operatorPublicKey!)
    .setSubmitKey(thresholdKeyList)
    .setTopicMemo(memo)
    .freezeWith(client);
  const signedTx = await transaction.sign(privateKey);
  const executedTx = await signedTx.execute(client);
  const receipt = await executedTx.getReceipt(client);
  assert.ok(receipt.status._code === 22);
  topicId = receipt.topicId?.toString()!;
  assert.ok(topicId);
});

When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/, async function (memo: string) {
  const { privateKey: firstAccountPrivateKey } = setClientOperator(firstAccount);
  const firstAccountPublicKey = firstAccountPrivateKey.publicKey;
  const transaction = new TopicCreateTransaction()
    .setAdminKey(client.operatorPublicKey!)
    .setSubmitKey(firstAccountPublicKey)
    .setTopicMemo(memo)
    .freezeWith(client);
  const signedTx = await transaction.sign(firstAccountPrivateKey);
  const executedTx = await signedTx.execute(client);
  const receipt = await executedTx.getReceipt(client);
  assert.ok(receipt.status._code === 22);
  topicId = receipt.topicId?.toString()!;
  assert.ok(topicId);
});

When(/^The message "([^"]*)" is published to the topic$/, async function (message: string) {
  const { privateKey: firstAccountPrivateKey } = accountsManager(firstAccount);
  const transaction = new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(message)
    .freezeWith(client);
  const signedTx = await transaction.sign(firstAccountPrivateKey);
  const executedTx = await signedTx.execute(client);
  const receipt = await executedTx.getReceipt(client);
  assert.ok(receipt.status._code === 22);
});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/, async function (message: string) {
  new TopicMessageQuery()
    .setTopicId(topicId)
    .setStartTime(0)
    .subscribe(client, onError, onMessage);
});

const onMessage = (message: TopicMessage) => {
  console.log(`Received message: ${message.contents.toString()}`);
};

const onError = (message: TopicMessage | null, error: Error) => {
  console.error(`Error: ${error.message}`);
};
