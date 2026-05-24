import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source:
          "/:slug((?!api(?:/|$)|b(?:/|$)|f(?:/|$)|dashboard(?:/|$)|login(?:/|$)|plans(?:/|$)|_next(?:/|$)|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$).+)",
        destination: "/f/:slug",
      },
    ];
  },
};

export default nextConfig;
