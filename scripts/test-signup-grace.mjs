import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";

// The registration window controls new codes (30 min). A valid code issued
// before that window closes must still verify for the full next 10 minutes.
// Simulate the user's late-email example (minute 28 -> email arrives minute 33).
const db=await PGlite.create();
try{
 const cases=await db.query(`
  WITH cases(label,deadline,code_deadline) AS (
   VALUES
    ('new', NOW()+INTERVAL '30 minutes', NOW()+INTERVAL '10 minutes'),
    ('minute33', NOW()-INTERVAL '3 minutes', NOW()+INTERVAL '5 minutes'),
    ('minute39', NOW()-INTERVAL '9 minutes', NOW()-INTERVAL '1 minute'),
    ('code_expired_minute20',NOW()+INTERVAL '10 minutes',NOW()-INTERVAL '1 minute')
  )
  SELECT label,
   deadline>NOW() AS can_request,
   (deadline>NOW() OR code_deadline>NOW()) AS can_resume,
   code_deadline>NOW() AS can_verify,
   (deadline<=NOW() AND code_deadline<=NOW()) AS should_prune
  FROM cases`);
 const byName=Object.fromEntries(cases.rows.map(row=>[row.label,row]));
 assert.deepEqual([byName.minute33.can_request,byName.minute33.can_resume,
                   byName.minute33.can_verify,byName.minute33.should_prune],
                  [false,true,true,false],"Five-minute mail delay after minute 28");
 assert.deepEqual([byName.minute39.can_request,byName.minute39.can_resume,
                   byName.minute39.can_verify,byName.minute39.should_prune],
                  [false,false,false,true],"Expired OTP after late grace period");
 assert.deepEqual([byName.code_expired_minute20.can_request,byName.code_expired_minute20.can_resume,
                   byName.code_expired_minute20.can_verify,byName.code_expired_minute20.should_prune],
                  [true,true,false,false],"Resend before minute 30 when earlier code expired");
 const sources={
  cleanup:readFileSync(new URL("../lib/server/pending-signup.ts",import.meta.url),"utf8"),
  pending:readFileSync(new URL("../app/api/account/pending/route.ts",import.meta.url),"utf8"),
  verification:readFileSync(new URL("../app/api/account/verify/route.ts",import.meta.url),"utf8"),
  resend:readFileSync(new URL("../app/api/account/resend/route.ts",import.meta.url),"utf8"),
  register:readFileSync(new URL("../app/api/account/register/route.ts",import.meta.url),"utf8"),
  portal:readFileSync(new URL("../components/account-portal.tsx",import.meta.url),"utf8"),
 };
 assert.match(sources.cleanup,/registration_expires_at<=NOW\(\) AND expires_at<=NOW\(\)/);
 assert.match(sources.pending,/registration_expires_at>NOW\(\) OR expires_at>NOW\(\)/);
 assert.match(sources.verification,/WHERE email=\$1 AND expires_at>NOW\(\)/);
 assert.match(sources.resend,/expires_at=NOW\(\)\+INTERVAL '10 minutes'/);
 assert.match(sources.register,/expires_at=EXCLUDED.expires_at/);
 assert.match(sources.portal,/now>=signupExpiresAt&&now>=codeExpiresAt/);
 console.log("Signup 30-minute window + late OTP 10-minute grace tests passed.");
}finally{await db.close();}
