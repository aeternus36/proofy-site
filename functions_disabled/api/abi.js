export const ABI = [
{
"type": "function",
"name": "register",
"stateMutability": "nonpayable",
"inputs": [{ "name": "hash", "type": "bytes32" }],
"outputs": []
},
{
"type": "function",
"name": "getProof",
"stateMutability": "view",
"inputs": [{ "name": "hash", "type": "bytes32" }],
"outputs": [
{ "name": "timestamp", "type": "uint256" },
{ "name": "submitter", "type": "address" }
]
}
];
