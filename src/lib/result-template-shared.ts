/**
 * Shared shape + normaliser for result-template parameters (analytes).
 * Pure and dependency-free so it can be imported by both server routes and
 * client components.
 *
 * The three coding fields (`loinc`, `test_code`, `specimen`) are optional and
 * only stored when non-empty — existing templates without them keep working,
 * and they let a template map cleanly onto HL7 OBX / ASTM result fields when a
 * lab connects Mirth.
 */
export interface TemplateParam {
  name: string;
  unit: string;
  reference_range: string;
  group: string;
  loinc?: string;
  test_code?: string;
  specimen?: string;
}

/**
 * Coerce an arbitrary parameter object into the canonical stored shape.
 * Returns a plain string record (no `undefined` values) so it is directly
 * assignable to Prisma's JSON input type.
 */
export function normalizeParam(p: {
  name: string;
  unit?: string | null;
  reference_range?: string | null;
  group?: string | null;
  loinc?: string | null;
  test_code?: string | null;
  specimen?: string | null;
}): Record<string, string> {
  const out: Record<string, string> = {
    name: p.name,
    unit: p.unit || "",
    reference_range: p.reference_range || "",
    group: p.group || "",
  };
  if (p.loinc && p.loinc.trim()) out.loinc = p.loinc.trim();
  if (p.test_code && p.test_code.trim()) out.test_code = p.test_code.trim();
  if (p.specimen && p.specimen.trim()) out.specimen = p.specimen.trim();
  return out;
}
