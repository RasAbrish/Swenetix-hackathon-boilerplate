// Stable colour per user id so the same person always looks the same in the presence bar.
export const colorFor = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }
  return `hsl(${hash}, 55%, 45%)`;
};
