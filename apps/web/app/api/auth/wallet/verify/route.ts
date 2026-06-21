import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { consumeWalletNonce, upsertWalletUser, createSession, walletSignInMessage } from "@civ/persistence/src/auth-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const COOKIE = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.COOKIE_SECURE === "1", maxAge: 60 * 60 * 24 * 7 };

export async function POST(req: Request) {
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const address = typeof b.address === "string" ? b.address.trim() : "";
  const signature = typeof b.signature === "string" ? b.signature : "";
  const nonce = typeof b.nonce === "string" ? b.nonce : "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address) || !signature || !nonce)
    return NextResponse.json({ error: "address, signature and nonce required" }, { status: 400 });

  // The nonce must be one we issued + unconsumed; the signature must recover to the address.
  const message = walletSignInMessage(address, nonce);
  let recovered: string;
  try { recovered = ethers.verifyMessage(message, signature); }
  catch { return NextResponse.json({ error: "bad signature" }, { status: 401 }); }
  if (recovered.toLowerCase() !== address.toLowerCase())
    return NextResponse.json({ error: "signature does not match wallet" }, { status: 401 });
  if (!(await consumeWalletNonce(address, nonce)))
    return NextResponse.json({ error: "nonce expired — try again" }, { status: 401 });

  const user = await upsertWalletUser(address);
  const token = await createSession(user.id);
  const res = NextResponse.json({ user }, { status: 200 });
  res.cookies.set("civ_session", token, COOKIE);
  return res;
}
