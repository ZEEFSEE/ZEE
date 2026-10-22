export function isStockQuestion(value) {
  const text = String(value || "").trim();
  return /股票|行情|股价|涨跌|涨幅|跌幅|收盘|开盘|成交量|市值|贵州茅台|茅台|平安银行|比亚迪|宁德时代|五粮液|(?:sh|sz)?\\d{6}/i.test(text);
}

export function resolveStockCode(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || /上证指数|深证成指|创业板指|恒生指数|纳斯达克|道琼斯/.test(text)) return null;

  const aliases = [
    [/贵州茅台|茅台/, "sh600519"],
    [/平安银行/, "sz000001"],
    [/比亚迪/, "sz002594"],
    [/宁德时代/, "sz300750"],
    [/五粮液/, "sz000858"],
  ];
  for (const [pattern, code] of aliases) {
    if (pattern.test(text)) return code;
  }

  const match = text.match(/\\b(sh|sz)?(\\d{6})\\b/i);
  if (!match) return null;
  const prefix = (match[1] || "").toLowerCase();
  const digits = match[2];
  if (prefix) {
    if (prefix === "sh" && /^(600|601|603|605|688|689)/.test(digits)) return prefix + digits;
    if (prefix === "sz" && /^(000|001|002|003|300|301)/.test(digits)) return prefix + digits;
    return null;
  }
  if (/^(600|601|603|605|688|689)/.test(digits)) return "sh" + digits;
  if (/^(000|001|002|003|300|301)/.test(digits)) return "sz" + digits;
  return null;
}

export function formatQuoteSummary(q) {
  const change = Number(q.change);
  const pct = Number(q.changePercent);
  const sign = change > 0 ? "+" : "";
  const pctSign = pct > 0 ? "+" : "";
  return [
    "【本次查询行情】",
    q.name + "（" + q.code + "）",
    "最新价：" + Number(q.price).toFixed(2),
    "较前收：" + sign + change.toFixed(2) + "（" + pctSign + pct.toFixed(2) + "%）",
    "行情时间：" + (q.quoteTime || "数据源未提供"),
    "数据源：" + q.source,
    "说明：这是本次查询返回的数据，不代表持续监控；此临时问答不会写入 Mia 聊天历史或长期记忆。",
  ].join("\\n");
}
