import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeVerificationCode} from "../lib/verification-code.ts";

// Paste from email, including typographic spaces and line breaks.
assert.equal(normalizeVerificationCode("807035"),"807035");
assert.equal(normalizeVerificationCode("807 035"),"807035");
assert.equal(normalizeVerificationCode("807\u00a0035"),"807035");
assert.equal(normalizeVerificationCode("807\u202f035"),"807035");
assert.equal(normalizeVerificationCode("807\n035"),"807035");
assert.equal(normalizeVerificationCode(" 807-035 "), "807035");
assert.equal(normalizeVerificationCode("00 00 07"),"000007");
assert.equal(normalizeVerificationCode("807 035 123"),"807035");
assert.equal(normalizeVerificationCode("80a7-0b35"),"807035");

// maxLength=6 silently discarded the final digit BEFORE React's onChange.
// Neither OTP field must impose an HTML character limit before normalization.
const ui=readFileSync(new URL("../components/account-portal.tsx",import.meta.url),"utf8");
assert.ok(!ui.includes("maxLength={6}"),"OTP fields must not truncate pasted text before normalization");
assert.ok(ui.includes("setVerificationCode(normalizeVerificationCode(e.target.value))"));
assert.ok(ui.includes("setDeletionCode(normalizeVerificationCode(e.target.value))"));
console.log("Copied OTP formatting tests passed.");
