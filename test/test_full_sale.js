const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const toWei = ethers.utils.parseEther;

const PRICE = toWei("2"); // 2 eth
const MAX_PRESALE_MINTS = 250;
const MAX_RESERVED_MINTS = 30;
const MAX_SUPPLY = 750;
const MAX_MINT_PER_TX = 2;

const COLLECTION_INFO = [PRICE, MAX_PRESALE_MINTS, MAX_RESERVED_MINTS, MAX_SUPPLY, MAX_MINT_PER_TX];

const DEPLOYER_SPLIT = 80; // 8%
const ADMIN_1_SPLIT = 184; // 18.4 %
const ADMIN_2_SPLIT = 736; // 73.6 %

const PRINTS_ADDRESS = "0x4dd28568d05f09b02220b09c2cb307bfd837cb95";

describe("Full Sale", async function () {
  let CONTRACT;
  let DEPLOYER;
  let ADMIN_1;
  let ADMIN_2;
  let ADMIN_3;

  let singleMerkleRoot;
  let doubleMerkleRoot;

  let signers;

  before(async () => {
    signers = await ethers.getSigners();
    [DEPLOYER, ADMIN_1, ADMIN_2, ADMIN_3] = signers.splice(0, 4);

    const singleMintLeaves = [];
    const doubleMintLeaves = [];

    signers.forEach((s, i) => {
      const addr = keccak256(s.address);
      singleMintLeaves.push(addr);
      if (i % 2 === 0) {
        doubleMintLeaves.push(addr);
      }
    });

    SINGLE_MERKLE_TREE = new MerkleTree(singleMintLeaves, keccak256, { sortPairs: true });
    DOUBLE_MERKLE_TREE = new MerkleTree(doubleMintLeaves, keccak256, { sortPairs: true });

    singleMerkleRoot = SINGLE_MERKLE_TREE.getRoot();
    doubleMerkleRoot = DOUBLE_MERKLE_TREE.getRoot();

    const APxFP = await ethers.getContractFactory("APxFP");
    CONTRACT = await APxFP.deploy(
      [DEPLOYER.address, ADMIN_1.address, ADMIN_2.address],
      [DEPLOYER_SPLIT, ADMIN_1_SPLIT, ADMIN_2_SPLIT],
      [ADMIN_1.address, ADMIN_2.address, ADMIN_3.address],
      COLLECTION_INFO,
      singleMerkleRoot,
      doubleMerkleRoot,
      PRINTS_ADDRESS
    );
  });

  it("Runs as expected", async function () {
    // Mint one up front
    await CONTRACT.connect(DEPLOYER).mintReserved(1);

    // Try to mint presale before its open
    const badLeaf = keccak256(signers[302].address);
    const badMerkleProof = DOUBLE_MERKLE_TREE.getHexProof(badLeaf);
    await expect(
      CONTRACT.connect(signers[302]).purchasePresale(2, badMerkleProof, { value: toWei(String(2 * 2)) })
    ).to.revertedWith("PresaleNotOpen");

    // Now we can start the presale
    await CONTRACT.connect(ADMIN_1).startPresale();

    // Let everyone mint
    let total = 0;
    for (let i = 0; i < MAX_PRESALE_MINTS; i++) {
      const leaf = keccak256(signers[i].address);
      let merkleProof;
      let count;
      if (i % 2 === 0) {
        // Double whitelisted
        if (i > 100) {
          // Actually mint two
          merkleProof = DOUBLE_MERKLE_TREE.getHexProof(leaf);
          count = 2;
        } else {
          merkleProof = SINGLE_MERKLE_TREE.getHexProof(leaf);
          count = 1;
        }
      } else {
        merkleProof = SINGLE_MERKLE_TREE.getHexProof(leaf);
        count = 1;
      }
      await CONTRACT.connect(signers[i]).purchasePresale(count, merkleProof, { value: toWei(String(2 * count)) });
      total += count;
      if (total >= 248) break;
    }
    const leaf = keccak256(signers[302].address);
    const merkleProof = DOUBLE_MERKLE_TREE.getHexProof(leaf);
    await CONTRACT.connect(signers[302]).purchasePresale(2, merkleProof, { value: toWei(String(2 * 2)) });

    // Now we have minted 250, try to mint one more
    await expect(
      CONTRACT.connect(signers[304]).purchasePresale(2, merkleProof, { value: toWei(String(2 * 2)) })
    ).to.revertedWith("PresaleSoldOut");
    await expect(CONTRACT.connect(signers[304]).purchasePresale(1, merkleProof, { value: toWei("2") })).to.revertedWith(
      "PresaleSoldOut"
    );

    let totalSupply = await CONTRACT.totalSupply();
    expect(totalSupply).to.equal(1 + MAX_PRESALE_MINTS);

    // Try to mint public sale before is open
    await expect(CONTRACT.connect(signers[0]).purchase(1, { value: toWei(String(2)) })).to.revertedWith(
      "PublicSaleNotOpen"
    );

    // Fast forward to public sale being open
    for (let i = 0; i < 239; i++) {
      await network.provider.send("evm_mine");
    }

    // Now mint the rest of the supply
    total = 0;
    for (let i = 0; i < 720 - 250; i++) {
      let count = i % 2 === 0 ? 2 : 1;
      await CONTRACT.connect(signers[i]).purchase(count, { value: toWei(String(2 * count)) });
      total += count;
      if (total >= 468) break;
    }
    await CONTRACT.connect(signers[0]).purchase(2, { value: toWei(String(2 * 2)) });

    // Try to mint another
    await expect(CONTRACT.connect(ADMIN_1).purchase(2, { value: toWei(String(2 * 2)) })).to.revertedWith(
      "CollectionSoldOut"
    );
    await expect(CONTRACT.connect(ADMIN_1).purchase(1, { value: toWei(String(2 * 1)) })).to.revertedWith(
      "CollectionSoldOut"
    );
    await expect(CONTRACT.connect(signers[10]).purchase(1, { value: toWei(String(2 * 1)) })).to.revertedWith(
      "CollectionSoldOut"
    );

    totalSupply = await CONTRACT.totalSupply();
    expect(totalSupply).to.equal(1 + MAX_PRESALE_MINTS + 720 - 250);

    // Distribute funds and make sure the amounts are right
    const originalDevBalance = await DEPLOYER.getBalance();
    const originalDaoBalance = await ADMIN_1.getBalance();
    const originalArtistBalance = await ADMIN_2.getBalance();

    await CONTRACT.connect(signers[0]).release(DEPLOYER.address);
    await CONTRACT.connect(signers[0]).release(ADMIN_1.address);
    await CONTRACT.connect(signers[0]).release(ADMIN_2.address);

    const devBalance = await DEPLOYER.getBalance();
    const daoBalance = await ADMIN_1.getBalance();
    const artistBalance = await ADMIN_2.getBalance();

    expect((devBalance.toString() - originalDevBalance.toString()) / 1e18).to.equal(
      (DEPLOYER_SPLIT / 10 / 100) * (MAX_PRESALE_MINTS + 720 - 250) * 2
    );
    expect((daoBalance.toString() - originalDaoBalance.toString()) / 1e18).to.equal(
      (ADMIN_1_SPLIT / 10 / 100) * (MAX_PRESALE_MINTS + 720 - 250) * 2
    );
    expect((artistBalance.toString() - originalArtistBalance.toString()) / 1e18).to.equal(
      (ADMIN_2_SPLIT / 10 / 100) * (MAX_PRESALE_MINTS + 720 - 250) * 2
    );

    // Admins mint the rest of their reserved tokens
    await CONTRACT.connect(ADMIN_1).mintReserved(20);
    await CONTRACT.connect(ADMIN_3).mintReserved(9);
    // Check they can't mint anymore
    await expect(CONTRACT.connect(DEPLOYER).mintReserved(1)).to.be.revertedWith("ReserveMintCountExceeded");

    // Supply is now 750
    const startingSupply = await CONTRACT.totalSupply();
    expect(startingSupply).to.equal(750);
  });
});
