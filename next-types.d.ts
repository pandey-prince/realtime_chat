/// <reference types="next" />
/// <reference types="next/image-types/global" />

declare module "next/types.js" {
  export type { ResolvingMetadata, ResolvingViewport } from "next";
}

declare module "next/server.js" {
  export type { NextRequest, NextResponse } from "next/server";
}
