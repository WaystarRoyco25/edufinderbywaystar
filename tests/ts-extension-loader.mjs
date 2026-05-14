export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const shouldTryTs =
      error &&
      error.code === "ERR_MODULE_NOT_FOUND" &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !specifier.endsWith(".ts") &&
      !specifier.endsWith(".tsx") &&
      !specifier.endsWith(".mjs") &&
      !specifier.endsWith(".js");

    if (!shouldTryTs) throw error;
    return nextResolve(`${specifier}.ts`, context);
  }
}
