import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

/*
 * eslint-config-next v16 ships native FLAT configs (arrays) at these subpaths.
 * The previous version was consumed through @eslint/eslintrc's FlatCompat
 * (`compat.extends("next/core-web-vitals", "next/typescript")`), which the v16
 * package no longer supports. This is a LINT-CONFIG-ONLY change — no runtime
 * or application behaviour is affected.
 */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
