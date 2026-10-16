"use client";
import { useState } from "react";
import { MapPin } from "lucide-react";
import { CALIFORNIA_CITIES, type SearchLocation } from "../../lib/location";
export default function LocationPicker({ onSelect, expanded = false }: { onSelect: (location: SearchLocation) => void; expanded?: boolean }) {
  const [open, setOpen] = useState(false);
  const [city, setCity] = useState("");
  return <div className="location-picker">
    {!expanded && <button className="text-button" aria-expanded={open} onClick={() => setOpen(v => !v)}><MapPin size={15} />Choose a city instead</button>}
    {(expanded || open) && <form onSubmit={e => { e.preventDefault(); const selected = CALIFORNIA_CITIES.find(c => c.label === city); if (selected) onSelect(selected); }}>
      <label htmlFor="location-city">Explore near a city</label>
      <div><select id="location-city" value={city} onChange={e => setCity(e.target.value)} required><option value="" disabled>Choose your city</option>{[...CALIFORNIA_CITIES].sort((a, b) => a.label.localeCompare(b.label)).map(c => <option key={c.label} value={c.label}>{c.label}</option>)}</select><button className="primary-button" type="submit" disabled={!city}>Use city</button></div>
      <p>Distances will be approximate, measured from the city center. Your device location isn’t required.</p>
    </form>}
  </div>;
}
