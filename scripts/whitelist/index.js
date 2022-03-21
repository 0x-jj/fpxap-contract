require("dotenv").config();

const { ethers } = require("hardhat");
const FpABI = require("./abis/ERC20.json");
const ERC721ABI = require("./abis/ERC721.json");
const axios = require("axios");
const fs = require("fs");

const rpcProvider = new ethers.providers.JsonRpcProvider(process.env.ALCHEMY_URL);

async function fingerprintsMembers() {
  const contractAddr = "0x4dd28568D05f09b02220b09C2cb307bFd837cb95";
  const provider = new ethers.providers.WebSocketProvider(process.env.ALCHEMY_WEBSOCKET);
  const contract = new ethers.Contract(contractAddr, FpABI, provider);

  let wallets = {};

  let eventFilter = contract.filters.Transfer();
  let events = await contract.queryFilter(eventFilter);

  // Replay all transfer events
  for (const evt of events) {
    for (const addr of [evt.args.from, evt.args.to]) {
      if (!(addr in wallets)) {
        wallets[addr] = ethers.BigNumber.from(0);
      }
    }

    wallets[evt.args.from] = wallets[evt.args.from].sub(evt.args.value);
    wallets[evt.args.to] = wallets[evt.args.to].add(evt.args.value);
  }

  const members = [];
  const wei = ethers.BigNumber.from(10).pow(18);
  for (const addr in wallets) {
    if (wallets[addr].div(wei) > 1000) {
      members.push(addr);
    }
  }
  return members;
}

async function getAssetsFromOpensea(collection_slug, limit, cursor) {
  try {
    const args = cursor
      ? {
          collection_slug,
          limit,
          cursor,
        }
      : {
          collection_slug,
          limit,
        };
    const params = new URLSearchParams(args);

    const response = await axios.get("https://api.opensea.io/api/v1/assets?" + params, {
      headers: {
        "X-API-KEY": process.env.OPENSEA_KEY,
      },
    });
    const responseData = response.data;
    return { assets: responseData.assets, next: responseData.next };
  } catch (e) {
    console.log(e);
    return [];
  }
}

async function getAssetsForCollectionFromOpensea(collection_slug) {
  const limit = 50; // Max allowed by api
  let assets = [];
  let allAssets = [];
  let next = null;

  do {
    console.log(`Fetching ${limit} assets with cursor=${next}. Total retrieved ${allAssets.length}`);
    const rv = await getAssetsFromOpensea(collection_slug, limit, next);
    assets = rv.assets;
    next = rv.next;
    allAssets.push(...assets);
  } while (next);

  console.log(`Retrieved ${allAssets.length} total!`);
  return allAssets;
}

async function avidLinesOwners() {
  const allAssets = await getAssetsForCollectionFromOpensea("avid-lines");
  return allAssets.map((asset) => asset.owner.address);
}

async function jimsOwners() {
  const allAssets = await getAssetsForCollectionFromOpensea("the-jims");
  return allAssets.map((asset) => asset.owner.address);
}

async function artBlocksOwners() {
  const apps = await getAssetsForCollectionFromOpensea("apparitions-by-aaron-penne");
  const returns = await getAssetsForCollectionFromOpensea("return-by-aaron-penne");
  const rituals = await getAssetsForCollectionFromOpensea("rituals-venice-by-aaron-penne-x-boreta");

  const all = apps.concat(returns, rituals);
  return all.map((asset) => asset.owner.address);
}

async function getFoundationOwners(ids) {
  const contract = new ethers.Contract("0x3b3ee1931dc30c1957379fac9aba94d1c48a5405", ERC721ABI, rpcProvider);
  let owners = [];
  for (let id of ids) {
    let o = await contract.ownerOf(id);
    owners.push(o);
  }
  return owners;
}

async function getSuperRareOwners(ids) {
  const contract = new ethers.Contract("0xb932a70A57673d89f4acfFBE830E8ed7f75Fb9e0", ERC721ABI, rpcProvider);
  let owners = [];
  for (let id of ids) {
    let o = await contract.ownerOf(id);
    owners.push(o);
  }
  return owners;
}

async function oneOfOneOwners() {
  const foundationTokens = [7159, 386, 74075];
  const superRareTokens = [24828, 24827, 24826, 22920];
  const openSeaSlug = "aaronpenne";

  const f = await getFoundationOwners(foundationTokens);
  const sr = await getSuperRareOwners(superRareTokens);
  let os = await getAssetsForCollectionFromOpensea(openSeaSlug);
  os = os.map((asset) => asset.owner.address);
  return f.concat(sr, os);
}

async function main() {
  console.log("Getting prints members");
  const fp = await fingerprintsMembers();
  console.log(`There are ${fp.length} fp members`);

  console.log("Getting avidlines owners");
  const al = await avidLinesOwners();
  console.log(`There are ${al.length} avidlines owners`);

  console.log("Getting jims owners");
  const jims = await jimsOwners();
  console.log(`There are ${jims.length} jims owners`);

  console.log("Getting art blocks owners");
  const ab = await artBlocksOwners();
  console.log(`There are ${ab.length} art blocks owners`);

  console.log("Getting one of one owners");
  const ooo = await oneOfOneOwners();
  console.log(`There are ${ooo.length} one of one owners`);

  const owners = fp.concat(al, jims, ab, ooo);

  const count = {};
  for (const owner of owners) {
    const checksumed = ethers.utils.getAddress(owner);
    if (count[checksumed]) {
      count[checksumed] += 1;
    } else {
      count[checksumed] = 1;
    }
  }

  fs.writeFileSync("scores.json", JSON.stringify(count));
  console.log(Object.keys(count).length);
}

main();
