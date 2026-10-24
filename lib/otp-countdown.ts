/**
 * Deadline-based OTP countdown. This uses wall-clock time, not a decrementing
 * counter, so a suspended phone tab and page refresh cannot pause the clock.
 */
export function secondsUntil(deadlineMs:number,nowMs:number):number {
 if(!Number.isFinite(deadlineMs)||deadlineMs<=0)return 0;
 return Math.max(0,Math.ceil((deadlineMs-nowMs)/1000));
}
export function formatOtpCountdown(deadlineMs:number,nowMs:number):string {
 const seconds=secondsUntil(deadlineMs,nowMs);
 return String(Math.floor(seconds/60)).padStart(2,"0")+":"+
  String(seconds%60).padStart(2,"0");
}
