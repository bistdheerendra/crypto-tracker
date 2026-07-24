import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure ONNX model + sidecars ship with the analyze serverless function.
  outputFileTracingIncludes: {
    "/api/analyze": [
      "./ml/models/baseline_classifier.onnx",
      "./ml/models/feature_medians.json",
      "./ml/models/feature_columns.json",
    ],
  },
  serverExternalPackages: ["onnxruntime-node"],
};

export default nextConfig;
