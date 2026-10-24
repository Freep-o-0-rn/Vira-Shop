import envLoader from "@next/env";
import {randomInt} from "node:crypto";
envLoader.loadEnvConfig(process.cwd());
const {mailConfigured,sendVerificationEmail}=await import("../lib/server/customer-mail.ts");
if(!mailConfigured()){
 console.error("Missing SMTP_USER or SMTP_PASSWORD in .env.local. No email sent.");
 process.exit(1);
}
const destination=(process.env.SMTP_USER||"").trim();
if(process.argv.includes("--check")){
 console.log("SMTP configuration present; no email was sent.");
 process.exit(0);
}
try{
 await sendVerificationEmail(destination,randomInt(0,1000000).toString().padStart(6,"0"));
 console.log("Yandex SMTP accepted a test message to "+destination+". Check the inbox/spam folder.");
}catch(error){
 console.error("SMTP test failed:",error instanceof Error?error.message:"Unknown error");
 process.exitCode=1;
}
