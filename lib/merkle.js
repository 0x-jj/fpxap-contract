const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const Scores = require("../scores.json");

function getMerkleRoots() {
  // We get the contract to deploy
  let singles = [];
  let doubles = [];

  for (const [address, points] of Object.entries(Scores)) {
    const hash = keccak256(address);
    singles.push(hash);
    if (points >= 2) {
      doubles.push(hash);
    }
  }

  const SINGLE_MERKLE_TREE = new MerkleTree(singles, keccak256, {
    sortPairs: true,
  });

  const DOUBLE_MERKLE_TREE = new MerkleTree(doubles, keccak256, {
    sortPairs: true,
  });

  singleMerkleRoot = SINGLE_MERKLE_TREE.getRoot();
  doubleMerkleRoot = DOUBLE_MERKLE_TREE.getRoot();

  return { single: singleMerkleRoot, double: doubleMerkleRoot };
}

module.exports = { getMerkleRoots };
