const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
const PRINTS_ADDRESS = "0x4dd28568d05f09b02220b09c2cb307bfd837cb95";

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

describe("WithinWithout", async function () {
  let CONTRACT;
  let DEPLOYER;
  let ADMIN_1;
  let ADMIN_2;
  let ADMIN_3;
  let NON_ADMIN;

  let SINGLE_WHITELISTED_NON_ADMIN;
  let DOUBLE_WHITELISTED_NON_ADMIN;

  let SINGLE_MERKLE_TREE;
  let DOUBLE_MERKLE_TREE;

  let singleMerkleRoot;
  let doubleMerkleRoot;

  before(async () => {
    [DEPLOYER, ADMIN_1, ADMIN_2, ADMIN_3, NON_ADMIN, SINGLE_WHITELISTED_NON_ADMIN, DOUBLE_WHITELISTED_NON_ADMIN] =
      await ethers.getSigners();
    const singleMintLeaves = [SINGLE_WHITELISTED_NON_ADMIN.address, DOUBLE_WHITELISTED_NON_ADMIN.address].map((addr) =>
      keccak256(addr)
    );
    const doubleMintLeaves = [DOUBLE_WHITELISTED_NON_ADMIN.address].map((addr) => keccak256(addr));
    SINGLE_MERKLE_TREE = new MerkleTree(singleMintLeaves, keccak256, { sortPairs: true });
    DOUBLE_MERKLE_TREE = new MerkleTree(doubleMintLeaves, keccak256, { sortPairs: true });
    singleMerkleRoot = SINGLE_MERKLE_TREE.getRoot();
    doubleMerkleRoot = DOUBLE_MERKLE_TREE.getRoot();
  });

  beforeEach(async () => {
    const WithinWithout = await ethers.getContractFactory("WithinWithout");
    CONTRACT = await WithinWithout.deploy(
      [DEPLOYER.address, ADMIN_1.address, ADMIN_2.address],
      [DEPLOYER_SPLIT, ADMIN_1_SPLIT, ADMIN_2_SPLIT],
      [ADMIN_1.address, ADMIN_2.address, ADMIN_3.address],
      COLLECTION_INFO,
      PRINTS_ADDRESS
    );
    await CONTRACT.connect(DEPLOYER).setMerkleRoots(singleMerkleRoot, doubleMerkleRoot);
    return CONTRACT;
  });

  it("Can be deployed", async function () {
    expect(CONTRACT).to.be.ok;
  });

  it("Has correct collection info", async function () {
    const collection = await CONTRACT.collection();
    let maxMintsPer = collection.maxMintsPerPurchase.toString() === "2";
    let maxPresaleMints = collection.maxPresaleMints.toString() === "250";
    let maxReservedMints = collection.maxReservedMints.toString() === "30";
    let maxTotalMints = collection.maxSupply.toString() === "750";
    let priceInWei = collection.priceInWei.toString() === "2000000000000000000";

    expect([maxMintsPer, maxPresaleMints, maxReservedMints, maxTotalMints, priceInWei].every((e) => e === true)).to.be
      .true;
  });
  it("Allows admin to mint reserved mints", async function () {
    const startingSupply = await CONTRACT.totalSupply();
    expect(startingSupply).to.equal(0);
    await CONTRACT.connect(ADMIN_1).mintReserved(3);
    const newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(3);
    const tokenData = await CONTRACT.tokenIdToTokenData(0);
    expect(tokenData.every((e) => e === true));

    const owner = await CONTRACT.ownerOf(0);
    expect(owner).to.equal(ADMIN_1.address);

    let ownedTokens = await CONTRACT.getTokensOfOwner(ADMIN_1.address);
    ownedTokens = ownedTokens.map((i) => i.toString());
    const expected = ["0", "1", "2"];
    for (let i = 0; i < expected.length; i++) {
      expect(ownedTokens[i]).to.equal(expected[i]);
    }
  });

  it("Does not allow admin to mint more than 30", async function () {
    const startingSupply = await CONTRACT.totalSupply();
    expect(startingSupply).to.equal(0);

    // Try to mint 31, it should correct to 30
    await CONTRACT.connect(ADMIN_1).mintReserved(MAX_RESERVED_MINTS + 1);
    // Try to mint again, it should fail
    await expect(CONTRACT.connect(ADMIN_1).mintReserved(1)).to.revertedWith("ReserveMintCountExceeded");
    // Supply should be 30
    const newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(30);
  });

  it("Allows each admin to mint their proper amount", async function () {
    const startingSupply = await CONTRACT.totalSupply();
    expect(startingSupply).to.equal(0);

    // First admin mints 10 (artist)
    await CONTRACT.connect(ADMIN_1).mintReserved(10);
    let newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(10);
    // and again
    await CONTRACT.connect(ADMIN_1).mintReserved(10);
    newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(20);

    // Second admin mints 10 (fingerprints)
    await CONTRACT.connect(ADMIN_2).mintReserved(10);
    newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(30);

    // Can't do any more
    await expect(CONTRACT.connect(ADMIN_1).mintReserved(1)).to.revertedWith("ReserveMintCountExceeded");
  });

  it("Does not allow non admin to mint reserved", async function () {
    const startingSupply = await CONTRACT.totalSupply();
    expect(startingSupply).to.equal(0);
    await expect(CONTRACT.connect(NON_ADMIN).mintReserved(10)).to.revertedWith(
      `AccessControl: account ${NON_ADMIN.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`
    );
    const newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(0);
  });

  it("Does not allow public sale before it has started", async function () {
    // Check if it rejects it before presale is open
    await expect(CONTRACT.connect(ADMIN_1).purchase(1)).to.revertedWith("PublicSaleNotOpen");
    let newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(0);

    // Check if it rejects it even after presale is open
    await CONTRACT.connect(ADMIN_1).startPresale();
    await expect(CONTRACT.connect(ADMIN_1).purchase(1)).to.revertedWith("PublicSaleNotOpen");
    await expect(CONTRACT.connect(NON_ADMIN).purchase(1)).to.revertedWith("PublicSaleNotOpen");
    newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(0);
  });

  it("Does not allow non admin to start presale", async function () {
    await expect(CONTRACT.connect(NON_ADMIN).startPresale()).to.revertedWith(
      `AccessControl: account ${NON_ADMIN.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`
    );
  });

  it("Allows public mint after public sale has started", async function () {
    await CONTRACT.connect(DEPLOYER).startPresale();
    for (let i = 0; i < 239; i++) {
      await network.provider.send("evm_mine");
    }
    await CONTRACT.connect(NON_ADMIN).purchase(1, { value: toWei("2") });
    await CONTRACT.connect(NON_ADMIN).purchase(2, { value: toWei("4") });

    // check wallet limiter
    await expect(CONTRACT.connect(NON_ADMIN).purchase(3, { value: toWei("6") })).to.revertedWith(
      "CountExceedsMaxMints"
    );
    await expect(CONTRACT.connect(ADMIN_1).purchase(3, { value: toWei("6") })).to.revertedWith("CountExceedsMaxMints");

    const newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(3);
  });

  it("Does not allow unreserved mints to exceed 720", async function () {
    await CONTRACT.connect(DEPLOYER).startPresale();
    for (let i = 0; i < 245; i++) {
      await network.provider.send("evm_mine");
    }
    // Mint 719 times
    for (let i = 0; i < 719; i++) {
      await CONTRACT.connect(NON_ADMIN).purchase(1, { value: toWei("2") });
    }
    let newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(719);

    // Check that if someone tries to mint 2 when there's only 1 left, they're still able to mint 1
    await CONTRACT.connect(NON_ADMIN).purchase(2, { value: toWei("4") });
    newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(720);

    // Check that if they try to mint again it reverts
    await expect(CONTRACT.connect(DEPLOYER).purchase(1, { value: toWei("2") })).to.revertedWith("CollectionSoldOut");
    newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(720);

    await expect(CONTRACT.connect(DEPLOYER).purchase(2, { value: toWei("4") })).to.revertedWith("CollectionSoldOut");
    newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(720);
  });

  it("Distributes funds correctly", async function () {
    await CONTRACT.connect(DEPLOYER).startPresale();
    for (let i = 0; i < 245; i++) {
      await network.provider.send("evm_mine");
    }
    const deployerStartBalance = await DEPLOYER.getBalance();

    for (let i = 0; i < 10; i++) {
      await CONTRACT.connect(NON_ADMIN).purchase(1, { value: toWei("2") });
    }

    await CONTRACT.connect(NON_ADMIN).release(DEPLOYER.address);
    const deployerEndBalance = await DEPLOYER.getBalance();
    expect((deployerEndBalance.toString() - deployerStartBalance.toString()) / 1e18).to.equal(
      (DEPLOYER_SPLIT / 10 / 100) * 10 * 2
    );
  });

  it("Allows whitelisted to contribute to presale", async function () {
    await CONTRACT.connect(DEPLOYER).startPresale();
    const leaf = keccak256(SINGLE_WHITELISTED_NON_ADMIN.address);
    const merkleProof = SINGLE_MERKLE_TREE.getHexProof(leaf);

    await CONTRACT.connect(SINGLE_WHITELISTED_NON_ADMIN).purchasePresale(1, merkleProof, { value: toWei("2") });

    let newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(1);
  });

  it("Does not allow premint if public sale is already open", async function () {
    await CONTRACT.connect(DEPLOYER).startPresale();
    // Start public sale
    for (let i = 0; i < 245; i++) {
      await network.provider.send("evm_mine");
    }
    const leaf = keccak256(SINGLE_WHITELISTED_NON_ADMIN.address);
    const merkleProof = SINGLE_MERKLE_TREE.getHexProof(leaf);

    await expect(
      CONTRACT.connect(SINGLE_WHITELISTED_NON_ADMIN).purchasePresale(1, merkleProof, { value: toWei("2") })
    ).to.revertedWith("PublicSaleAlreadyOpen");

    let newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(0);
  });

  it("Caps supply at 750 even if presale does not sell out", async function () {
    // Mint 1 reserved up front
    await CONTRACT.connect(ADMIN_1).mintReserved(1);
    // Start presale
    await CONTRACT.connect(DEPLOYER).startPresale();
    // Mint only 1 in presale
    const leaf = keccak256(SINGLE_WHITELISTED_NON_ADMIN.address);
    const merkleProof = SINGLE_MERKLE_TREE.getHexProof(leaf);
    await CONTRACT.connect(SINGLE_WHITELISTED_NON_ADMIN).purchasePresale(1, merkleProof, { value: toWei("2") });

    // Start public sale
    for (let i = 0; i < 245; i++) {
      await network.provider.send("evm_mine");
    }
    // Exhaust all public supply in public sale
    for (let i = 0; i < 719; i++) {
      await CONTRACT.connect(NON_ADMIN).purchase(1, { value: toWei("2") });
    }

    // Try to public mint again. Try to mint 2 but it should round it down to 1 so supply is 720 + 1
    await expect(CONTRACT.connect(NON_ADMIN).purchase(2, { value: toWei("4") })).to.revertedWith("CollectionSoldOut");

    let newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(721);

    // Mint the reserved
    await CONTRACT.connect(ADMIN_1).mintReserved(4);
    await CONTRACT.connect(ADMIN_1).mintReserved(30);
    await expect(CONTRACT.connect(ADMIN_1).mintReserved(1)).to.revertedWith("ReserveMintCountExceeded");

    newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(750);
  });

  it("Does not allow single whitelist to mint more than one in presale", async function () {
    await CONTRACT.connect(DEPLOYER).startPresale();
    const leaf = keccak256(SINGLE_WHITELISTED_NON_ADMIN.address);
    const merkleProof = SINGLE_MERKLE_TREE.getHexProof(leaf);
    const doubleMerkleProof = DOUBLE_MERKLE_TREE.getHexProof(leaf);

    // try to mint two in one
    await expect(
      CONTRACT.connect(SINGLE_WHITELISTED_NON_ADMIN).purchasePresale(2, merkleProof, { value: toWei("4") })
    ).to.revertedWith("NotEligible");
    let newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(0);

    await expect(
      CONTRACT.connect(SINGLE_WHITELISTED_NON_ADMIN).purchasePresale(2, doubleMerkleProof, { value: toWei("4") })
    ).to.revertedWith("NotEligible");
    newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(0);

    // try to mint one twice
    // first should work
    await CONTRACT.connect(SINGLE_WHITELISTED_NON_ADMIN).purchasePresale(1, merkleProof, { value: toWei("2") });
    newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(1);

    // second should fail
    await expect(
      CONTRACT.connect(SINGLE_WHITELISTED_NON_ADMIN).purchasePresale(1, merkleProof, { value: toWei("2") })
    ).to.revertedWith("AlreadyMintedInPresale");
    newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(1);
  });

  it("Allows double whitelisted to mint two in one transaction", async function () {
    await CONTRACT.connect(DEPLOYER).startPresale();
    const leaf = keccak256(DOUBLE_WHITELISTED_NON_ADMIN.address);
    const merkleProof = DOUBLE_MERKLE_TREE.getHexProof(leaf);

    await CONTRACT.connect(DOUBLE_WHITELISTED_NON_ADMIN).purchasePresale(2, merkleProof, { value: toWei("4") });

    let newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(2);
  });

  it("Allows double whitelisted to mint only one", async function () {
    await CONTRACT.connect(DEPLOYER).startPresale();
    const leaf = keccak256(DOUBLE_WHITELISTED_NON_ADMIN.address);
    const merkleProof = SINGLE_MERKLE_TREE.getHexProof(leaf);

    await CONTRACT.connect(DOUBLE_WHITELISTED_NON_ADMIN).purchasePresale(1, merkleProof, { value: toWei("2") });

    let newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(1);

    // You only get one presale mint
    await expect(
      CONTRACT.connect(DOUBLE_WHITELISTED_NON_ADMIN).purchasePresale(1, merkleProof, { value: toWei("2") })
    ).to.revertedWith("AlreadyMintedInPresale");
    newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(1);
  });

  it("Fails if not enough eth sent in presale", async function () {
    await CONTRACT.connect(DEPLOYER).startPresale();
    const leaf = keccak256(DOUBLE_WHITELISTED_NON_ADMIN.address);
    const merkleProof = SINGLE_MERKLE_TREE.getHexProof(leaf);

    await expect(
      CONTRACT.connect(DOUBLE_WHITELISTED_NON_ADMIN).purchasePresale(1, merkleProof, { value: toWei("1") })
    ).to.revertedWith("InsufficientFundsForPurchase");

    let newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(0);
  });

  it("Allows updating the baseURI", async function () {
    await CONTRACT.connect(DEPLOYER).mintReserved(1);
    const initialTokenUri = await CONTRACT.tokenURI(0);
    expect(initialTokenUri).to.equal("https://www.withinwithout.xyz/api/token/metadata/0");

    await CONTRACT.connect(DEPLOYER).setBaseURI("updated/");
    const newTokenUri = await CONTRACT.tokenURI(0);
    expect(newTokenUri).to.equal("updated/0");
  });

  it("Refunds if too much ETH is sent for count", async function () {
    await CONTRACT.connect(DEPLOYER).startPresale();
    const leaf = keccak256(DOUBLE_WHITELISTED_NON_ADMIN.address);
    const merkleProof = SINGLE_MERKLE_TREE.getHexProof(leaf);

    let startingBalance = await DOUBLE_WHITELISTED_NON_ADMIN.getBalance();
    startingBalance = startingBalance.toString();

    await CONTRACT.connect(DOUBLE_WHITELISTED_NON_ADMIN).purchasePresale(1, merkleProof, {
      value: toWei("2"),
    });
    let balance = await DOUBLE_WHITELISTED_NON_ADMIN.getBalance();
    balance = balance.toString();

    // Means they were refunded 1 eth
    expect(balance > startingBalance - 3e18).to.be.true;
    expect(balance < startingBalance - 2e18).to.be.true;

    let newSupply = await CONTRACT.totalSupply();
    expect(newSupply).to.equal(1);
  });
});
