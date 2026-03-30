import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      status: true,
      message: "Welcome to the Poveon API.",
      data: {
        service: "poveon-api",
        version: "1.0",
        docs: "https://poveon.com/api-docs",
      },
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
