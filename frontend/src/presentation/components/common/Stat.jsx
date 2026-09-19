export function Stat({ icon: Icon, label, value, accent }) {
  return <div className={`stat ${accent ? "accent" : ""}`}><div className="stat-icon"><Icon size={20} /></div><div><span>{label}</span><strong>{value}</strong></div></div>;
}
