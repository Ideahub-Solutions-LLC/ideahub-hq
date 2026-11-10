/** A pending delivery approval does not undo a completed content review. */
export function libraryColumn(
  artifact: { id: string; status: string },
  pending: { artifactId: string | null; actionType: string }[],
): "Drafts" | "Needs review" | "Reviewed" {
  if (artifact.status === "reviewed") return "Reviewed";
  return pending.some(
    (p) => p.artifactId === artifact.id && p.actionType === "review_draft",
  )
    ? "Needs review"
    : "Drafts";
}
