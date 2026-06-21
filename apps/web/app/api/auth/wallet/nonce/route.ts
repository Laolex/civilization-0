import { NextResponse } from "next/server";
import { createWalletNonce, walletSignInMessage } from "@civ/persistence/src/auth-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const address = typeof b.address === "string" ? b.address.trim() : "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return NextResponse.json({ error: "valid wallet address required" }, { status: 400 });
  const nonce = await createWalletNonce(address);
  return NextResponse.json({ nonce, message: walletSignInMessage(address, nonce) });
}
