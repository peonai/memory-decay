// compress.mjs — Layered display (no semantic compression)
export function compress(text, tier) {
  // Keep full summary for retrieval accuracy
  // Display filtering happens per tier
  return text;
}

export function displaySummary(summary, tier) {
  // Display filter by tier
  if (tier === 'fresh' || tier === 'recent') {
    return summary;
  }
  
  if (tier === 'faded') {
    return summary; // Full summary, but mark as archived
  }
  
  if (tier === 'ghost') {
    // Show only first 15 chars
    return `[archived] ${summary.slice(0, 15)}...`;
  }
  
  return summary;
}
