/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for the Cloud Run container (see Dockerfile).
  output: "standalone",
  serverExternalPackages: ["@google-cloud/firestore", "@google-cloud/storage", "sharp"],
};

export default nextConfig;
