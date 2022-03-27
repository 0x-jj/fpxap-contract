// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");
const { ethers } = require("hardhat");

const toWei = ethers.utils.parseEther;

const PRICE = toWei("0.1"); // 2 eth
const MAX_PRESALE_MINTS = 5;
const MAX_RESERVED_MINTS = 10;
const MAX_SUPPLY = 50;
const MAX_MINT_PER_TX = 2;
const PRINTS_ADDRESS = "0x4dd28568d05f09b02220b09c2cb307bfd837cb95";
const FAKE_PRINTS_ADDRESS = "0x5eD8BD53B0c3fa3dEaBd345430B1A3a6A4e8BD7C";

const COLLECTION_INFO = [PRICE, MAX_PRESALE_MINTS, MAX_RESERVED_MINTS, MAX_SUPPLY, MAX_MINT_PER_TX];

const DEPLOYER_SPLIT = 80; // 8%
const ADMIN_1_SPLIT = 184; // 18.4 %
const ADMIN_2_SPLIT = 736; // 73.6 %

let CONTRACT;
let DEPLOYER;
let ADMIN_1;
let ADMIN_2;
let ADMIN_3;

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  signers = await ethers.getSigners();
  [DEPLOYER, ADMIN_1, ADMIN_2, ADMIN_3] = signers.splice(0, 4);

  const WithinWithout = await ethers.getContractFactory("WithinWithout");
  CONTRACT = await WithinWithout.deploy(
    [DEPLOYER.address, ADMIN_1.address, ADMIN_2.address],
    [DEPLOYER_SPLIT, ADMIN_1_SPLIT, ADMIN_2_SPLIT],
    [ADMIN_1.address, ADMIN_2.address, ADMIN_3.address],
    COLLECTION_INFO,
    FAKE_PRINTS_ADDRESS
  );

  console.log("Contract deployed to:", CONTRACT.address);
  console.log("Deployer to:", DEPLOYER.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
