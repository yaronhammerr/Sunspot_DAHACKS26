import { ArrowUpRight, Clock3, Footprints, Info } from "lucide-react";
import type { VisitProfile } from "../../lib/visit";
import { isFactStale } from "../../lib/visit";
import { routeEffortSummary } from "../../lib/visit-summary";

export default function VisitSnapshot({ profile }: { profile: VisitProfile }) {
  const effort = routeEffortSummary(profile), hours = profile.hours;
  const caution = [profile.seasonalAccess, profile.cautions, profile.rules.other, profile.rules.fires, profile.rules.dogs].find(fact => fact.value !== null);
  const before = caution?.value ?? null;
  return <section className="visit-snapshot" aria-label="Visit at a glance"><h3>At a glance</h3><dl>
    <div><dt><Footprints size={15} />Walking effort</dt><dd>{effort.value}<small>{effort.detail}</small></dd></div>
    <div><dt><Clock3 size={15} />Published hours</dt><dd>{hours.value ?? "Hours not confirmed"}{hours.value !== null && <small>{hours.status === "conflicting" ? "Sources disagree. " : hours.status === "estimated" ? "Estimate. " : ""}{isFactStale(hours) ? "Recheck before visiting. " : ""}Published hours do not confirm current access.</small>}</dd></div>
    {before !== null && <div className="visit-snapshot-caution"><dt><Info size={15} />Before you go</dt><dd>{before}{caution?.status === "estimated" && <small>Estimate</small>}{caution?.status === "conflicting" && <small>Sources disagree</small>}{caution && isFactStale(caution) && <small>Recheck this published note before visiting.</small>}</dd></div>}
  </dl><p className="visit-snapshot-confidence">{profile.reviewStatus === "official-source-reviewed" ? "Visitor information researched from agency sources." : "Community-mapped location. Public access and area rules need confirmation."} Unknown details stay marked in the full guide.</p><a href={profile.alertsUrl} target="_blank" rel="noreferrer">{profile.reviewStatus === "official-source-reviewed" ? "Check agency updates" : "Check the location source"}<ArrowUpRight size={12} /></a></section>;
}
