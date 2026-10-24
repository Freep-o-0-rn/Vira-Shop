import Shop from "@/components/shop";

/**
 * The storefront's canonical landing page.
 * Served at /home directly, and at / via a beforeFiles rewrite.
 * This provides an independent routing path for Windows installations
 * whose compiled root page unexpectedly responds with 404.
 */
export default function StorefrontHomePage() {
  return <Shop initialView="home" />;
}
