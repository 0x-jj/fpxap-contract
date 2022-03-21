/* Listens for mint events and sends notification */
require("dotenv").config();

const ethers = require("ethers");
const ABI = require("../../artifacts/contracts/APxFP.sol/APxFP.json");
const AWS = require("aws-sdk");

AWS.config.update({
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  region: "us-east-1",
});

const sqs = new AWS.SQS();
const queueUrl = process.env.QUEUE_URL;

async function start() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.ALCHEMY_URL);

  const contract = new ethers.Contract("0x656d62e4FF1B8B239B5bb8276806288cd08aC2a2", ABI.abi, provider);
  let filter = await contract.filters.Mint();
  console.log("Listening");
  contract.on(filter, async (tokenId, minter, tokenHash, fingerprintsBalance, event) => {
    console.log(`Queued tokenId=${tokenId.toString()}`);
    await sqs
      .sendMessage({
        MessageBody: tokenId.toString(),
        QueueUrl: queueUrl,
      })
      .promise();
  });
}

start();
