import { createPublicClient, http, isHex, isAddress, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function normalizeHexWith0x(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function isValidPrivateKeyHex(pk) {
  return (
    typeof pk === "string" &&
    pk.startsWith("0x") &&
    pk.length === 66 &&
    isHex(pk)
  );
}

function normalizeAddress(addr) {
  if (typeof addr !== "string") return "";
  return addr.trim();
}

export async function onRequest({ env }) {
  try {
    const rpcUrl = String(env.AMOY_RPC_URL || "").trim();

    // Föredra publik adress för ren statuskontroll (ingen hemlighet behövs).
    const configuredAddress = normalizeAddress(env.PROOFY_WALLET_ADDRESS);

    // Fallback: härledning av adress via hemlig nyckel (endast om adress saknas).
    const privateKey = normalizeHexWith0x(env.PROOFY_PRIVATE_KEY);

    if (!rpcUrl) {
      return json(500, {
        ok: false,
        error: "Saknar AMOY_RPC_URL (anslutningsadress till nätverket).",
      });
    }

    let address = "";

    if (configuredAddress) {
      if (!isAddress(configuredAddress)) {
        return json(500, {
          ok: false,
          error:
            "PROOFY_WALLET_ADDRESS är angiven men har fel format (förväntad adress).",
        });
      }
      address = configuredAddress;
    } else {
      if (!isValidPrivateKeyHex(privateKey)) {
        return json(500, {
          ok: false,
          error:
            "Saknar tjänsteadress. Ange PROOFY_WALLET_ADDRESS (rekommenderas) eller korrekt PROOFY_PRIVATE_KEY.",
        });
      }
      const account = privateKeyToAccount(privateKey);
      address = account.address;
    }

    const client = createPublicClient({
      chain: polygonAmoy,
      transport: http(rpcUrl),
    });

    const [chainId, balance] = await Promise.all([
      client.getChainId(),
      client.getBalance({ address }),
    ]);

    // Exakt, revisionsvänlig representation:
    // - balanceBaseUnit: minsta enhet som sträng
    // - balanceDisplay: decimalsträng utan flyttalsavrundning
    const balanceBaseUnit = balance.toString();
    const balanceDisplay = formatUnits(balance, 18); // 18 decimaler för detta nätverk

    return json(200, {
      ok: true,
      chainId,
      address,
      balanceBaseUnit,
      balanceDisplay,
      // För UI: neutralt språk, utan marknads-/tekniktermer.
      note:
        "Visar tillgängliga medel för att kunna betala nätverksavgifter vid registrering.",
    });
  } catch (e) {
    const msg =
      (e && typeof e === "object" && "message" in e && e.message) || String(e);
    return json(500, { ok: false, error: String(msg).slice(0, 500) });
  }
}
