import { prisma } from "@/lib/prisma";
import { DEFAULT_DEPARTMENTS } from "@/lib/emr/constants";

// Seed the six default departments for a hospital the first time the EMR is
// opened. Idempotent — uses createMany with skipDuplicates.
export async function ensureDepartments(hospitalId: string) {
  const count = await prisma.hospitalDepartment.count({ where: { hospital_id: hospitalId } });
  if (count > 0) return;
  await prisma.hospitalDepartment.createMany({
    data: DEFAULT_DEPARTMENTS.map((d) => ({
      hospital_id: hospitalId,
      key: d.key,
      name: d.name,
      sort_order: d.sort_order,
    })),
    skipDuplicates: true,
  });
}

// Generate the next hospital number for a patient, e.g. "H-000042". Uses the
// current patient count as a base and retries on the (hospital_id, number)
// unique constraint to stay collision-free under light concurrency.
export async function generateHospitalNumber(hospitalId: string): Promise<string> {
  const base = await prisma.hospitalPatient.count({ where: { hospital_id: hospitalId } });
  let seq = base + 1;
  for (let i = 0; i < 25; i++) {
    const candidate = `H-${String(seq).padStart(6, "0")}`;
    const exists = await prisma.hospitalPatient.findFirst({
      where: { hospital_id: hospitalId, hospital_number: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
    seq++;
  }
  // Fallback: timestamp-based, effectively unique.
  return `H-${Date.now().toString().slice(-8)}`;
}
