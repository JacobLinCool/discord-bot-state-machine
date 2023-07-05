import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/**/*.ts"],
    splitting: false,
    clean: true,
    bundle: false,
    esbuildOptions: (ops) => {
        ops.charset = "utf8";
        ops.keepNames = true;
    },
});
