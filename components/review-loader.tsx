"use client";

import dynamic from "next/dynamic";
import type { PairAuditProps } from "@/components/pair-audit-workspace";
import type { ReviewWorkspaceProps } from "@/components/review-workspace";

/**
 * The review screens are drawn in the browser only. Each starts from
 * answers saved in that browser, which the server cannot know, so drawing
 * them there first would show an empty form and then replace it.
 */
const loading = () => (
  <p className="p-6 text-sm text-muted-foreground">Loading the record...</p>
);
const Review = dynamic(() => import("@/components/review-workspace"), { ssr: false, loading });
const Audit = dynamic(() => import("@/components/pair-audit-workspace"), { ssr: false, loading });

export function ReviewLoader(props: ReviewWorkspaceProps) {
  return <Review {...props} />;
}
export function PairAuditLoader(props: PairAuditProps) {
  return <Audit {...props} />;
}
