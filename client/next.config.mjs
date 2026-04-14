import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  /**
   * Large multipart uploads (e.g. many Pinterest images → captioned slideshow) exceed the
   * default 10MB buffer when Next clones the body for proxy + route handler.
   * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/middlewareClientMaxBodySize
   */
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
