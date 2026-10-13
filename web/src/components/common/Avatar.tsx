export default function Avatar({ fileId, name, size = 40 }: { fileId?: string | null; name: string; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (fileId) return <img src={`/api/files/${fileId}`} alt={name} className="rounded-circle object-fit-cover flex-shrink-0" style={style} />;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return <span className="rounded-circle bg-primary-subtle text-primary fw-semibold d-inline-flex align-items-center justify-content-center flex-shrink-0" style={style}>{initials}</span>;
}
