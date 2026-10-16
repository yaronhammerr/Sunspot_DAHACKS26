export type SourceFact<T> = {
  value: T | null;
  status: "reported" | "estimated" | "unknown" | "conflicting";
  sourceIds: string[];
  checkedAt: string | null;
  note?: string;
};
export type VisitSource = { id: string; title: string; url: string; publisher: string; retrievedAt: string; sha256?: string; kind: "official" | "community" };
export type TrailRoute = {
  id: string; name: string; start: string; startCoordinates?: { lat: number; lng: number; sourceId: string }; distanceType: "round-trip" | "loop" | "one-way" | "network" | "unknown";
  distanceMiles: SourceFact<number>; elevationGainFeet: SourceFact<number>; durationMinutes: SourceFact<string>;
  terrain: SourceFact<string>; difficulty: SourceFact<string>; accessibility: SourceFact<string>;
  stairs: SourceFact<string>; estimatedSteps: SourceFact<[number, number]>;
  notes?: string;
};
export type VisitProfile = {
  reviewStatus: "official-source-reviewed" | "community-mapped" | "needs-research";
  reviewedAt: string | null;
  manager: SourceFact<string>; hours: SourceFact<string>; fees: SourceFact<string>; parking: SourceFact<string>;
  elevationFeet: SourceFact<number>; terrain: SourceFact<string>; accessibility: SourceFact<string>;
  facilities: SourceFact<string>; seasonalAccess: SourceFact<string>; cautions: SourceFact<string>;
  rules: { dogs: SourceFact<string>; bicycles: SourceFact<string>; drones: SourceFact<string>; fires: SourceFact<string>; camping: SourceFact<string>; other: SourceFact<string> };
  routes: TrailRoute[]; sources: VisitSource[];
  alertsUrl: string; mapUrl: string | null; coordinateNote: string;
};
export function isFactStale(fact: Pick<SourceFact<unknown>, "checkedAt">, now = Date.now(), maxDays = 30) {
  return !fact.checkedAt || !Number.isFinite(Date.parse(fact.checkedAt)) || now - Date.parse(fact.checkedAt) > maxDays * 86400000;
}
