// compress.mjs — 分层展示（不做语义压缩）
export function compress(text, tier) {
  // 不做压缩，保留完整 summary 用于检索
  // 展示时根据 tier 决定返回内容
  return text;
}

export function displaySummary(summary, tier) {
  // 展示时的过滤逻辑
  if (tier === 'fresh' || tier === 'recent') {
    return summary; // 完整展示
  }
  
  if (tier === 'faded') {
    return summary; // 完整 summary，但标注"详细内容已归档"
  }
  
  if (tier === 'ghost') {
    // 只展示前15字 + 省略号
    return `[已归档] ${summary.slice(0, 15)}...`;
  }
  
  return summary;
}
