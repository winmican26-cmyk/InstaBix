import { cn, initials } from "@/lib/utils";

const PALETTES = [
  "from-lime/25 to-lime/5 text-lime",
  "from-violet/30 to-violet/5 text-violet",
  "from-info/25 to-info/5 text-info",
  "from-amber/25 to-amber/5 text-amber",
];

function paletteFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length]!;
}

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dimension = size === "sm" ? "size-8 text-[11px]" : size === "lg" ? "size-14 text-lg" : "size-10 text-[13px]";
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-gradient-to-br font-semibold",
        dimension,
        paletteFor(name),
        className,
      )}
      aria-hidden={!name}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
