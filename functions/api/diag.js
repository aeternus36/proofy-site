import { createPublicClient, http, isHex } from "viem";
import { polygonAmoy } from "viem/chains";

const PROOFY_ABI = [
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

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function isValidAddressHex(addr) {
  return typeof addr === "string" && addr.startsWith("0x") && addr.length === 42 && isHex(addr);
}

export async function onRequest({ env }) {
  try {
    const rpcUrl = String(env.AMOY_RPC_URL || "").trim();
    const addr = String(env.PROOFY_CONTRACT_ADDRESS || "").trim();

    if (!rpcUrl || !addr) return json(500, { ok: false, error: "Missing env vars" });
    if (!isValidAddressHex(addr)) return json(500, { ok: false, error: "Bad PROOFY_CONTRACT_ADDRESS" });

    const client = createPublicClient({
      chain: polygonAmoy, // vi anger Amoy, men vi mäter också vad RPC faktiskt svarar
      transport: http(rpcUrl),
    });

    // 1) Vad säger RPC att chainId är?
    const chainId = await client.getChainId();

    // 2) Finns bytecode på adressen?
    const code = await client.getBytecode({ address: addr });

    // 3) Kan vi kalla get()?
    let getOk = null;
    let getTs = null;
    let getError = null;

    try {
      const [ok, ts] = await client.readContract({
        address: addr,
        abi: PROOFY_ABI,
        functionName: "get",
        args: ["0x" + "11".repeat(32)],
      });
      getOk = Boolean(ok);
      getTs = Number(ts);
    } catch (e) {
      getError = (e && typeof e === "object" && "message" in e) ? String(e.message).slice(0, 400) : String(e).slice(0, 400);
    }

    return json(200, {
      ok: true,
      rpcChainId: chainId,
      expectedChainId: 80002,
      bytecodePresent: !!(code && code !== "0x"),
      bytecodeSize: code ? code.length : 0,
      canCallGet: getError ? false : true,
      getSample: getError ? null : { ok: getOk, ts: getTs },
      getError,
      contractAddress: addr,
    });
  } catch (e) {
    return json(500, { ok: false, error: String(e).slice(0, 400) });
  }
}
