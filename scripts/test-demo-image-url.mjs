import assert from "node:assert/strict";
import { localDemoPhoto } from "../lib/demo-image-url.ts";

const source = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=650&q=80";
assert.equal(localDemoPhoto(source), "/api/demo-image/photo-1505740420928-5e560c06d30e");
assert.equal(localDemoPhoto("/uploads/abc.jpg"), "/uploads/abc.jpg");
assert.equal(localDemoPhoto("https://shop.example/image.jpg"), "https://shop.example/image.jpg");
assert.equal(localDemoPhoto("https://images.unsplash.com/photo-invalid"), "https://images.unsplash.com/photo-invalid");
assert.equal(localDemoPhoto("https://images.unsplash.com.evil.example/photo-1505740420928-5e560c06d30e"),
  "https://images.unsplash.com.evil.example/photo-1505740420928-5e560c06d30e");
assert.equal(localDemoPhoto("https://images.unsplash.com/photo-1505740420928-5e560c06d30e/extra"),
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e/extra");
console.log("Demo-photo routing tests passed.");
