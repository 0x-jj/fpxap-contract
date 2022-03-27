require("dotenv").config();

require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("hardhat-contract-sizer");
require("hardhat-gas-reporter");

const getMerkleRoots = require("./lib/merkle").getMerkleRoots;

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts.slice(0, 10)) {
    console.log(account.address);
  }
});

task("startPresale", "Start the presale")
  .addParam("contract", "The contract address")
  .setAction(async (taskArgs) => {
    const [deployer] = await hre.ethers.getSigners();
    const contract = await ethers.getContractFactory("WithinWithout");
    const deployed = await contract.attach(taskArgs.contract);
    await deployed.connect(deployer).startPresale();
  });

task("mintReserved", "Start the presale")
  .addParam("signerindex", "Index of the address to mint from in the signers array")
  .addParam("contract", "The contract address")
  .setAction(async (taskArgs) => {
    const signers = await hre.ethers.getSigners();
    const contract = await ethers.getContractFactory("WithinWithout");
    const deployed = await contract.attach(taskArgs.contract);
    await deployed.connect(signers[taskArgs.signerindex]).mintReserved(1);
  });

task("setBaseUri", "Set the base token URI")
  .addParam("contract", "The contract address")
  .setAction(async (taskArgs) => {
    const [deployer] = await hre.ethers.getSigners();
    const contract = await ethers.getContractFactory("WithinWithout");
    const deployed = await contract.attach(taskArgs.contract);
    await deployed.connect(deployer).setBaseURI("https://www.withinwithout.xyz/api/token/metadata/");
  });

task("releaseFunds", "Release sale funds")
  .addParam("signerindex", "Index of the address to send to")
  .addParam("contract", "The contract address")
  .setAction(async (taskArgs) => {
    const signers = await hre.ethers.getSigners();
    const contract = await ethers.getContractFactory("WithinWithout");
    const deployed = await contract.attach(taskArgs.contract);
    await deployed.connect(signers[1]).release(signers[taskArgs.signerindex].address);
  });

task("setMerkleRoots", "Set the merkle roots")
  .addParam("contract", "The contract address")
  .setAction(async (taskArgs) => {
    const { single, double } = getMerkleRoots();
    const [deployer] = await hre.ethers.getSigners();
    const contract = await ethers.getContractFactory("WithinWithout");
    const deployed = await contract.attach(taskArgs.contract);
    await deployed.connect(deployer).setMerkleRoots(single, double);
  });

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.8.4",
  networks: {
    hardhat: {
      forking: {
        url: "https://eth-mainnet.alchemyapi.io/v2/6wekujGpywrlF2SrjZKufsPGO2Pt92w0",
      },
      accounts: {
        count: 1000,
        mnemonic: "genuine genuine seminar corn victory walk rotate order brand wash frozen genius",
      },
    },
    ropsten: {
      url: "https://eth-ropsten.alchemyapi.io/v2/z2EBK-6gPTa3ePDW3axYkxJa-t1-iXBw",
      accounts: {
        count: 10,
        mnemonic: "genuine genuine seminar corn victory walk rotate order brand wash frozen genius",
      },
    },
    rinkeby: {
      url: "https://eth-rinkeby.alchemyapi.io/v2/IEaMnsi7_4nufgsIVVH5Mg3BrSgoDwfq",
      accounts: {
        count: 10,
        mnemonic: "genuine genuine seminar corn victory walk rotate order brand wash frozen genius",
      },
    },
  },
  gasReporter: {
    enabled: true,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
    only: [],
  },
  mocha: {
    timeout: 2400000,
  },
};
