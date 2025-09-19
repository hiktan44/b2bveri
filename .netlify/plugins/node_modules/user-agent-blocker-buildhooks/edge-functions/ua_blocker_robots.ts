// src/supportedUserAgents.ts
var supportedUserAgents = [
  "GPTBot",
  "GoogleOther",
  "PetalBot",
  "Factset_spyderbot",
  "LINER Bot",
  "ClaudeBot",
  "Timpibot",
  "GoogleBot",
  "BingBot",
  "YandexBot",
  "DuckDuckBot",
  "SemrushBot",
  "AhrefsBot",
  "AhrefsSiteAudit",
  "AwarioBot",
  "DotBot",
  "MJ12bot"
];

// src/edge-functions/robots.ts
var robots_default = async (_request, context) => {
  const policy = Netlify.env.get("USER_AGENT_BLOCKER_ROBOTS_POLICY") || "";
  const response = await context.next();
  let text = `User-agent: *
Allow: /
`;
  if (response.status === 200) {
    text = await response.text();
  }
  if (policy[0] === "1") {
    [null, ...supportedUserAgents].forEach((ua, i) => {
      if (ua && policy.charCodeAt(1 + Math.round(i / 5)) & 1 << i % 5) {
        text += `

User-agent: ${ua}
Disallow: /`;
      }
    });
  }
  return new Response(text, {
    status: 200,
    headers: {
      "Content-Type": "text/plain"
    }
  });
};
var config = {
  path: "/robots.txt"
};
export {
  config,
  robots_default as default
};
