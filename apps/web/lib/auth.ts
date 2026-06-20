import { cookies } from "next/headers";
import { readSession, type User } from "@civ/persistence/src/auth-write";

export async function getCurrentUser(): Promise<User | null> {
  const token = cookies().get("civ_session")?.value;
  if (!token) return null;
  return readSession(token);
}
