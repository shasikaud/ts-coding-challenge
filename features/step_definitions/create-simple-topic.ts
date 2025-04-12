import { Given, Then, When } from "@cucumber/cucumber";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey, RequestType,
  TopicCreateTransaction, TopicInfoQuery,
  TopicMessageQuery, TopicMessageSubmitTransaction,
  KeyList, Key,
} from "@hashgraph/sdk";
import { accounts } from "../../src/config";
import assert from "node:assert";
import ConsensusSubmitMessage = RequestType.ConsensusSubmitMessage;

// Pre-configured client for test network (testnet)
const client = Client.forTestnet()

// Selected accounts
const firstAccount = accounts[2];
const secondAccount = accounts[3];

const firstAccountPrivateKey = PrivateKey.fromStringED25519(firstAccount.privateKey);
const secondAccountPrivateKey = PrivateKey.fromStringED25519(secondAccount.privateKey);
const firstAccountPublicKey = firstAccountPrivateKey.publicKey;
const secondAccountPublicKey = secondAccountPrivateKey.publicKey;

client.setOperator(firstAccount.id, firstAccountPrivateKey);

let thresholdKeyList = new KeyList();
let topicId: string;

Given(/^a first account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = firstAccount;
  const account: AccountId = AccountId.fromString(acc.id);
  this.account = account
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.privKey = privKey
  client.setOperator(this.account, privKey);

  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = secondAccount;
  const account: AccountId = AccountId.fromString(acc.id);
  this.account = account
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.privKey = privKey
  client.setOperator(this.account, privKey);

  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, async function (requiredSigns: number, totalSigns: number) {
  thresholdKeyList = new KeyList([firstAccountPublicKey, secondAccountPublicKey], requiredSigns);
});

When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo: string) {
  const transaction = new TopicCreateTransaction()
    .setAdminKey(client.operatorPublicKey!)
    .setSubmitKey(thresholdKeyList)
    .setTopicMemo(memo)
    .freezeWith(client);
  const signedTx = await transaction.sign(firstAccountPrivateKey);
  const executedTx = await signedTx.execute(client);
  const receipt = await executedTx.getReceipt(client);
  topicId = receipt.topicId?.toString()!;
  assert.ok(topicId);
});

When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/, async function (memo: string) {
  const transaction = new TopicCreateTransaction()
    .setAdminKey(client.operatorPublicKey!)
    .setSubmitKey(firstAccountPublicKey)
    .setTopicMemo(memo)
    .freezeWith(client);
  const signedTx = await transaction.sign(firstAccountPrivateKey);
  const executedTx = await signedTx.execute(client);
  const receipt = await executedTx.getReceipt(client);
  topicId = receipt.topicId?.toString()!;
  assert.ok(topicId);
});

When(/^The message "([^"]*)" is published to the topic$/, async function (message: string) {
  let transaction = new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(message)
    .freezeWith(client);
  const signedTx = await transaction.sign(firstAccountPrivateKey);
  const executedTx = await signedTx.execute(client);
  const receipt = await executedTx.getReceipt(client);
  console.log(`Message ${message} sent to topic ${topicId}`);
  assert.ok(receipt.status._code === 22);
});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/, async function (message: string) {
});
