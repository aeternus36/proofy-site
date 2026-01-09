/**
 * ABI för Proofy-kontraktet.
 * OBS: UI berörs inte av denna fil.
 *
 * Innehåller:
 * - register(bytes32 hash) nonpayable
 * - getProof(bytes32 hash) view -> (uint256 timestamp, address submitter)
 * - Registered-eventet (för robust verify via loggar)
 */

export const ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "hash", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getProof",
    stateMutability: "view",
    inputs: [{ name: "hash", type: "bytes32" }],
    outputs: [
      { name: "timestamp", type: "uint256" },
      { name: "submitter", type: "address" },
    ],
  },
  // Event (baserat på din Remix-screenshot)
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "refId", type: "bytes32", indexed: true },
      { name: "timestamp", type: "uint64", indexed: false },
      { name: "by", type: "address", indexed: true },
    ],
    anonymous: false,
  },
];
