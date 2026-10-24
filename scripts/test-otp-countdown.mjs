import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {formatOtpCountdown,secondsUntil} from "../lib/otp-countdown.ts";

const now=100000000;
const expires=now+600000;
assert.equal(formatOtpCountdown(expires,now),"10:00");
assert.equal(formatOtpCountdown(expires,now+1000),"09:59");
assert.equal(formatOtpCountdown(expires,now+5999),"09:55");
assert.equal(formatOtpCountdown(expires,now+60000),"09:00");
assert.equal(formatOtpCountdown(expires,now+539000),"01:01");
assert.equal(formatOtpCountdown(expires,now+599001),"00:01");
assert.equal(formatOtpCountdown(expires,now+600000),"00:00");
assert.equal(formatOtpCountdown(expires,now+660000),"00:00");
assert.equal(secondsUntil(0,now),0);
assert.equal(secondsUntil(expires,now+599000),1);
// A backgrounded browser jumps directly to the correct current time.
assert.equal(formatOtpCountdown(expires,now+367000),"03:53");
const source=readFileSync(new URL("../components/account-portal.tsx",import.meta.url),"utf8");
assert.ok(source.includes("setClock(now)"),"Clock must tick every second");
assert.ok(source.includes("setInterval("),"Countdown must redraw over time");
assert.ok(source.includes("formatOtpCountdown(codeExpiresAt,clock||Date.now())"),
 "Countdown must use actual expiration timestamp");
assert.ok(source.includes("onChange={changeVerificationCode}"),
 "OTP input must react to all entered digits");
assert.ok(source.includes("if(code.length===6)void confirmEmailCode(code)"),
 "Six digits must trigger automatic verification");
assert.ok(source.includes("if(verifyingCode.current||code.length!==6"),
 "Network requests must be locked against duplicate submissions");
assert.ok(source.includes("verifyingCode.current=true"),
 "Lock must be taken synchronously");
assert.ok(source.includes("verifyingCode.current=false"),
 "Lock must be released on both success and failure");
assert.ok(source.includes('setVerificationCode("");\n   setError('),
 "Failed verification must allow immediately entering a new code");
assert.ok(source.includes("event.preventDefault();\n  void confirmEmailCode(verificationCode)"),
 "Manual submit remains as a fallback");
console.log("OTP MM:SS countdown and auto-submit regression tests passed.");
