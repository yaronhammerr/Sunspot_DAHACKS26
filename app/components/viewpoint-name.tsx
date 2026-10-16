import type { Viewpoint } from "../../lib/types";

export default function ViewpointName({ context }: { context: Viewpoint["nameContext"] }) {
  if (!context) return null;
  return <details className="viewpoint-name-note"><summary>{context.kind === "official" ? "About this place’s name" : "Named for the nearby trail or landscape"}</summary><p>{context.kind === "official" ? "This name is documented by the land manager." : "We use a descriptive name based on this location’s trail, landmark or landscape. A separate official viewpoint name hasn’t been established."}</p><div>{context.sourceUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">Naming source {index + 1}<span aria-hidden="true"> ↗</span></a>)}</div></details>;
}
