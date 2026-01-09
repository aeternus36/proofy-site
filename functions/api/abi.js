/**
 * ABI för Proofy.sol (exakt enligt kontraktet du skickade).
 * UI berörs inte.
 */

export const ABI = [
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
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "refId", type: "bytes32" }],
    outputs: [{ name: "ts", type: "uint64" }],
  },
  {
    type: "function",
    name: "registerIfMissing",
    stateMutability: "nonpayable",
    inputs: [{ name: "refId", type: "bytes32" }],
    outputs: [
      { name: "created", type: "bool" },
      { name: "ts", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "exists",
    stateMutability: "view",
    inputs: [{ name: "refId", type: "bytes32" }],
    outputs: [{ name: "ok", type: "bool" }],
  },
  {
    type: "function",
    name: "registeredAt",
    stateMutability: "view",
    inputs: [{ name: "refId", type: "bytes32" }],
    outputs: [{ name: "ts", type: "uint64" }],
  },
  {
    type: "function",
    name: "get",
    stateMutability: "view",
    inputs: [{ name: "refId", type: "bytes32" }],
    outputs: [
      { name: "ok", type: "bool" },
      { name: "ts", type: "uint64" },
    ],
  },
];
