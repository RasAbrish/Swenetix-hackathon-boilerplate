const STEP = 1000;

// Fractional ordering: a card dropped between two neighbours gets the midpoint of their
// positions, so only the moved card is written. `neighbours` is the target column
// WITHOUT the dragged card, in display order, and `index` is where it is being inserted.
export const computePosition = (neighbours: { position: number }[], index: number): number => {
  const prev = index > 0 ? neighbours[index - 1].position : undefined;
  const next = index < neighbours.length ? neighbours[index].position : undefined;

  if (prev === undefined && next === undefined) return STEP;
  if (prev === undefined) return (next as number) - STEP;
  if (next === undefined) return prev + STEP;
  return (prev + next) / 2;
};
