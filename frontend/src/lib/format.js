export function formatPrice(price) {
  return `৳${new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 }).format(price || 0)}`;
}

// Total is always the sum of selected parts so removals/undos can never drift.
export function sumBuild(build) {
  return Object.values(build).reduce((sum, item) => sum + (item?.price || 0), 0);
}
