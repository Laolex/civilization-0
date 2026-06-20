import { OrgRepository, closePool } from "@civ/persistence";

async function main() {
  const repo = new OrgRepository();
  await repo.createOrg({ id: "ada-collective", name: "Ada Collective", kind: "guild",
    founderId: "ada", treasury: 500, reputation: 60, goal: "grow the guild's influence", createdDay: 0 });
  await repo.addMembership({ orgId: "ada-collective", citizenId: "ada", role: "founder", joinedDay: 0 });
  await repo.addMembership({ orgId: "ada-collective", citizenId: "marcus", role: "member", joinedDay: 1 });
  await repo.addMembership({ orgId: "ada-collective", citizenId: "lena", role: "member", joinedDay: 1 });
  const ctx = await repo.loadOrgContext("ada-collective");
  console.log("Seeded org:", ctx?.org.id, "members:", ctx?.members.length);
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
