// Call the MCP server like an agent would: list tools, list cities, find taste twins.
//   npx tsx scripts/mcp-smoke.ts [http://localhost:3000]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  const base = process.argv[2] ?? "http://localhost:3000";
  const client = new Client({ name: "groundswell-smoke", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", base)));
  const { tools } = await client.listTools();
  console.log("tools:", tools.map((t) => t.name).join(", "));
  const cities = await client.callTool({ name: "list_cities", arguments: {} });
  console.log(String((cities.content as { text: string }[])[0].text).split("\n").slice(0, 2).join("\n"));
  const twins = await client.callTool({ name: "taste_twins", arguments: { city: "chicago", district: 4 } });
  console.log((twins.content as { text: string }[])[0].text);
  await client.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
