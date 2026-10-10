import { useState } from "react";
import { Dog, Cat } from "lucide-react";

export function PetAvatar({
  pet,
  size = "small",
}: {
  pet: { name: string; species: string; photoUrl?: string | null };
  size?: "small" | "large";
}) {
  const [broken, setBroken] = useState(false);
  const isSmall = size === "small";
  const wrapperClass = isSmall ? "w-10 h-10 rounded-full" : "w-20 h-20 rounded-2xl";

  if (pet.photoUrl && !broken) {
    return (
      <img
        src={pet.photoUrl}
        alt={pet.name}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={`${wrapperClass} object-cover ${isSmall ? "border border-line-subtle" : "border-2 border-white shadow-xs"}`}
      />
    );
  }

  return (
    <span
      className={`${isSmall ? "text-2xl" : "text-5xl"} ${wrapperClass} flex items-center justify-center ${isSmall ? "bg-sunken" : "bg-surface shadow-xs"}`}
    >
      {pet.species === "dog" ? <Dog size={isSmall ? 22 : 40} /> : <Cat size={isSmall ? 22 : 40} />}
    </span>
  );
}
