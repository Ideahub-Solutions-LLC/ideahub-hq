import nextConfig from "eslint-config-next";

const config = [
  {
    ignores: [".next/**", "node_modules/**", "drizzle/**", "data/**"],
  },
  ...nextConfig,
];

export default config;
