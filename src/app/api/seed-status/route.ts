import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [categories, tests, synonyms] = await prisma.$transaction([
    prisma.testCategory.count(),
    prisma.catalogTest.count(),
    prisma.testSynonym.count(),
  ]);

  const seededCategories = await prisma.testCategory.findMany({
    select: { name: true, slug: true, _count: { select: { tests: true } } },
    orderBy: { sort_order: "asc" },
  });

  return NextResponse.json({ categories, tests, synonyms, detail: seededCategories });
}
