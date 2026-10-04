import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // The homepage is the overview of all events now; the old list page folds into it.
    return [{ source: "/events", destination: "/", permanent: true }];
  },
};

export default nextConfig;
