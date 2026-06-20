/** @type {import("next").NextConfig} */
const nextConfig = {
  /**
   * Large multipart uploads (Pinterest image batches) can exceed the default
   * 10MB buffer when Next clones the body for proxy + route handler.
   * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/middlewareClientMaxBodySize
   */
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
