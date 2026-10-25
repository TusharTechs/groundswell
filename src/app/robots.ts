import type { MetadataRoute } from "next";

// Until SITE_PUBLIC=1, ask search engines to stay away; the link still works for anyone who has it.
export default function robots(): MetadataRoute.Robots {
  return process.env.SITE_PUBLIC === "1" ? { rules: { userAgent: "*", allow: "/" } } : { rules: { userAgent: "*", disallow: "/" } };
}
