"use client";
import { useEffect, useId, useState } from "react";
import { Sparkles } from "lucide-react";
import { motionPreference, setMotionPreference, type MotionPreference } from "../../lib/motion";
import ThemedSelect from "./themed-select";
export default function MotionSetting() {
  const id = useId(), [value, setValue] = useState<MotionPreference>("system");
  useEffect(() => { setValue(motionPreference()); }, []);
  return <div className="motion-setting"><label htmlFor={id}><Sparkles size={15} /><span>Transitions<small>Choose how Sunspot moves</small></span></label><ThemedSelect id={id} label="Sunspot animation preference" value={value} options={[{ value: "full", label: "Smooth" }, { value: "reduced", label: "Minimal" }, { value: "system", label: "Use device" }]} onChange={v => { const next = v as MotionPreference; setValue(next); setMotionPreference(next); }} /></div>;
}
